import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { RouteCategory } from '../types/qr';

interface NewRouteModalProps {
  open: boolean;
  onClose: () => void;
  initialUrl?: string;
  initialFgColor?: string;
  onCreate: (payload: {
    title: string;
    slug: string;
    category: RouteCategory;
    defaultUrl: string;
    iosUrl: string;
    androidUrl: string;
    fallbackUrl: string;
    expiresAt: string | null;
    fgColor: string;
  }) => Promise<void>;
}

const CATEGORIES: RouteCategory[] = [
  'Restaurant & Cafe',
  'Real Estate',
  'Product Packaging',
  'Local Service',
  'Events & Flyers',
];

function slugifyTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const NewRouteModal: React.FC<NewRouteModalProps> = ({
  open,
  onClose,
  initialUrl,
  initialFgColor,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState<RouteCategory>('Restaurant & Cafe');
  const [defaultUrl, setDefaultUrl] = useState(initialUrl || 'https://');
  const [iosUrl, setIosUrl] = useState('');
  const [androidUrl, setAndroidUrl] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [fgColor, setFgColor] = useState(initialFgColor || '#0f172a');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (initialUrl) setDefaultUrl(initialUrl);
      if (initialFgColor) setFgColor(initialFgColor);
    }
  }, [open, initialUrl, initialFgColor]);

  if (!open) return null;

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    if (!slugTouched) {
      setSlug(slugifyTitle(nextTitle));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        slug: slug.trim(),
        category,
        defaultUrl: defaultUrl.trim(),
        iosUrl: iosUrl.trim(),
        androidUrl: androidUrl.trim(),
        fallbackUrl: fallbackUrl.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        fgColor,
      });
      setTitle('');
      setSlug('');
      setSlugTouched(false);
      setDefaultUrl('https://');
      setIosUrl('');
      setAndroidUrl('');
      setFallbackUrl('');
      setExpiresAt('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create route.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-route-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="new-route-title" className="text-sm font-semibold text-slate-900">
            Create Dynamic QR Route
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="route-title" className="block text-xs font-medium text-slate-700 mb-1">
              Campaign or Client Name
            </label>
            <input
              id="route-title"
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g., Harbor Cafe — Patio Menu"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="route-slug" className="block text-xs font-medium text-slate-700 mb-1">
                Short Link Slug
              </label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-sky-600">
                <span className="px-2.5 text-xs font-mono text-slate-500 border-r border-slate-200 bg-slate-100 py-2">
                  /r/
                </span>
                <input
                  id="route-slug"
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  placeholder="harbor-menu"
                  className="w-full px-2.5 py-2 text-xs font-mono bg-transparent text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="route-category" className="block text-xs font-medium text-slate-700 mb-1">
                Business Category
              </label>
              <select
                id="route-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as RouteCategory)}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="route-url" className="block text-xs font-medium text-slate-700 mb-1">
              Destination URL (changeable anytime later)
            </label>
            <input
              id="route-url"
              type="url"
              required
              value={defaultUrl}
              onChange={(e) => setDefaultUrl(e.target.value)}
              placeholder="https://example.com/menu"
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="route-ios" className="block text-xs font-medium text-slate-700 mb-1">
                iOS Override URL (optional)
              </label>
              <input
                id="route-ios"
                type="url"
                value={iosUrl}
                onChange={(e) => setIosUrl(e.target.value)}
                placeholder="https://apps.apple.com/..."
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="route-android" className="block text-xs font-medium text-slate-700 mb-1">
                Android Override URL (optional)
              </label>
              <input
                id="route-android"
                type="url"
                value={androidUrl}
                onChange={(e) => setAndroidUrl(e.target.value)}
                placeholder="https://play.google.com/..."
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="route-expiry" className="block text-xs font-medium text-slate-700 mb-1">
                Scheduled Expiry (optional)
              </label>
              <input
                id="route-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="route-fallback" className="block text-xs font-medium text-slate-700 mb-1">
                Fallback / Expired URL (optional)
              </label>
              <input
                id="route-fallback"
                type="url"
                value={fallbackUrl}
                onChange={(e) => setFallbackUrl(e.target.value)}
                placeholder="https://example.com/offers"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2.5">
              <label htmlFor="route-color" className="text-xs font-medium text-slate-700">
                QR Ink Color
              </label>
              <input
                id="route-color"
                type="color"
                value={fgColor}
                onChange={(e) => setFgColor(e.target.value)}
                className="w-8 h-7 p-0.5 bg-white border border-slate-200 rounded-sm cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-500">{fgColor}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap"
              >
                {submitting ? 'Creating...' : 'Create QR Route'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
