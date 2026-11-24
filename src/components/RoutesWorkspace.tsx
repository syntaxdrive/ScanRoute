import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  PauseCircle,
  Search,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { DeviceType, QrRouteWithStats, RouteCategory } from '../types/qr';
import { QrCodePreview } from './QrCodePreview';

interface RoutesWorkspaceProps {
  routes: QrRouteWithStats[];
  loading: boolean;
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onUpdateRoute: (
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
  ) => Promise<void>;
  onDeleteRoute: (id: string) => Promise<void>;
  onTestScan: (
    id: string,
    device: DeviceType
  ) => Promise<{ resolvedUrl: string | null; active: boolean }>;
  onOpenNewModal: () => void;
  onOpenPoster: (route: QrRouteWithStats) => void;
}

const CATEGORIES: ('All' | RouteCategory)[] = [
  'All',
  'Restaurant & Cafe',
  'Real Estate',
  'Product Packaging',
  'Local Service',
  'Events & Flyers',
];

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export const RoutesWorkspace: React.FC<RoutesWorkspaceProps> = ({
  routes,
  loading,
  selectedId,
  onSelectId,
  onUpdateRoute,
  onDeleteRoute,
  onTestScan,
  onOpenNewModal,
  onOpenPoster,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | RouteCategory>('All');
  const [copiedSlug, setCopiedSlug] = useState(false);

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return routes.filter((r) => {
      if (categoryFilter !== 'All' && r.category !== categoryFilter) return false;
      if (q) {
        const text = `${r.title} ${r.slug} ${r.defaultUrl}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [routes, search, categoryFilter]);

  const activeRoute = useMemo(() => {
    return (
      routes.find((r) => r.id === selectedId) ??
      filteredRoutes[0] ??
      routes[0] ??
      null
    );
  }, [routes, filteredRoutes, selectedId]);

  const [editTitle, setEditTitle] = useState('');
  const [editDefaultUrl, setEditDefaultUrl] = useState('');
  const [editIosUrl, setEditIosUrl] = useState('');
  const [editAndroidUrl, setEditAndroidUrl] = useState('');
  const [editFallbackUrl, setEditFallbackUrl] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editFgColor, setEditFgColor] = useState('#0f172a');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    if (!activeRoute) return;
    setEditTitle(activeRoute.title);
    setEditDefaultUrl(activeRoute.defaultUrl);
    setEditIosUrl(activeRoute.iosUrl);
    setEditAndroidUrl(activeRoute.androidUrl);
    setEditFallbackUrl(activeRoute.fallbackUrl);
    setEditExpiresAt(toDatetimeLocalValue(activeRoute.expiresAt));
    setEditFgColor(activeRoute.fgColor);
    setEditActive(activeRoute.active);
    setSaveMessage('');
    setSaveError('');
    setConfirmDelete(false);
    setTestResult('');
  }, [activeRoute?.id, activeRoute?.updatedAt]);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://scanroute.app';
  const shortUrl = activeRoute ? `${origin}/r/${activeRoute.slug}` : '';

  const handleCopyShortUrl = async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedSlug(true);
      window.setTimeout(() => setCopiedSlug(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoute) return;
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      await onUpdateRoute(activeRoute.id, {
        title: editTitle.trim(),
        defaultUrl: editDefaultUrl.trim(),
        iosUrl: editIosUrl.trim(),
        androidUrl: editAndroidUrl.trim(),
        fallbackUrl: editFallbackUrl.trim(),
        expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
        fgColor: editFgColor,
        active: editActive,
      });
      setSaveMessage('Route saved live.');
      window.setTimeout(() => setSaveMessage(''), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save route.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeviceTest = async (device: DeviceType) => {
    if (!activeRoute) return;
    const res = await onTestScan(activeRoute.id, device);
    if (res.resolvedUrl) {
      setTestResult(`${device} scan logged -> redirects to ${res.resolvedUrl}`);
    } else {
      setTestResult(`${device} scan logged -> shows Campaign Paused screen`);
    }
  };

  const handleDelete = async () => {
    if (!activeRoute) return;
    await onDeleteRoute(activeRoute.id);
    setConfirmDelete(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter routes by client, slug, or URL..."
            aria-label="Filter QR routes"
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="h-11 bg-slate-100 rounded-md animate-pulse" />
              ))}
            </div>
          ) : filteredRoutes.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-slate-900">
                {routes.length === 0
                  ? 'No dynamic QR routes created yet.'
                  : 'No routes match your current filter.'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Create a dynamic QR route to start capturing scans and swapping destination links without reprinting.
              </p>
              <button
                type="button"
                onClick={
                  routes.length === 0
                    ? onOpenNewModal
                    : () => {
                        setSearch('');
                        setCategoryFilter('All');
                      }
                }
                className="mt-4 px-4 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md cursor-pointer whitespace-nowrap"
              >
                {routes.length === 0 ? 'Create First QR Route' : 'Reset Filters'}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Route & Destination</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Slug</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Scans</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredRoutes.map((route) => {
                    const isSelected = activeRoute?.id === route.id;
                    return (
                      <tr
                        key={route.id}
                        onClick={() => onSelectId(route.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4 max-w-[280px]">
                          <div className="font-medium text-slate-900 truncate">
                            {route.title}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 truncate font-mono">
                            {route.defaultUrl}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs font-mono text-slate-700 whitespace-nowrap">
                          /r/{route.slug}
                        </td>
                        <td className="py-3 px-3 text-right text-xs font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {route.totalScans}
                        </td>
                        <td className="py-3 px-4 text-right text-xs whitespace-nowrap">
                          {route.active ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <PauseCircle className="w-3.5 h-3.5" />
                              Paused
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          {!activeRoute ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Select a route from the table to inspect and edit its QR code.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span>{activeRoute.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeRoute.totalScans} total scans
                    </span>
                  </div>
                  <h2 className="mt-1 text-base font-semibold text-slate-900 truncate">
                    {activeRoute.title}
                  </h2>
                </div>

                <a
                  href={`/r/${activeRoute.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 border border-sky-200 rounded-md whitespace-nowrap shrink-0"
                >
                  Open Link
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <QrCodePreview
                targetUrl={shortUrl}
                slug={activeRoute.slug}
                title={activeRoute.title}
                fgColor={editFgColor}
                bgColor={activeRoute.bgColor}
                onOpenPrintPoster={() => onOpenPoster(activeRoute)}
              />

              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-xs font-mono text-slate-700 truncate">
                  {shortUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyShortUrl}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedSlug ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                    Test Live Routing & Analytics
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['iOS', 'Android', 'Desktop'] as DeviceType[]).map((dev) => (
                    <button
                      key={dev}
                      type="button"
                      onClick={() => handleDeviceTest(dev)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      Simulate {dev}
                    </button>
                  ))}
                </div>
                {testResult && (
                  <p className="text-[11px] font-mono text-sky-800 bg-sky-50 border border-sky-200 rounded-md px-2.5 py-1.5 break-all">
                    {testResult}
                  </p>
                )}
              </div>

              <form onSubmit={handleSave} className="pt-4 border-t border-slate-200 space-y-3.5">
                {saveError && (
                  <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
                    {saveError}
                  </div>
                )}
                {saveMessage && (
                  <div className="p-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
                    {saveMessage}
                  </div>
                )}

                <div>
                  <label htmlFor="edit-title" className="block text-xs font-medium text-slate-700 mb-1">
                    Route Name
                  </label>
                  <input
                    id="edit-title"
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                <div>
                  <label htmlFor="edit-default-url" className="block text-xs font-medium text-slate-700 mb-1">
                    Destination URL (updates printed QR instantly)
                  </label>
                  <input
                    id="edit-default-url"
                    type="url"
                    required
                    value={editDefaultUrl}
                    onChange={(e) => setEditDefaultUrl(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="edit-ios" className="block text-[11px] font-medium text-slate-600 mb-1">
                      iOS Override (optional)
                    </label>
                    <input
                      id="edit-ios"
                      type="url"
                      value={editIosUrl}
                      onChange={(e) => setEditIosUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-android" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Android Override (optional)
                    </label>
                    <input
                      id="edit-android"
                      type="url"
                      value={editAndroidUrl}
                      onChange={(e) => setEditAndroidUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="edit-expiry" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Scheduled Expiry (optional)
                    </label>
                    <input
                      id="edit-expiry"
                      type="datetime-local"
                      value={editExpiresAt}
                      onChange={(e) => setEditExpiresAt(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-fallback" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Paused / Expired Fallback URL
                    </label>
                    <input
                      id="edit-fallback"
                      type="url"
                      value={editFallbackUrl}
                      onChange={(e) => setEditFallbackUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="rounded-xs accent-sky-700 cursor-pointer"
                    />
                    Route Active
                  </label>

                  <div className="flex items-center gap-2">
                    <label htmlFor="edit-color" className="text-xs text-slate-600">
                      Ink
                    </label>
                    <input
                      id="edit-color"
                      type="color"
                      value={editFgColor}
                      onChange={(e) => setEditFgColor(e.target.value)}
                      className="w-7 h-6 p-0.5 border border-slate-200 rounded-xs bg-white cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-2">
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="px-3 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md cursor-pointer whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
