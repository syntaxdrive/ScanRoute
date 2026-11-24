import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  checkSupabaseStatus,
  countMonthlyScansForOwner,
  createEphemeralSupabaseClient,
  createInquiry,
  createRoute,
  deleteRouteRecord,
  ensureSupabaseProfile,
  findRouteById,
  findRouteBySlug,
  getSupabaseAdmin,
  getSupabasePublicConfig,
  getUserProfileById,
  insertScanEvent,
  isSupabaseConfigured,
  listInquiries,
  listRoutesForUser,
  listScansForRoutes,
  pingDatabaseKeepAlive,
  PLAN_LIMITS,
  readLocalDatabase,
  readSchemaSql,
  StoreError,
  updateInquiryStatus,
  updateRouteRecord,
  updateUserPlan,
  writeLocalDatabase,
  type DeviceType,
  type PlanTier,
  type QrRoute,
  type RouteCategory,
  type ScanEvent,
  type UserProfile,
} from './server/store.ts';

const VALID_CATEGORIES = new Set<RouteCategory>([
  'Restaurant & Cafe',
  'Real Estate',
  'Product Packaging',
  'Local Service',
  'Events & Flyers',
]);

const VALID_PLANS = new Set<PlanTier>(['starter', 'business', 'agency']);
const RESERVED_SLUGS = new Set(['api', 'r', 'assets', 'src', 'health', 'favicon.ico']);

const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

interface AuthedRequest extends Request {
  authUser?: UserProfile;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function signSessionToken(userId: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyLocalSessionToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!parsed.sub || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}

function isValidHttpUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeOptionalUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  return isValidHttpUrl(trimmed) ? trimmed : null;
}

function normalizeOptionalDate(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(cleaned)) return null;
  if (RESERVED_SLUGS.has(cleaned)) return null;
  return cleaned;
}

function normalizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function detectDevice(userAgent: string | undefined): DeviceType {
  const ua = (userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'iOS';
  if (/android/.test(ua)) return 'Android';
  return 'Desktop';
}

function isRouteExpired(route: QrRoute): boolean {
  if (!route.expiresAt) return false;
  const expMs = Date.parse(route.expiresAt);
  return !Number.isNaN(expMs) && expMs <= Date.now();
}

function resolveTargetUrl(route: QrRoute, device: DeviceType): {
  targetUrl: string | null;
  reason: 'active' | 'paused' | 'expired';
} {
  const expired = isRouteExpired(route);
  if (!route.active || expired) {
    const reason = expired ? 'expired' : 'paused';
    if (route.fallbackUrl && isValidHttpUrl(route.fallbackUrl)) {
      return { targetUrl: route.fallbackUrl, reason };
    }
    return { targetUrl: null, reason };
  }

  if (device === 'iOS' && route.iosUrl && isValidHttpUrl(route.iosUrl)) {
    return { targetUrl: route.iosUrl, reason: 'active' };
  }
  if (device === 'Android' && route.androidUrl && isValidHttpUrl(route.androidUrl)) {
    return { targetUrl: route.androidUrl, reason: 'active' };
  }
  return {
    targetUrl: isValidHttpUrl(route.defaultUrl) ? route.defaultUrl : null,
    reason: 'active',
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeUser(user: UserProfile) {
  return {
    id: user.id,
    email: user.email,
    businessName: user.businessName,
    role: user.role,
    plan: user.plan,
    createdAt: user.createdAt,
  };
}

function sendStoreError(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof StoreError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }
  console.error('[server]', fallbackMessage, err);
  res.status(500).json({ error: fallbackMessage });
}

async function resolveBearerUser(req: Request): Promise<UserProfile | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;

    const metaPlan = data.user.user_metadata?.plan;
    const safePlan: PlanTier = VALID_PLANS.has(metaPlan as PlanTier)
      ? (metaPlan as PlanTier)
      : 'starter';
    const businessName = String(data.user.user_metadata?.business_name || '');

    try {
      const profile = await ensureSupabaseProfile({
        id: data.user.id,
        email: data.user.email || '',
        businessName,
        plan: safePlan,
      });
      if (profile) return profile;
    } catch (err) {
      if (!(err instanceof StoreError)) {
        console.error('[auth] profile lookup failed', err);
      }
    }

    return {
      id: data.user.id,
      email: data.user.email || '',
      businessName,
      role: 'client',
      plan: safePlan,
      createdAt: data.user.created_at,
    };
  }

  const userId = verifyLocalSessionToken(token);
  if (!userId) return null;
  return getUserProfileById(userId);
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const user = await resolveBearerUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    req.authUser = user;
    next();
  } catch (err) {
    sendStoreError(res, err, 'Failed to verify authentication.');
  }
}

async function buildQuotaSummary(user: UserProfile) {
  const routes = await listRoutesForUser(user);
  const activeRouteCount = routes.filter((r) => r.active).length;
  const monthlyScans =
    user.role === 'admin' ? 0 : await countMonthlyScansForOwner(user.id);
  const limits = PLAN_LIMITS[user.plan];
  return {
    plan: user.plan,
    planLabel: limits.label,
    isAdmin: user.role === 'admin',
    activeRoutes: activeRouteCount,
    maxActiveRoutes: user.role === 'admin' ? null : limits.maxActiveRoutes,
    monthlyScans,
    maxMonthlyScans: user.role === 'admin' ? null : limits.maxMonthlyScans,
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req: Request, res: Response) => {
    const sbStatus = await checkSupabaseStatus();
    res.json({
      status: 'ok',
      service: 'scanroute',
      database: sbStatus.configured ? 'supabase' : 'local',
      schemaReady: sbStatus.schemaReady,
      supabaseStatus: sbStatus.code,
      message: sbStatus.message,
    });
  });

  app.get('/api/setup/schema-sql', requireAuth, async (_req: AuthedRequest, res: Response) => {
    try {
      const status = await checkSupabaseStatus();
      res.json({
        sql: readSchemaSql(),
        status,
      });
    } catch (err) {
      sendStoreError(res, err, 'Unable to load schema SQL.');
    }
  });

  app.get('/api/cron/keep-alive', async (req: Request, res: Response) => {
    const configuredSecret = process.env.CRON_SECRET?.trim() || '';
    if (!configuredSecret) {
      res.status(503).json({ error: 'CRON_SECRET is not configured on the server.' });
      return;
    }
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const a = Buffer.from(token);
    const b = Buffer.from(configuredSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Unauthorized cron token.' });
      return;
    }

    try {
      const result = await pingDatabaseKeepAlive();
      res.json({ ok: true, ...result });
    } catch (err) {
      sendStoreError(res, err, 'Keep-alive check failed.');
    }
  });

  app.get('/api/auth/status', async (req: Request, res: Response) => {
    try {
      const supabaseEnabled = isSupabaseConfigured();
      let bootstrapRequired = false;

      if (!supabaseEnabled) {
        const db = readLocalDatabase();
        bootstrapRequired = db.users.length === 0;
      }

      const sbStatus = await checkSupabaseStatus();
      let supabaseIssue = sbStatus.schemaReady
        ? null
        : { code: sbStatus.code, message: sbStatus.message || 'Supabase setup incomplete.' };

      const user = await resolveBearerUser(req);
      let quota = null;
      if (user) {
        try {
          quota = await buildQuotaSummary(user);
        } catch (err) {
          if (err instanceof StoreError && !supabaseIssue) {
            supabaseIssue = { code: err.code, message: err.message };
          }
        }
      }

      res.json({
        supabaseEnabled,
        supabasePublicConfig: supabaseEnabled ? getSupabasePublicConfig() : null,
        schemaReady: sbStatus.schemaReady,
        supabaseIssue,
        bootstrapRequired,
        user: user ? sanitizeUser(user) : null,
        quota,
      });
    } catch (err) {
      sendStoreError(res, err, 'Unable to check workspace authentication status.');
    }
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const businessName =
        typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 120) : '';
      const requestedPlan = VALID_PLANS.has(body.plan as PlanTier)
        ? (body.plan as PlanTier)
        : 'starter';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters.' });
        return;
      }

      const sb = getSupabaseAdmin();
      if (sb) {
        const { data: created, error: createErr } = await sb.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            business_name: businessName || 'Client Business',
            plan: requestedPlan,
          },
        });
        if (createErr || !created.user) {
          res.status(400).json({ error: createErr?.message || 'Unable to create Supabase user.' });
          return;
        }

        const ephemeral = createEphemeralSupabaseClient();
        const { data: signInData, error: signInErr } = ephemeral
          ? await ephemeral.auth.signInWithPassword({ email, password })
          : { data: { session: null }, error: new Error('Supabase client unavailable') };

        if (signInErr || !signInData.session?.access_token) {
          res.status(400).json({
            error: signInErr?.message || 'Account created, please sign in with your credentials.',
          });
          return;
        }

        let userProfile: UserProfile = {
          id: created.user.id,
          email,
          businessName: businessName || 'Client Business',
          role: 'client',
          plan: requestedPlan,
          createdAt: created.user.created_at,
        };
        let supabaseIssue: { code: string; message: string } | null = null;
        let quota = null;

        try {
          const ensured = await ensureSupabaseProfile({
            id: created.user.id,
            email,
            businessName: businessName || 'Client Business',
            plan: requestedPlan,
          });
          if (ensured) userProfile = ensured;
          quota = await buildQuotaSummary(userProfile);
        } catch (err) {
          if (err instanceof StoreError) {
            supabaseIssue = { code: err.code, message: err.message };
          }
        }

        res.status(201).json({
          token: signInData.session.access_token,
          user: sanitizeUser(userProfile),
          quota,
          supabaseIssue,
        });
        return;
      }

      const db = readLocalDatabase();
      if (db.users.some((u) => u.email === email)) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const isFirstUser = db.users.length === 0;
      const newUser: UserProfile = {
        id: `user-${crypto.randomUUID().slice(0, 12)}`,
        email,
        businessName: businessName || (isFirstUser ? 'Workspace Owner' : 'Client Business'),
        role: isFirstUser ? 'admin' : 'client',
        plan: isFirstUser ? 'agency' : requestedPlan,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
      };

      db.users.push(newUser);
      if (isFirstUser) {
        db.routes = db.routes.map((r) => (r.ownerId === null ? { ...r, ownerId: newUser.id } : r));
      }
      writeLocalDatabase(db);

      const token = signSessionToken(newUser.id);
      const quota = await buildQuotaSummary(newUser);
      res.status(201).json({
        token,
        user: sanitizeUser(newUser),
        quota,
      });
    } catch (err) {
      sendStoreError(res, err, 'Unable to register account.');
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      const sb = getSupabaseAdmin();
      if (sb) {
        const ephemeral = createEphemeralSupabaseClient();
        const { data, error } = ephemeral
          ? await ephemeral.auth.signInWithPassword({ email, password })
          : { data: { user: null, session: null }, error: new Error('Supabase client unavailable') };

        if (error || !data.user || !data.session?.access_token) {
          res.status(401).json({ error: error?.message || 'Invalid email or password.' });
          return;
        }

        const metaPlan = data.user.user_metadata?.plan;
        const safePlan: PlanTier = VALID_PLANS.has(metaPlan as PlanTier)
          ? (metaPlan as PlanTier)
          : 'starter';
        const businessName = String(data.user.user_metadata?.business_name || '');

        let userProfile: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          businessName,
          role: 'client',
          plan: safePlan,
          createdAt: data.user.created_at,
        };
        let supabaseIssue: { code: string; message: string } | null = null;
        let quota = null;

        try {
          const ensured = await ensureSupabaseProfile({
            id: data.user.id,
            email: data.user.email || email,
            businessName,
            plan: safePlan,
          });
          if (ensured) userProfile = ensured;
          quota = await buildQuotaSummary(userProfile);
        } catch (err) {
          if (err instanceof StoreError) {
            supabaseIssue = { code: err.code, message: err.message };
          }
        }

        res.json({
          token: data.session.access_token,
          user: sanitizeUser(userProfile),
          quota,
          supabaseIssue,
        });
        return;
      }

      const db = readLocalDatabase();
      const user = db.users.find((u) => u.email === email);
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = signSessionToken(user.id);
      const quota = await buildQuotaSummary(user);
      res.json({
        token,
        user: sanitizeUser(user),
        quota,
      });
    } catch (err) {
      sendStoreError(res, err, 'Unable to sign in.');
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      let quota = null;
      let supabaseIssue: { code: string; message: string } | null = null;

      try {
        quota = await buildQuotaSummary(user);
      } catch (err) {
        if (err instanceof StoreError) {
          supabaseIssue = { code: err.code, message: err.message };
        } else {
          throw err;
        }
      }

      res.json({
        user: sanitizeUser(user),
        quota,
        supabaseIssue,
      });
    } catch (err) {
      sendStoreError(res, err, 'Unable to load workspace profile.');
    }
  });

  app.patch('/api/auth/plan', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const body = req.body as Record<string, unknown>;
      const nextPlan = body.plan as PlanTier;
      if (!VALID_PLANS.has(nextPlan)) {
        res.status(400).json({ error: 'Invalid subscription plan.' });
        return;
      }

      const updated = await updateUserPlan(user.id, nextPlan);
      if (!updated) {
        res.status(404).json({ error: 'User profile not found.' });
        return;
      }
      const quota = await buildQuotaSummary(updated);
      res.json({ user: sanitizeUser(updated), quota });
    } catch (err) {
      sendStoreError(res, err, 'Unable to update subscription plan.');
    }
  });

  app.get('/api/links', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const routes = await listRoutesForUser(user);
      const scans = await listScansForRoutes(routes.map((r) => r.id));

      const scanCounts = new Map<string, number>();
      const lastScanMap = new Map<string, string>();
      for (const scan of scans) {
        scanCounts.set(scan.routeId, (scanCounts.get(scan.routeId) ?? 0) + 1);
        const prev = lastScanMap.get(scan.routeId);
        if (!prev || scan.timestamp > prev) {
          lastScanMap.set(scan.routeId, scan.timestamp);
        }
      }

      const enriched = routes.map((route) => ({
        ...route,
        totalScans: scanCounts.get(route.id) ?? 0,
        lastScanAt: lastScanMap.get(route.id) ?? null,
      }));
      const quota = await buildQuotaSummary(user);
      res.json({ routes: enriched, quota });
    } catch (err) {
      sendStoreError(res, err, 'Failed to load QR routes.');
    }
  });

  app.post('/api/links', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const body = req.body as Record<string, unknown>;

      if (user.role !== 'admin') {
        const existingRoutes = await listRoutesForUser(user);
        const activeCount = existingRoutes.filter((r) => r.active).length;
        const limit = PLAN_LIMITS[user.plan].maxActiveRoutes;
        if (activeCount >= limit) {
          res.status(403).json({
            error: `Your ${PLAN_LIMITS[user.plan].label} plan supports up to ${limit} active QR routes. Upgrade your plan in the header to add more.`,
          });
          return;
        }
      }

      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
      if (!title) {
        res.status(400).json({ error: 'Title is required.' });
        return;
      }

      const slug = normalizeSlug(body.slug);
      if (!slug) {
        res.status(400).json({
          error: 'Slug must be 2–48 lowercase letters, numbers, or hyphens.',
        });
        return;
      }

      if (!isValidHttpUrl(body.defaultUrl)) {
        res.status(400).json({
          error: 'Destination URL must be a valid http:// or https:// URL.',
        });
        return;
      }

      const iosUrl = normalizeOptionalUrl(body.iosUrl);
      const androidUrl = normalizeOptionalUrl(body.androidUrl);
      const fallbackUrl = normalizeOptionalUrl(body.fallbackUrl);
      if (iosUrl === null || androidUrl === null || fallbackUrl === null) {
        res.status(400).json({
          error: 'Optional override URLs must start with http:// or https://.',
        });
        return;
      }

      const expiresAt = normalizeOptionalDate(body.expiresAt) ?? null;

      const existingSlug = await findRouteBySlug(slug);
      if (existingSlug) {
        res.status(409).json({ error: `Slug "${slug}" is already in use.` });
        return;
      }

      const categoryRaw = body.category as RouteCategory;
      const category: RouteCategory = VALID_CATEGORIES.has(categoryRaw)
        ? categoryRaw
        : 'Local Service';

      const nowIso = new Date().toISOString();
      const newRoute: QrRoute = {
        id: `route-${crypto.randomUUID().slice(0, 8)}`,
        ownerId: user.id,
        slug,
        title,
        category,
        defaultUrl: body.defaultUrl.trim(),
        iosUrl,
        androidUrl,
        fallbackUrl,
        expiresAt,
        active: body.active !== false,
        fgColor: normalizeHexColor(body.fgColor, '#0f172a'),
        bgColor: normalizeHexColor(body.bgColor, '#ffffff'),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const saved = await createRoute(newRoute);
      const quota = await buildQuotaSummary(user);
      res.status(201).json({
        route: { ...saved, totalScans: 0, lastScanAt: null },
        quota,
      });
    } catch (err) {
      sendStoreError(res, err, 'Unable to create route.');
    }
  });

  app.patch('/api/links/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const { id } = req.params;
      const current = await findRouteById(id);

      if (!current) {
        res.status(404).json({ error: 'QR route not found.' });
        return;
      }
      if (user.role !== 'admin' && current.ownerId !== user.id) {
        res.status(403).json({ error: 'You do not own this QR route.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      let nextTitle = current.title;
      if (body.title !== undefined) {
        if (typeof body.title !== 'string' || !body.title.trim()) {
          res.status(400).json({ error: 'Title cannot be empty.' });
          return;
        }
        nextTitle = body.title.trim().slice(0, 120);
      }

      let nextDefaultUrl = current.defaultUrl;
      if (body.defaultUrl !== undefined) {
        if (!isValidHttpUrl(body.defaultUrl)) {
          res.status(400).json({ error: 'Destination URL must use http:// or https://.' });
          return;
        }
        nextDefaultUrl = body.defaultUrl.trim();
      }

      const iosUrl =
        body.iosUrl !== undefined ? normalizeOptionalUrl(body.iosUrl) : current.iosUrl;
      const androidUrl =
        body.androidUrl !== undefined
          ? normalizeOptionalUrl(body.androidUrl)
          : current.androidUrl;
      const fallbackUrl =
        body.fallbackUrl !== undefined
          ? normalizeOptionalUrl(body.fallbackUrl)
          : current.fallbackUrl;

      if (iosUrl === null || androidUrl === null || fallbackUrl === null) {
        res.status(400).json({ error: 'Override URLs must use http:// or https://.' });
        return;
      }

      const parsedExpiresAt = normalizeOptionalDate(body.expiresAt);
      const nextExpiresAt =
        parsedExpiresAt !== undefined ? parsedExpiresAt : current.expiresAt;

      const nextActive = typeof body.active === 'boolean' ? body.active : current.active;
      if (!current.active && nextActive && user.role !== 'admin') {
        const existingRoutes = await listRoutesForUser(user);
        const activeCount = existingRoutes.filter((r) => r.active).length;
        const limit = PLAN_LIMITS[user.plan].maxActiveRoutes;
        if (activeCount >= limit) {
          res.status(403).json({
            error: `Cannot reactivate: ${PLAN_LIMITS[user.plan].label} plan limit of ${limit} active routes reached.`,
          });
          return;
        }
      }

      const categoryRaw = body.category as RouteCategory;
      const nextCategory =
        body.category !== undefined && VALID_CATEGORIES.has(categoryRaw)
          ? categoryRaw
          : current.category;

      const updated: QrRoute = {
        ...current,
        title: nextTitle,
        category: nextCategory,
        defaultUrl: nextDefaultUrl,
        iosUrl,
        androidUrl,
        fallbackUrl,
        expiresAt: nextExpiresAt,
        active: nextActive,
        fgColor:
          body.fgColor !== undefined
            ? normalizeHexColor(body.fgColor, current.fgColor)
            : current.fgColor,
        bgColor:
          body.bgColor !== undefined
            ? normalizeHexColor(body.bgColor, current.bgColor)
            : current.bgColor,
        updatedAt: new Date().toISOString(),
      };

      const saved = await updateRouteRecord(updated);
      const scans = await listScansForRoutes([saved.id]);
      const lastScanAt =
        scans.length > 0
          ? scans.reduce((latest, s) => (s.timestamp > latest ? s.timestamp : latest), '')
          : null;
      const quota = await buildQuotaSummary(user);

      res.json({
        route: {
          ...saved,
          totalScans: scans.length,
          lastScanAt,
        },
        quota,
      });
    } catch (err) {
      sendStoreError(res, err, 'Failed to update QR route.');
    }
  });

  app.delete('/api/links/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const { id } = req.params;
      const current = await findRouteById(id);
      if (!current) {
        res.status(404).json({ error: 'QR route not found.' });
        return;
      }
      if (user.role !== 'admin' && current.ownerId !== user.id) {
        res.status(403).json({ error: 'You do not own this QR route.' });
        return;
      }
      await deleteRouteRecord(id);
      const quota = await buildQuotaSummary(user);
      res.json({ deleted: true, quota });
    } catch (err) {
      sendStoreError(res, err, 'Failed to delete QR route.');
    }
  });

  app.post('/api/links/:id/test-scan', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const { id } = req.params;
      const route = await findRouteById(id);

      if (!route) {
        res.status(404).json({ error: 'QR route not found.' });
        return;
      }
      if (user.role !== 'admin' && route.ownerId !== user.id) {
        res.status(403).json({ error: 'You do not own this QR route.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const requestedDevice = body.device;
      const device: DeviceType =
        requestedDevice === 'iOS' || requestedDevice === 'Android' || requestedDevice === 'Desktop'
          ? requestedDevice
          : 'iOS';

      const { targetUrl, reason } = resolveTargetUrl(route, device);
      const event: ScanEvent = {
        id: crypto.randomUUID(),
        routeId: route.id,
        slug: route.slug,
        timestamp: new Date().toISOString(),
        device,
        referrer: 'Dashboard Test',
        simulated: true,
      };

      await insertScanEvent(event);
      res.json({
        resolvedUrl: targetUrl,
        reason,
        active: route.active,
        event,
      });
    } catch (err) {
      sendStoreError(res, err, 'Failed to simulate scan.');
    }
  });

  app.get('/api/analytics', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const routes = await listRoutesForUser(user);
      const scans = await listScansForRoutes(routes.map((r) => r.id));

      const totalScans = scans.length;
      const activeRoutes = routes.filter((r) => r.active && !isRouteExpired(r)).length;

      const deviceCounts: Record<DeviceType, number> = {
        iOS: 0,
        Android: 0,
        Desktop: 0,
      };

      const routeScanCounts = new Map<string, number>();
      const dayCounts = new Map<string, number>();

      const today = new Date();
      const dayKeys: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86_400_000);
        const key = d.toISOString().slice(0, 10);
        dayKeys.push(key);
        dayCounts.set(key, 0);
      }

      for (const scan of scans) {
        deviceCounts[scan.device] = (deviceCounts[scan.device] ?? 0) + 1;
        routeScanCounts.set(scan.routeId, (routeScanCounts.get(scan.routeId) ?? 0) + 1);
        const dayKey = scan.timestamp.slice(0, 10);
        if (dayCounts.has(dayKey)) {
          dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
        }
      }

      const dailySeries = dayKeys.map((date) => ({
        date,
        label: date.slice(5),
        scans: dayCounts.get(date) ?? 0,
      }));

      const topRoutes = routes
        .map((route) => ({
          id: route.id,
          slug: route.slug,
          title: route.title,
          category: route.category,
          active: route.active,
          scans: routeScanCounts.get(route.id) ?? 0,
        }))
        .sort((a, b) => b.scans - a.scans);

      const recentScans = [...scans]
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, 20);

      res.json({
        totalScans,
        totalRoutes: routes.length,
        activeRoutes,
        deviceCounts,
        dailySeries,
        topRoutes,
        recentScans,
      });
    } catch (err) {
      sendStoreError(res, err, 'Failed to load analytics.');
    }
  });

  app.get('/api/inquiries', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      if (req.authUser!.role !== 'admin') {
        res.status(403).json({ error: 'Owner access required.' });
        return;
      }
      const inquiries = await listInquiries();
      res.json({ inquiries });
    } catch (err) {
      sendStoreError(res, err, 'Failed to load client inquiries.');
    }
  });

  app.post('/api/inquiries', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const businessName =
        typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 120) : '';
      const email =
        typeof body.email === 'string' ? body.email.trim().slice(0, 160) : '';
      const plan =
        typeof body.plan === 'string' ? body.plan.trim().slice(0, 60) : 'Business ($29/mo)';
      const message =
        typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';

      if (!businessName) {
        res.status(400).json({ error: 'Business or contact name is required.' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid work email address.' });
        return;
      }

      const saved = await createInquiry({
        id: `inq-${crypto.randomUUID().slice(0, 8)}`,
        businessName,
        email,
        plan,
        message,
        status: 'New',
        createdAt: new Date().toISOString(),
      });
      res.status(201).json({ inquiry: saved });
    } catch (err) {
      sendStoreError(res, err, 'Unable to submit inquiry.');
    }
  });

  app.patch('/api/inquiries/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      if (req.authUser!.role !== 'admin') {
        res.status(403).json({ error: 'Owner access required.' });
        return;
      }
      const { id } = req.params;
      const body = req.body as Record<string, unknown>;
      const nextStatus = body.status === 'Contacted' ? 'Contacted' : 'New';
      const updated = await updateInquiryStatus(id, nextStatus);
      if (!updated) {
        res.status(404).json({ error: 'Inquiry not found.' });
        return;
      }
      res.json({ inquiry: updated });
    } catch (err) {
      sendStoreError(res, err, 'Unable to update inquiry status.');
    }
  });

  app.get('/r/:slug', async (req: Request, res: Response) => {
    try {
      const rawSlug = String(req.params.slug || '').toLowerCase();
      const route = await findRouteBySlug(rawSlug);

      if (!route) {
        res.status(404).type('text/html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link Not Found</title></head>
  <body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;max-width:420px;text-align:center;">
      <h1 style="font-size:18px;margin:0 0 8px;">QR Route Not Found</h1>
      <p style="font-size:14px;color:#475569;margin:0;">This QR code is no longer active or the link slug does not exist.</p>
    </div>
  </body>
</html>`);
        return;
      }

      if (route.ownerId) {
        const owner = await getUserProfileById(route.ownerId);
        if (owner && owner.role !== 'admin') {
          const scanLimit = PLAN_LIMITS[owner.plan].maxMonthlyScans;
          if (scanLimit !== null) {
            const monthlyScans = await countMonthlyScansForOwner(owner.id);
            if (monthlyScans >= scanLimit) {
              const safeTitle = escapeHtml(route.title);
              res.status(429).type('text/html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} — Limit Reached</title></head>
  <body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;max-width:420px;text-align:center;">
      <h1 style="font-size:18px;margin:0 0 8px;">${safeTitle}</h1>
      <p style="font-size:14px;color:#475569;margin:0;">This route has reached its monthly scan allowance. Please contact the business owner.</p>
    </div>
  </body>
</html>`);
              return;
            }
          }
        }
      }

      const simQuery = typeof req.query.simDevice === 'string' ? req.query.simDevice : '';
      const device: DeviceType =
        simQuery === 'iOS' || simQuery === 'Android' || simQuery === 'Desktop'
          ? simQuery
          : detectDevice(req.get('user-agent'));

      const { targetUrl, reason } = resolveTargetUrl(route, device);

      await insertScanEvent({
        id: crypto.randomUUID(),
        routeId: route.id,
        slug: route.slug,
        timestamp: new Date().toISOString(),
        device,
        referrer: req.get('referer') ? 'Web Referrer' : 'QR Camera',
        simulated: Boolean(simQuery),
      });

      if (!targetUrl) {
        const safeTitle = escapeHtml(route.title);
        const message =
          reason === 'expired'
            ? 'This promotion or campaign link has expired.'
            : 'This campaign is currently paused by the owner. Check back soon.';
        res.status(200).type('text/html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head>
  <body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;max-width:420px;text-align:center;">
      <h1 style="font-size:18px;margin:0 0 8px;">${safeTitle}</h1>
      <p style="font-size:14px;color:#475569;margin:0;">${message}</p>
    </div>
  </body>
</html>`);
        return;
      }

      res.redirect(302, targetUrl);
    } catch (err) {
      console.error('[redirect]', err);
      res.status(503).type('text/html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Service Temporarily Unavailable</title></head>
  <body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;max-width:420px;text-align:center;">
      <h1 style="font-size:18px;margin:0 0 8px;">Route Temporarily Unavailable</h1>
      <p style="font-size:14px;color:#475569;margin:0;">Please check back shortly while our database finishes setup.</p>
    </div>
  </body>
</html>`);
    }
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendStoreError(res, err, 'Unexpected server error.');
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output missing. Run npm run build.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`ScanRoute server running on http://0.0.0.0:${port}`);
  });
}

startServer();
