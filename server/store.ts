import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DeviceType = 'iOS' | 'Android' | 'Desktop';
export type PlanTier = 'starter' | 'business' | 'agency';
export type UserRole = 'admin' | 'client';

export type RouteCategory =
  | 'Restaurant & Cafe'
  | 'Real Estate'
  | 'Product Packaging'
  | 'Local Service'
  | 'Events & Flyers';

export interface UserProfile {
  id: string;
  email: string;
  businessName: string;
  role: UserRole;
  plan: PlanTier;
  passwordHash?: string;
  createdAt: string;
}

export interface QrRoute {
  id: string;
  ownerId: string | null;
  slug: string;
  title: string;
  category: RouteCategory;
  defaultUrl: string;
  iosUrl: string;
  androidUrl: string;
  fallbackUrl: string;
  expiresAt: string | null;
  active: boolean;
  fgColor: string;
  bgColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScanEvent {
  id: string;
  routeId: string;
  slug: string;
  timestamp: string;
  device: DeviceType;
  referrer: string;
  simulated: boolean;
}

export interface ClientInquiry {
  id: string;
  businessName: string;
  email: string;
  plan: string;
  message: string;
  status: 'New' | 'Contacted';
  createdAt: string;
}

interface DatabaseSchema {
  users: UserProfile[];
  routes: QrRoute[];
  scans: ScanEvent[];
  inquiries: ClientInquiry[];
}

export const PLAN_LIMITS: Record<
  PlanTier,
  { label: string; maxActiveRoutes: number; maxMonthlyScans: number | null; priceUsd: number }
> = {
  starter: {
    label: 'Starter',
    maxActiveRoutes: 5,
    maxMonthlyScans: 10000,
    priceUsd: 12,
  },
  business: {
    label: 'Business',
    maxActiveRoutes: 35,
    maxMonthlyScans: 100000,
    priceUsd: 29,
  },
  agency: {
    label: 'Agency',
    maxActiveRoutes: 250,
    maxMonthlyScans: null,
    priceUsd: 79,
  },
};

export type SupabaseHealthCode =
  | 'local'
  | 'ok'
  | 'missing_tables'
  | 'invalid_credentials'
  | 'connection_error';

export interface SupabaseStatus {
  configured: boolean;
  schemaReady: boolean;
  code: SupabaseHealthCode;
  message: string | null;
}

export class StoreError extends Error {
  statusCode: number;
  code: SupabaseHealthCode;

  constructor(message: string, statusCode = 503, code: SupabaseHealthCode = 'connection_error') {
    super(message);
    this.name = 'StoreError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  '';

let supabaseAdminClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabasePublicConfig(): { url: string; anonKey: string } | null {
  const publicUrl = process.env.VITE_SUPABASE_URL?.trim() || SUPABASE_URL;
  if (!publicUrl || !SUPABASE_ANON_KEY) return null;
  return { url: publicUrl, anonKey: SUPABASE_ANON_KEY };
}

export function createEphemeralSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const authKey = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
  return createClient(SUPABASE_URL, authKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdminClient;
}

function classifySupabaseError(
  err: { code?: string; message?: string } | null | undefined,
  fallbackAction: string
): StoreError {
  const code = err?.code || '';
  const rawMessage = err?.message || fallbackAction;
  const msgLower = rawMessage.toLowerCase();

  console.error('[supabase]', code || 'no-code', rawMessage);

  if (
    code === 'PGRST205' ||
    code === '42P01' ||
    msgLower.includes('does not exist') ||
    msgLower.includes('schema cache') ||
    msgLower.includes('could not find the table')
  ) {
    return new StoreError(
      'Supabase database tables are missing. Run supabase/schema.sql in your Supabase SQL Editor.',
      503,
      'missing_tables'
    );
  }

  if (
    code === 'PGRST301' ||
    msgLower.includes('invalid api key') ||
    msgLower.includes('invalid jwt') ||
    msgLower.includes('permission denied') ||
    msgLower.includes('unauthorized')
  ) {
    return new StoreError(
      'Supabase rejected the server credentials. Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      503,
      'invalid_credentials'
    );
  }

  if (code === '23505') {
    return new StoreError('A record with that unique value already exists.', 409, 'ok');
  }

  return new StoreError(
    `Supabase error while ${fallbackAction}: ${rawMessage}`,
    503,
    'connection_error'
  );
}

export async function checkSupabaseStatus(): Promise<SupabaseStatus> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return {
      configured: false,
      schemaReady: true,
      code: 'local',
      message: null,
    };
  }

  try {
    const routesProbe = await sb.from('qr_routes').select('id', { count: 'exact', head: true });
    if (routesProbe.error) {
      const classified = classifySupabaseError(routesProbe.error, 'checking qr_routes table');
      return {
        configured: true,
        schemaReady: false,
        code: classified.code,
        message: classified.message,
      };
    }

    const profilesProbe = await sb.from('profiles').select('id', { count: 'exact', head: true });
    if (profilesProbe.error) {
      const classified = classifySupabaseError(profilesProbe.error, 'checking profiles table');
      return {
        configured: true,
        schemaReady: false,
        code: classified.code,
        message: classified.message,
      };
    }

    return {
      configured: true,
      schemaReady: true,
      code: 'ok',
      message: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to reach Supabase.';
    return {
      configured: true,
      schemaReady: false,
      code: 'connection_error',
      message: `Unable to reach Supabase: ${msg}`,
    };
  }
}

export function readSchemaSql(): string {
  const schemaPath = path.resolve(process.cwd(), 'supabase', 'schema.sql');
  try {
    if (fs.existsSync(schemaPath)) {
      return fs.readFileSync(schemaPath, 'utf8');
    }
  } catch {
    // Fall through to helpful fallback message
  }
  return '-- See supabase/schema.sql in the project repository.';
}

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIGURED_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : DEFAULT_DATA_DIR;
const DB_FILE = path.resolve(CONFIGURED_DIR, 'scanroute-db.json');

if (!DB_FILE.startsWith(CONFIGURED_DIR + path.sep)) {
  throw new Error('Invalid DATA_DIR path configuration');
}

function buildSeedDatabase(): DatabaseSchema {
  const now = Date.now();
  const dayMs = 86_400_000;

  const routes: QrRoute[] = [
    {
      id: 'route-bistro',
      ownerId: null,
      slug: 'bistro-menu',
      title: 'Bella Bistro — Table Menu',
      category: 'Restaurant & Cafe',
      defaultUrl: 'https://example.com/bella-bistro-dinner-menu',
      iosUrl: '',
      androidUrl: '',
      fallbackUrl: 'https://example.com/bella-bistro-hours',
      expiresAt: null,
      active: true,
      fgColor: '#0f172a',
      bgColor: '#ffffff',
      createdAt: new Date(now - 18 * dayMs).toISOString(),
      updatedAt: new Date(now - 2 * dayMs).toISOString(),
    },
    {
      id: 'route-oakwood',
      ownerId: null,
      slug: 'oakwood-4b',
      title: '142 Oakwood Ave — Yard Sign',
      category: 'Real Estate',
      defaultUrl: 'https://example.com/listings/142-oakwood-ave',
      iosUrl: '',
      androidUrl: '',
      fallbackUrl: 'https://example.com/listings/all-homes',
      expiresAt: null,
      active: true,
      fgColor: '#0c4a6e',
      bgColor: '#ffffff',
      createdAt: new Date(now - 14 * dayMs).toISOString(),
      updatedAt: new Date(now - 1 * dayMs).toISOString(),
    },
    {
      id: 'route-glow',
      ownerId: null,
      slug: 'glow-insert',
      title: 'Luna Botanicals — Box Insert',
      category: 'Product Packaging',
      defaultUrl: 'https://example.com/lunabotanicals/ritual-guide',
      iosUrl: 'https://apps.apple.com/',
      androidUrl: 'https://play.google.com/store',
      fallbackUrl: '',
      expiresAt: null,
      active: true,
      fgColor: '#1e293b',
      bgColor: '#ffffff',
      createdAt: new Date(now - 11 * dayMs).toISOString(),
      updatedAt: new Date(now - 3 * dayMs).toISOString(),
    },
    {
      id: 'route-ironworks',
      ownerId: null,
      slug: 'ironworks-pass',
      title: 'IronWorks Gym — Free Day Pass',
      category: 'Local Service',
      defaultUrl: 'https://example.com/ironworks/claim-pass',
      iosUrl: '',
      androidUrl: '',
      fallbackUrl: '',
      expiresAt: null,
      active: true,
      fgColor: '#0f172a',
      bgColor: '#ffffff',
      createdAt: new Date(now - 9 * dayMs).toISOString(),
      updatedAt: new Date(now - 4 * dayMs).toISOString(),
    },
  ];

  const scans: ScanEvent[] = [];
  const devices: DeviceType[] = ['iOS', 'iOS', 'iOS', 'Android', 'Android', 'Desktop'];
  const referrers = ['QR Camera', 'QR Camera', 'QR Camera', 'Direct Link', 'Instagram Bio'];

  for (let d = 13; d >= 0; d--) {
    const dayBase = now - d * dayMs;
    const countForDay = 6 + ((13 - d) % 5) + (d < 4 ? 4 : 0);
    for (let i = 0; i < countForDay; i++) {
      const route = routes[(d + i) % routes.length];
      scans.push({
        id: crypto.randomUUID(),
        routeId: route.id,
        slug: route.slug,
        timestamp: new Date(dayBase - i * 1_800_000).toISOString(),
        device: devices[(d + i) % devices.length],
        referrer: referrers[(d + i) % referrers.length],
        simulated: false,
      });
    }
  }

  const inquiries: ClientInquiry[] = [
    {
      id: 'inq-sample-1',
      businessName: 'Kura Specialty Coffee',
      email: 'ops@kuracoffee.example',
      plan: 'Business ($29/mo)',
      message: 'Need 18 tabletop QR cards for our two downtown cafes.',
      status: 'New',
      createdAt: new Date(now - 1 * dayMs).toISOString(),
    },
  ];

  return { users: [], routes, scans, inquiries };
}

function ensureLocalStoreFile(): void {
  if (!fs.existsSync(CONFIGURED_DIR)) {
    fs.mkdirSync(CONFIGURED_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = buildSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

export function readLocalDatabase(): DatabaseSchema {
  ensureLocalStoreFile();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.scans)) {
      throw new Error('Malformed DB');
    }
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      routes: parsed.routes.map((r) => ({
        ...r,
        ownerId: r.ownerId ?? null,
        expiresAt: r.expiresAt ?? null,
      })),
      scans: parsed.scans,
      inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : [],
    };
  } catch {
    const fresh = buildSeedDatabase();
    writeLocalDatabase(fresh);
    return fresh;
  }
}

export function writeLocalDatabase(db: DatabaseSchema): void {
  if (!fs.existsSync(CONFIGURED_DIR)) {
    fs.mkdirSync(CONFIGURED_DIR, { recursive: true });
  }
  const tmpFile = path.resolve(CONFIGURED_DIR, `scanroute-db.${crypto.randomUUID()}.tmp`);
  if (!tmpFile.startsWith(CONFIGURED_DIR + path.sep)) {
    throw new Error('Invalid temp file path');
  }
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

// Unified async store operations supporting Supabase Postgres OR local fallback

function mapSupabaseRoute(row: Record<string, unknown>): QrRoute {
  return {
    id: String(row.id),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    slug: String(row.slug),
    title: String(row.title),
    category: (row.category as RouteCategory) || 'Local Service',
    defaultUrl: String(row.default_url),
    iosUrl: String(row.ios_url || ''),
    androidUrl: String(row.android_url || ''),
    fallbackUrl: String(row.fallback_url || ''),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    active: Boolean(row.active),
    fgColor: String(row.fg_color || '#0f172a'),
    bgColor: String(row.bg_color || '#ffffff'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSupabaseScan(row: Record<string, unknown>): ScanEvent {
  return {
    id: String(row.id),
    routeId: String(row.route_id),
    slug: String(row.slug),
    timestamp: String(row.scanned_at),
    device: (row.device as DeviceType) || 'Desktop',
    referrer: String(row.referrer || 'QR Camera'),
    simulated: Boolean(row.simulated),
  };
}

function mapSupabaseInquiry(row: Record<string, unknown>): ClientInquiry {
  return {
    id: String(row.id),
    businessName: String(row.business_name),
    email: String(row.email),
    plan: String(row.plan),
    message: String(row.message || ''),
    status: row.status === 'Contacted' ? 'Contacted' : 'New',
    createdAt: String(row.created_at),
  };
}

export async function listRoutesForUser(user: UserProfile): Promise<QrRoute[]> {
  const sb = getSupabaseAdmin();
  if (sb) {
    let query = sb
      .from('qr_routes')
      .select('*')
      .order('updated_at', { ascending: false });
    if (user.role !== 'admin') {
      query = query.eq('owner_id', user.id);
    }
    const { data, error } = await query;
    if (error) {
      throw classifySupabaseError(error, 'fetching QR routes');
    }
    return (data || []).map((r) => mapSupabaseRoute(r as Record<string, unknown>));
  }

  const db = readLocalDatabase();
  const routes =
    user.role === 'admin'
      ? db.routes
      : db.routes.filter((r) => r.ownerId === user.id);
  return [...routes].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function findRouteBySlug(slug: string): Promise<QrRoute | null> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('qr_routes')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) {
      throw classifySupabaseError(error, 'looking up QR route slug');
    }
    return data ? mapSupabaseRoute(data as Record<string, unknown>) : null;
  }

  const db = readLocalDatabase();
  return db.routes.find((r) => r.slug === slug) ?? null;
}

export async function findRouteById(id: string): Promise<QrRoute | null> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('qr_routes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw classifySupabaseError(error, 'looking up QR route');
    }
    return data ? mapSupabaseRoute(data as Record<string, unknown>) : null;
  }

  const db = readLocalDatabase();
  return db.routes.find((r) => r.id === id) ?? null;
}

export async function createRoute(route: QrRoute): Promise<QrRoute> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('qr_routes')
      .insert({
        id: route.id,
        owner_id: route.ownerId,
        slug: route.slug,
        title: route.title,
        category: route.category,
        default_url: route.defaultUrl,
        ios_url: route.iosUrl,
        android_url: route.androidUrl,
        fallback_url: route.fallbackUrl,
        expires_at: route.expiresAt,
        active: route.active,
        fg_color: route.fgColor,
        bg_color: route.bgColor,
        created_at: route.createdAt,
        updated_at: route.updatedAt,
      })
      .select('*')
      .single();
    if (error) {
      throw classifySupabaseError(error, 'creating QR route');
    }
    return mapSupabaseRoute(data as Record<string, unknown>);
  }

  const db = readLocalDatabase();
  db.routes.unshift(route);
  writeLocalDatabase(db);
  return route;
}

export async function updateRouteRecord(route: QrRoute): Promise<QrRoute> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('qr_routes')
      .update({
        title: route.title,
        category: route.category,
        default_url: route.defaultUrl,
        ios_url: route.iosUrl,
        android_url: route.androidUrl,
        fallback_url: route.fallbackUrl,
        expires_at: route.expiresAt,
        active: route.active,
        fg_color: route.fgColor,
        bg_color: route.bgColor,
        updated_at: route.updatedAt,
      })
      .eq('id', route.id)
      .select('*')
      .single();
    if (error) {
      throw classifySupabaseError(error, 'updating QR route');
    }
    return mapSupabaseRoute(data as Record<string, unknown>);
  }

  const db = readLocalDatabase();
  const idx = db.routes.findIndex((r) => r.id === route.id);
  if (idx !== -1) {
    db.routes[idx] = route;
    writeLocalDatabase(db);
  }
  return route;
}

export async function deleteRouteRecord(id: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb.from('qr_routes').delete().eq('id', id);
    if (error) {
      throw classifySupabaseError(error, 'deleting QR route');
    }
    return true;
  }

  const db = readLocalDatabase();
  const before = db.routes.length;
  db.routes = db.routes.filter((r) => r.id !== id);
  db.scans = db.scans.filter((s) => s.routeId !== id);
  if (db.routes.length !== before) {
    writeLocalDatabase(db);
    return true;
  }
  return false;
}

export async function listScansForRoutes(routeIds: string[]): Promise<ScanEvent[]> {
  if (routeIds.length === 0) return [];
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('scan_events')
      .select('*')
      .in('route_id', routeIds)
      .order('scanned_at', { ascending: false })
      .limit(5000);
    if (error) {
      throw classifySupabaseError(error, 'fetching scan events');
    }
    return (data || []).map((s) => mapSupabaseScan(s as Record<string, unknown>));
  }

  const idSet = new Set(routeIds);
  const db = readLocalDatabase();
  return db.scans.filter((s) => idSet.has(s.routeId));
}

export async function countMonthlyScansForOwner(ownerId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const sb = getSupabaseAdmin();
  if (sb) {
    const { data: routes, error: routesError } = await sb
      .from('qr_routes')
      .select('id')
      .eq('owner_id', ownerId);
    if (routesError) {
      throw classifySupabaseError(routesError, 'counting owner routes');
    }
    const ids = (routes || []).map((r) => String((r as Record<string, unknown>).id));
    if (ids.length === 0) return 0;
    const { count, error } = await sb
      .from('scan_events')
      .select('id', { count: 'exact', head: true })
      .in('route_id', ids)
      .gte('scanned_at', monthIso);
    if (error) {
      throw classifySupabaseError(error, 'counting monthly scan events');
    }
    return count ?? 0;
  }

  const db = readLocalDatabase();
  const ownerRouteIds = new Set(
    db.routes.filter((r) => r.ownerId === ownerId).map((r) => r.id)
  );
  return db.scans.filter(
    (s) => ownerRouteIds.has(s.routeId) && s.timestamp >= monthIso
  ).length;
}

export async function getUserProfileById(id: string): Promise<UserProfile | null> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw classifySupabaseError(error, 'fetching user profile');
    }
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      email: String(row.email),
      businessName: String(row.business_name || ''),
      role: row.role === 'admin' ? 'admin' : 'client',
      plan: (row.plan as PlanTier) || 'starter',
      createdAt: String(row.created_at),
    };
  }

  const db = readLocalDatabase();
  return db.users.find((u) => u.id === id) ?? null;
}

export async function ensureSupabaseProfile(input: {
  id: string;
  email: string;
  businessName?: string;
  plan?: PlanTier;
}): Promise<UserProfile | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const existing = await getUserProfileById(input.id);
  if (existing) return existing;

  const { count, error: countError } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (countError) {
    throw classifySupabaseError(countError, 'checking existing user profiles');
  }

  const isFirst = (count ?? 0) === 0;
  const role: UserRole = isFirst ? 'admin' : 'client';
  const plan: PlanTier = isFirst ? 'agency' : input.plan || 'starter';

  const { data, error } = await sb
    .from('profiles')
    .upsert(
      {
        id: input.id,
        email: input.email,
        business_name: input.businessName || (isFirst ? 'Workspace Owner' : ''),
        role,
        plan,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw classifySupabaseError(error, 'creating user profile');
  }

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    email: String(row.email),
    businessName: String(row.business_name || ''),
    role: row.role === 'admin' ? 'admin' : 'client',
    plan: (row.plan as PlanTier) || 'starter',
    createdAt: String(row.created_at),
  };
}

export async function updateUserPlan(userId: string, plan: PlanTier): Promise<UserProfile | null> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('profiles')
      .update({ plan })
      .eq('id', userId)
      .select('*')
      .maybeSingle();
    if (error) {
      throw classifySupabaseError(error, 'updating subscription plan');
    }
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      email: String(row.email),
      businessName: String(row.business_name || ''),
      role: row.role === 'admin' ? 'admin' : 'client',
      plan: (row.plan as PlanTier) || 'starter',
      createdAt: String(row.created_at),
    };
  }

  const db = readLocalDatabase();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], plan };
  writeLocalDatabase(db);
  return db.users[idx];
}

export async function insertScanEvent(event: ScanEvent): Promise<void> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb.from('scan_events').insert({
      id: event.id,
      route_id: event.routeId,
      slug: event.slug,
      device: event.device,
      referrer: event.referrer,
      simulated: event.simulated,
      scanned_at: event.timestamp,
    });
    if (error) {
      throw classifySupabaseError(error, 'recording scan event');
    }
    return;
  }

  const db = readLocalDatabase();
  db.scans.unshift(event);
  writeLocalDatabase(db);
}

export async function listInquiries(): Promise<ClientInquiry[]> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('client_inquiries')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      throw classifySupabaseError(error, 'loading client inquiries');
    }
    return (data || []).map((i) => mapSupabaseInquiry(i as Record<string, unknown>));
  }

  const db = readLocalDatabase();
  return [...db.inquiries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createInquiry(inquiry: ClientInquiry): Promise<ClientInquiry> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('client_inquiries')
      .insert({
        id: inquiry.id,
        business_name: inquiry.businessName,
        email: inquiry.email,
        plan: inquiry.plan,
        message: inquiry.message,
        status: inquiry.status,
        created_at: inquiry.createdAt,
      })
      .select('*')
      .single();
    if (error) {
      throw classifySupabaseError(error, 'saving client inquiry');
    }
    return mapSupabaseInquiry(data as Record<string, unknown>);
  }

  const db = readLocalDatabase();
  db.inquiries.unshift(inquiry);
  writeLocalDatabase(db);
  return inquiry;
}

export async function updateInquiryStatus(
  id: string,
  status: 'New' | 'Contacted'
): Promise<ClientInquiry | null> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('client_inquiries')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      throw classifySupabaseError(error, 'updating inquiry status');
    }
    if (!data) return null;
    return mapSupabaseInquiry(data as Record<string, unknown>);
  }

  const db = readLocalDatabase();
  const idx = db.inquiries.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  db.inquiries[idx] = { ...db.inquiries[idx], status };
  writeLocalDatabase(db);
  return db.inquiries[idx];
}

export async function pingDatabaseKeepAlive(): Promise<{
  backend: 'supabase' | 'local';
  checkedAt: string;
}> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb.from('qr_routes').select('id').limit(1);
    if (error) {
      throw classifySupabaseError(error, 'pinging Supabase database');
    }
    return { backend: 'supabase', checkedAt: new Date().toISOString() };
  }
  readLocalDatabase();
  return { backend: 'local', checkedAt: new Date().toISOString() };
}
