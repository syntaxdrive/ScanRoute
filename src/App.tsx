/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  CloudUpload,
  Copy,
  Inbox,
  LogOut,
  Menu,
  Plus,
  QrCode,
  RefreshCw,
  X,
} from 'lucide-react';
import { AnalyticsView } from './components/AnalyticsView';
import { AuthGate } from './components/AuthGate';
import { AzureDeployView } from './components/AzureDeployView';
import { InquiriesView } from './components/InquiriesView';
import { NewRouteModal } from './components/NewRouteModal';
import { PrintPosterModal } from './components/PrintPosterModal';
import { PublicWebsite } from './components/PublicWebsite';
import { RoutesWorkspace } from './components/RoutesWorkspace';
import { configureSupabaseClient, getSupabaseClient } from './lib/supabaseClient';
import {
  AnalyticsResponse,
  ClientInquiry,
  DeviceType,
  PlanTier,
  QrRouteWithStats,
  QuotaSummary,
  RouteCategory,
  SupabaseIssue,
  UserProfile,
} from './types/qr';

type SurfaceMode = 'public' | 'dashboard';
type DashboardTab = 'routes' | 'analytics' | 'inquiries' | 'hosting';

export default function App() {
  const [surface, setSurface] = useState<SurfaceMode>('public');
  const [activeTab, setActiveTab] = useState<DashboardTab>('routes');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [supabaseIssue, setSupabaseIssue] = useState<SupabaseIssue | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<UserProfile | null>(null);
  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [routes, setRoutes] = useState<QrRouteWithStats[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [inquiries, setInquiries] = useState<ClientInquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState<string | undefined>(undefined);
  const [draftFgColor, setDraftFgColor] = useState<string | undefined>(undefined);
  const [pendingQuickCreate, setPendingQuickCreate] = useState(false);
  const [posterRoute, setPosterRoute] = useState<QrRouteWithStats | null>(null);

  // Check initial auth status and restore Supabase browser session if configured
  useEffect(() => {
    let cancelled = false;
    async function initAuth() {
      try {
        const preRes = await fetch('/api/auth/status');
        const preStatus = (await preRes.json()) as {
          supabaseEnabled: boolean;
          supabasePublicConfig?: { url: string; anonKey: string } | null;
          supabaseIssue?: SupabaseIssue | null;
          bootstrapRequired: boolean;
        };

        if (cancelled) return;
        if (preStatus.supabasePublicConfig) {
          configureSupabaseClient(
            preStatus.supabasePublicConfig.url,
            preStatus.supabasePublicConfig.anonKey
          );
        }

        let initialToken: string | null = null;
        const sb = getSupabaseClient();
        if (sb) {
          const { data } = await sb.auth.getSession();
          initialToken = data.session?.access_token ?? null;
        }

        if (initialToken) {
          const res = await fetch('/api/auth/status', {
            headers: { Authorization: `Bearer ${initialToken}` },
          });
          const status = (await res.json()) as {
            supabaseEnabled: boolean;
            supabaseIssue?: SupabaseIssue | null;
            bootstrapRequired: boolean;
            user: UserProfile | null;
            quota: QuotaSummary | null;
          };
          if (cancelled) return;
          setSupabaseEnabled(status.supabaseEnabled);
          setBootstrapRequired(status.bootstrapRequired);
          setSupabaseIssue(status.supabaseIssue ?? null);
          if (status.user) {
            setAuthToken(initialToken);
            setAuthUser(status.user);
            setQuota(status.quota);
          }
        } else {
          setSupabaseEnabled(preStatus.supabaseEnabled);
          setBootstrapRequired(preStatus.bootstrapRequired);
          setSupabaseIssue(preStatus.supabaseIssue ?? null);
        }
      } catch {
        if (!cancelled) {
          setApiError('Unable to connect to the ScanRoute API server.');
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    }
    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const authHeaders = useCallback(
    (tokenOverride?: string): Record<string, string> => {
      const token = tokenOverride ?? authToken;
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
    [authToken]
  );

  const handleApiFailure = useCallback(
    async (res: Response, fallbackMessage: string) => {
      try {
        const errData = (await res.json()) as { error?: string; code?: string };
        const message = errData.error || fallbackMessage;
        if (
          errData.code === 'missing_tables' ||
          errData.code === 'invalid_credentials' ||
          errData.code === 'connection_error'
        ) {
          setSupabaseIssue({ code: errData.code, message });
        } else {
          setApiError(message);
        }
      } catch {
        setApiError(fallbackMessage);
      }
    },
    []
  );

  const fetchRoutes = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? authToken;
      if (!token) return;
      setRoutesLoading(true);
      try {
        const res = await fetch('/api/links', {
          headers: authHeaders(token),
        });
        if (!res.ok) {
          await handleApiFailure(res, 'Failed to load QR routes.');
          return;
        }
        const data = (await res.json()) as {
          routes: QrRouteWithStats[];
          quota?: QuotaSummary;
        };
        setSupabaseIssue(null);
        setApiError(null);
        setRoutes(data.routes);
        if (data.quota) setQuota(data.quota);
        setSelectedRouteId((prev) =>
          prev && data.routes.some((r) => r.id === prev)
            ? prev
            : data.routes[0]?.id ?? null
        );
      } finally {
        setRoutesLoading(false);
      }
    },
    [authToken, authHeaders, handleApiFailure]
  );

  const fetchAnalytics = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? authToken;
      if (!token) return;
      setAnalyticsLoading(true);
      try {
        const res = await fetch('/api/analytics', {
          headers: authHeaders(token),
        });
        if (!res.ok) {
          await handleApiFailure(res, 'Failed to load analytics.');
          return;
        }
        const data = (await res.json()) as AnalyticsResponse;
        setAnalytics(data);
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [authToken, authHeaders, handleApiFailure]
  );

  const fetchInquiries = useCallback(
    async (tokenOverride?: string, roleOverride?: string) => {
      const token = tokenOverride ?? authToken;
      const role = roleOverride ?? authUser?.role;
      if (!token || role !== 'admin') return;
      setInquiriesLoading(true);
      try {
        const res = await fetch('/api/inquiries', {
          headers: authHeaders(token),
        });
        if (!res.ok) {
          await handleApiFailure(res, 'Failed to load client inquiries.');
          return;
        }
        const data = (await res.json()) as { inquiries: ClientInquiry[] };
        setInquiries(data.inquiries);
      } finally {
        setInquiriesLoading(false);
      }
    },
    [authToken, authUser?.role, authHeaders, handleApiFailure]
  );

  useEffect(() => {
    if (!authToken || !authUser) return;
    fetchRoutes(authToken);
    fetchAnalytics(authToken);
    if (authUser.role === 'admin') {
      fetchInquiries(authToken, authUser.role);
    }
  }, [authToken, authUser, fetchRoutes, fetchAnalytics, fetchInquiries]);

  const handleAuthenticated = (
    token: string,
    user: UserProfile,
    nextQuota: QuotaSummary | null,
    issue?: SupabaseIssue | null
  ) => {
    setAuthToken(token);
    setAuthUser(user);
    setQuota(nextQuota);
    setSupabaseIssue(issue ?? null);
    setApiError(null);
    setBootstrapRequired(false);
    if (pendingQuickCreate) {
      setPendingQuickCreate(false);
      setNewModalOpen(true);
    }
  };

  const handleCopySchemaSql = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/setup/schema-sql', {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { sql?: string };
      if (data.sql) {
        await navigator.clipboard.writeText(data.sql);
        setSchemaCopied(true);
        window.setTimeout(() => setSchemaCopied(false), 2000);
      }
    } catch {
      setApiError('Unable to copy schema SQL to clipboard.');
    }
  };

  const handleRecheckConnection = async () => {
    if (!authToken) return;
    setRechecking(true);
    try {
      const res = await fetch('/api/auth/me', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          user: UserProfile;
          quota: QuotaSummary | null;
          supabaseIssue?: SupabaseIssue | null;
        };
        setAuthUser(data.user);
        setQuota(data.quota);
        setSupabaseIssue(data.supabaseIssue ?? null);
        setApiError(null);
        if (!data.supabaseIssue) {
          await Promise.all([
            fetchRoutes(),
            fetchAnalytics(),
            data.user.role === 'admin' ? fetchInquiries(authToken, data.user.role) : Promise.resolve(),
          ]);
        }
      }
    } finally {
      setRechecking(false);
    }
  };

  const handleSignOut = async () => {
    const sb = getSupabaseClient();
    if (sb) {
      await sb.auth.signOut();
    }
    setAuthToken(null);
    setAuthUser(null);
    setQuota(null);
    setRoutes([]);
    setAnalytics(null);
    setInquiries([]);
    setApiError(null);
    setSurface('public');
  };

  const handleChangePlan = async (nextPlan: PlanTier) => {
    if (!authToken) return;
    const res = await fetch('/api/auth/plan', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ plan: nextPlan }),
    });
    const data = (await res.json()) as {
      user?: UserProfile;
      quota?: QuotaSummary;
    };
    if (res.ok && data.user && data.quota) {
      setAuthUser(data.user);
      setQuota(data.quota);
    }
  };

  const handleCreateRoute = async (payload: {
    title: string;
    slug: string;
    category: RouteCategory;
    defaultUrl: string;
    iosUrl: string;
    androidUrl: string;
    fallbackUrl: string;
    expiresAt: string | null;
    fgColor: string;
  }) => {
    const res = await fetch('/api/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      route?: QrRouteWithStats;
      quota?: QuotaSummary;
      error?: string;
    };
    if (!res.ok || !data.route) {
      throw new Error(data.error || 'Could not create QR route.');
    }
    setRoutes((prev) => [data.route!, ...prev]);
    if (data.quota) setQuota(data.quota);
    setSelectedRouteId(data.route.id);
    setActiveTab('routes');
    fetchAnalytics();
  };

  const handleUpdateRoute = async (
    id: string,
    patch: Partial<{
      title: string;
      category: RouteCategory;
      defaultUrl: string;
      iosUrl: string;
      androidUrl: string;
      fallbackUrl: string;
      expiresAt: string | null;
      active: boolean;
      fgColor: string;
    }>
  ) => {
    const res = await fetch(`/api/links/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as {
      route?: QrRouteWithStats;
      quota?: QuotaSummary;
      error?: string;
    };
    if (!res.ok || !data.route) {
      throw new Error(data.error || 'Could not save changes.');
    }
    setRoutes((prev) => prev.map((r) => (r.id === id ? data.route! : r)));
    if (data.quota) setQuota(data.quota);
    fetchAnalytics();
  };

  const handleDeleteRoute = async (id: string) => {
    const res = await fetch(`/api/links/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { quota?: QuotaSummary };
    if (data.quota) setQuota(data.quota);
    setRoutes((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (selectedRouteId === id) {
        setSelectedRouteId(next[0]?.id ?? null);
      }
      return next;
    });
    fetchAnalytics();
  };

  const handleTestScan = async (id: string, device: DeviceType) => {
    const res = await fetch(`/api/links/${encodeURIComponent(id)}/test-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ device }),
    });
    const data = (await res.json()) as {
      resolvedUrl: string | null;
      active: boolean;
    };
    await Promise.all([fetchRoutes(), fetchAnalytics()]);
    return data;
  };

  const handleToggleInquiryStatus = async (
    id: string,
    nextStatus: 'New' | 'Contacted'
  ) => {
    const res = await fetch(`/api/inquiries/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { inquiry: ClientInquiry };
    setInquiries((prev) => prev.map((i) => (i.id === id ? data.inquiry : i)));
  };

  const handleQuickCreateFromDemo = (url: string, fgColor: string) => {
    setDraftUrl(url);
    setDraftFgColor(fgColor);
    setSurface('dashboard');
    setActiveTab('routes');
    if (authToken) {
      setNewModalOpen(true);
    } else {
      setPendingQuickCreate(true);
    }
  };

  const newInquiriesCount = inquiries.filter((i) => i.status === 'New').length;
  const isAdmin = authUser?.role === 'admin';

  const navItems: {
    id: DashboardTab;
    label: string;
    icon: typeof QrCode;
    meta?: string;
    adminOnly?: boolean;
  }[] = [
    {
      id: 'routes',
      label: 'QR Routes',
      icon: QrCode,
      meta: `${routes.length}`,
    },
    {
      id: 'analytics',
      label: 'Scan Analytics',
      icon: BarChart3,
      meta: analytics ? `${analytics.totalScans}` : undefined,
    },
    {
      id: 'inquiries',
      label: 'Client Inquiries',
      icon: Inbox,
      meta: newInquiriesCount > 0 ? `${newInquiriesCount}` : `${inquiries.length}`,
      adminOnly: true,
    },
    {
      id: 'hosting',
      label: 'Hosting & Setup',
      icon: CloudUpload,
      adminOnly: true,
    },
  ];

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const activeNavLabel =
    visibleNavItems.find((item) => item.id === activeTab)?.label ?? 'QR Routes';

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://scanroute.app';

  if (surface === 'public') {
    return (
      <PublicWebsite
        onOpenDashboard={() => {
          setSurface('dashboard');
          window.scrollTo({ top: 0 });
        }}
        onQuickCreateFromDemo={handleQuickCreateFromDemo}
        onInquirySubmitted={() => {
          if (authToken && isAdmin) fetchInquiries();
        }}
      />
    );
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-xs font-medium text-slate-500">Loading workspace...</div>
      </div>
    );
  }

  if (!authToken || !authUser) {
    return (
      <AuthGate
        supabaseEnabled={supabaseEnabled}
        bootstrapRequired={bootstrapRequired}
        supabaseIssue={supabaseIssue}
        onAuthenticated={handleAuthenticated}
        onBackToPublic={() => {
          setPendingQuickCreate(false);
          setSurface('public');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200 min-h-screen print:hidden">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            ScanRoute
          </div>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {authUser.businessName || authUser.email}
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Workspace navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-50 text-sky-900 border border-sky-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-sky-700' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </span>
                {item.meta !== undefined && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-500">
                    {item.meta}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3 text-xs">
          {quota && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  {quota.isAdmin ? 'Owner Unlimited' : `${quota.planLabel} Plan`}
                </span>
                {!quota.isAdmin && (
                  <select
                    aria-label="Switch account plan"
                    value={quota.plan}
                    onChange={(e) => handleChangePlan(e.target.value as PlanTier)}
                    className="text-[11px] bg-white border border-slate-200 rounded-xs px-1.5 py-0.5 text-slate-700 cursor-pointer"
                  >
                    <option value="starter">Starter</option>
                    <option value="business">Business</option>
                    <option value="agency">Agency</option>
                  </select>
                )}
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>Active Routes</span>
                <span className="font-mono tabular-nums text-slate-800">
                  {quota.activeRoutes}
                  {quota.maxActiveRoutes !== null ? ` / ${quota.maxActiveRoutes}` : ''}
                </span>
              </div>
              {quota.maxMonthlyScans !== null && (
                <div className="flex items-center justify-between text-slate-500">
                  <span>Monthly Scans</span>
                  <span className="font-mono tabular-nums text-slate-800">
                    {quota.monthlyScans} / {quota.maxMonthlyScans.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setSurface('public')}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            View Public Website
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <button
                type="button"
                onClick={() => setSurface('public')}
                className="font-medium text-slate-900 hover:underline underline-offset-4 whitespace-nowrap cursor-pointer"
              >
                ScanRoute
              </button>
              <span aria-hidden="true">/</span>
              <span className="text-slate-600 truncate">{activeNavLabel}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDraftUrl(undefined);
              setDraftFgColor(undefined);
              setNewModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New QR Route
          </button>
        </header>

        {mobileMenuOpen && (
          <nav
            className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1 print:hidden"
            aria-label="Mobile workspace navigation"
          >
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-md cursor-pointer ${
                    isActive
                      ? 'bg-sky-50 text-sky-900 border border-sky-200'
                      : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.meta !== undefined && (
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      {item.meta}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setSurface('public');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              View Public Website
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </nav>
        )}

        <main
          className={`flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1280px] w-full mx-auto space-y-6 ${
            posterRoute ? 'print:hidden' : ''
          }`}
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
              {activeTab === 'routes' && 'Dynamic QR Routes & Live Link Studio'}
              {activeTab === 'analytics' && 'Real-Time Scan Telemetry & Device Split'}
              {activeTab === 'inquiries' && 'Client Setup Inquiries'}
              {activeTab === 'hosting' && 'Supabase Postgres & Azure Deployment'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
              {activeTab === 'routes' &&
                'Generate print-ready PNG/SVG QR codes and printable table flyers. Swap destination URLs, OS targets, or expiry dates anytime without reprinting.'}
              {activeTab === 'analytics' &&
                'Track daily scan volume, phone OS splits, and top-performing physical signs across your routes.'}
              {activeTab === 'inquiries' &&
                'Review and follow up on setup requests submitted by businesses on your public landing page.'}
              {activeTab === 'hosting' &&
                'Run supabase/schema.sql, configure Azure App Service B1, and keep Supabase Free active with the 3-day cron job.'}
            </p>
          </div>

          {(supabaseIssue || apiError) && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-amber-950">
                    {supabaseIssue?.code === 'missing_tables'
                      ? 'Finish Supabase Database Setup'
                      : 'Database Connection Notice'}
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    {supabaseIssue?.message || apiError}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {supabaseIssue?.code === 'missing_tables' && (
                  <button
                    type="button"
                    onClick={handleCopySchemaSql}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {schemaCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Copied SQL
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy supabase/schema.sql
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRecheckConnection}
                  disabled={rechecking}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} />
                  {rechecking ? 'Checking...' : 'Recheck Connection'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'routes' && (
            <RoutesWorkspace
              routes={routes}
              loading={routesLoading}
              selectedId={selectedRouteId}
              onSelectId={setSelectedRouteId}
              onUpdateRoute={handleUpdateRoute}
              onDeleteRoute={handleDeleteRoute}
              onTestScan={handleTestScan}
              onOpenNewModal={() => setNewModalOpen(true)}
              onOpenPoster={setPosterRoute}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              analytics={analytics}
              loading={analyticsLoading}
              onRefresh={() => fetchAnalytics()}
            />
          )}

          {activeTab === 'inquiries' && isAdmin && (
            <InquiriesView
              inquiries={inquiries}
              loading={inquiriesLoading}
              onRefresh={() => fetchInquiries()}
              onToggleStatus={handleToggleInquiryStatus}
            />
          )}

          {activeTab === 'hosting' && isAdmin && <AzureDeployView />}
        </main>
      </div>

      <NewRouteModal
        open={newModalOpen}
        initialUrl={draftUrl}
        initialFgColor={draftFgColor}
        onClose={() => setNewModalOpen(false)}
        onCreate={handleCreateRoute}
      />

      <PrintPosterModal
        route={posterRoute}
        shortUrl={posterRoute ? `${origin}/r/${posterRoute.slug}` : ''}
        onClose={() => setPosterRoute(null)}
      />
    </div>
  );
}
