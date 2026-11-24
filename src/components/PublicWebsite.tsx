import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowRight, CheckCircle2, Download, QrCode } from 'lucide-react';

interface PublicWebsiteProps {
  onOpenDashboard: () => void;
  onQuickCreateFromDemo: (url: string, fgColor: string) => void;
  onInquirySubmitted: () => void;
}

interface PricingPlan {
  audience: string;
  name: string;
  priceLabel: string;
  planValue: string;
  summary: string;
  limits: { label: string; value: string }[];
  featured?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    audience: 'For single-location shops',
    name: 'Starter',
    priceLabel: '$12',
    planValue: 'Starter ($12/mo)',
    summary: 'Everything needed for one cafe menu, counter sign, or event flyer.',
    limits: [
      { label: 'Dynamic QR Routes', value: '5 active routes' },
      { label: 'Monthly Scans', value: '10,000 / mo' },
      { label: 'Destination Edits', value: 'Unlimited' },
      { label: 'Exports', value: 'PNG + Vector SVG' },
    ],
  },
  {
    audience: 'For growing businesses',
    name: 'Business',
    priceLabel: '$29',
    planValue: 'Business ($29/mo)',
    summary: 'Built for restaurants, real estate agents, and e-commerce packaging inserts.',
    featured: true,
    limits: [
      { label: 'Dynamic QR Routes', value: '35 active routes' },
      { label: 'Monthly Scans', value: '100,000 / mo' },
      { label: 'Smart OS Routing', value: 'iOS / Android / Desktop' },
      { label: 'Print Assets', value: 'Table-tent flyer kit' },
    ],
  },
  {
    audience: 'For agencies & print studios',
    name: 'Agency',
    priceLabel: '$79',
    planValue: 'Agency ($79/mo)',
    summary: 'Manage client signage and multi-location campaigns from one console.',
    limits: [
      { label: 'Dynamic QR Routes', value: '250 active routes' },
      { label: 'Monthly Scans', value: 'Unlimited' },
      { label: 'Fallback Protection', value: 'Pause & expiry URLs' },
      { label: 'Client Branding', value: 'Custom QR ink colors' },
    ],
  },
];

const INDUSTRIES = [
  {
    title: 'Hospitality & Table Menus',
    metric: '0 Reprints per Seasonal Menu Update',
    image: '/src/assets/images/hero_qr_bistro_1795559384800.jpg',
    alt: 'Minimalist tabletop QR menu stand beside an espresso cup in a sunlit cafe',
    description:
      'Keep laminated table stands on every booth permanently. Swap breakfast, dinner, or weekend happy-hour links in five seconds without ordering new print runs.',
  },
  {
    title: 'Real Estate Yard Signs',
    metric: '1 Permanent Sign Across 12+ Listings',
    image: '/src/assets/images/usecase_realestate_sign_1795559386167.jpg',
    alt: 'Modern residential property exterior with a navy and white QR yard sign',
    description:
      'Point metal yard signs and lockbox riders to the active listing page, then redirect the exact same physical sign to your next property the day escrow closes.',
  },
  {
    title: 'Retail & Packaging Inserts',
    metric: '38% Higher Repeat-Order Scans',
    image: '/src/assets/images/usecase_packaging_insert_1795559385911.jpg',
    alt: 'Minimalist skincare boxes and thank-you packaging card with printed QR code',
    description:
      'Route iPhone and Android buyers automatically to setup videos, reorder bundles, or loyalty sign-ups—even months after your product boxes leave the warehouse.',
  },
];

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  onOpenDashboard,
  onQuickCreateFromDemo,
  onInquirySubmitted,
}) => {
  const [demoUrl, setDemoUrl] = useState('https://yourbusiness.com/menu');
  const [demoColor, setDemoColor] = useState('#0f172a');
  const [demoQrDataUrl, setDemoQrDataUrl] = useState('');
  const [demoError, setDemoError] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('Business ($29/mo)');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const trimmed = demoUrl.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setDemoError('Enter a valid http:// or https:// web address to preview.');
      setDemoQrDataUrl('');
      return;
    }
    setDemoError('');
    QRCode.toDataURL(trimmed, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: demoColor, light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDemoQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDemoError('Unable to generate QR preview.');
      });
    return () => {
      cancelled = true;
    };
  }, [demoUrl, demoColor]);

  const handleDownloadDemo = () => {
    if (!demoQrDataUrl) return;
    const a = document.createElement('a');
    a.href = demoQrDataUrl;
    a.download = 'scanroute-sample-qr.png';
    a.click();
  };

  const handleSelectPlanForContact = (planValue: string) => {
    setSelectedPlan(planValue);
    const el = document.getElementById('contact');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          email: email.trim(),
          plan: selectedPlan,
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to submit request.');
      }
      setSubmitSuccess(true);
      setBusinessName('');
      setEmail('');
      setMessage('');
      onInquirySubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Navigation Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ScanRoute
          </a>

          <nav
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
            aria-label="Primary site navigation"
          >
            <a
              href="#capabilities"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#industries"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Industries
            </a>
            <a
              href="#pricing"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#contact"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenDashboard}
              className="px-4 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Open Dashboard
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2">
                <span>Dynamic QR Infrastructure</span>
                <span aria-hidden="true">·</span>
                <span>Print-Ready SVG & PNG</span>
                <span aria-hidden="true">·</span>
                <span>Zero Ad Interstitials</span>
              </div>

              <h1
                className="mt-4 font-bold tracking-tight text-slate-900 leading-[1.1] text-balance"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.4rem)' }}
              >
                Print your signage once. Change where every scan goes forever.
              </h1>

              <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
                ScanRoute gives restaurants, real estate agents, and retail brands permanent dynamic QR codes that never expire—so updating a menu, property listing, or seasonal offer takes five seconds instead of a new print order.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Launch QR Workspace
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#pricing"
                  className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
                >
                  View Plans & Setup
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                {brokenImages.hero ? (
                  <div className="w-full h-full min-h-[320px] flex flex-col items-center justify-center p-8 text-center bg-slate-100">
                    <QrCode className="w-10 h-10 text-slate-400" />
                    <span className="mt-2 text-xs font-medium text-slate-600">
                      Tabletop Dynamic QR Display
                    </span>
                  </div>
                ) : (
                  <img
                    src="/src/assets/images/hero_qr_bistro_1795559384800.jpg"
                    alt="Modern cafe oak table with minimalist white tabletop QR menu stand"
                    referrerPolicy="no-referrer"
                    onError={() => setBrokenImages((prev) => ({ ...prev, hero: true }))}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
          </div>

          {/* 4-Column Operational KPI Strip below Hero */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white border border-slate-200 rounded-lg p-5">
            <div>
              <div className="text-xs text-slate-500">Redirect Latency</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
                &lt; 25 ms
              </div>
              <div className="mt-0.5 text-xs text-slate-500">Direct HTTP 302 routing</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Print Quality</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
                1024 px + SVG
              </div>
              <div className="mt-0.5 text-xs text-slate-500">Ready for flyers & signage</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Device Targeting</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
                iOS / Android
              </div>
              <div className="mt-0.5 text-xs text-slate-500">Automatic OS split rules</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Starting Plan</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
                $12 / mo
              </div>
              <div className="mt-0.5 text-xs text-slate-500">Cancel or pause anytime</div>
            </div>
          </div>
        </section>

        {/* Interactive Live QR Preview Widget */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
          <div className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="text-xs font-medium text-sky-700">Live Preview</div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Test a dynamic QR code with your own link right now
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
                Paste any menu, booking page, or online store link to generate a crisp sample QR code. Save it into your workspace to unlock instant destination swaps and live scan tracking.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
                <div className="sm:col-span-9">
                  <label htmlFor="demo-url-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Destination Web Address
                  </label>
                  <input
                    id="demo-url-input"
                    type="url"
                    value={demoUrl}
                    onChange={(e) => setDemoUrl(e.target.value)}
                    placeholder="https://yourbusiness.com/menu"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor="demo-color-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Ink Color
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                    <input
                      id="demo-color-input"
                      type="color"
                      value={demoColor}
                      onChange={(e) => setDemoColor(e.target.value)}
                      className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-700">{demoColor}</span>
                  </div>
                </div>
              </div>

              {demoError && <p className="text-xs text-rose-700">{demoError}</p>}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onQuickCreateFromDemo(demoUrl.trim(), demoColor)}
                  disabled={Boolean(demoError)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  Save as Dynamic Route
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDemo}
                  disabled={!demoQrDataUrl}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample PNG
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 flex justify-center">
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-3 w-full max-w-[260px]">
                {demoQrDataUrl ? (
                  <img
                    src={demoQrDataUrl}
                    alt="Live generated QR code preview"
                    className="w-44 h-44 mx-auto bg-white p-2 border border-slate-200 rounded-sm"
                  />
                ) : (
                  <div className="w-44 h-44 mx-auto bg-slate-200 rounded-sm flex items-center justify-center text-xs text-slate-500">
                    Invalid URL
                  </div>
                )}
                <div className="text-xs text-slate-500 font-mono truncate">{demoUrl}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Capabilities Asymmetric Bento */}
        <section id="capabilities" className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
          <div className="max-w-2xl mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Built to protect physical print investments
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Every ScanRoute code resolves through a clean, fast redirect URL so your printed material stays accurate long after it leaves the print shop.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg p-6">
              <div className="text-xs font-mono text-slate-500">01</div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                Instant Destination Swaps Without Reprinting
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Update any QR code’s destination link from your browser in seconds. Switch a storefront poster from a holiday promo to a loyalty sign-up, or redirect an expired brochure to your current catalog without touching the artwork.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <div className="text-xs font-mono text-slate-500">02</div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                iOS & Android Smart Routing
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Detect mobile operating systems automatically so iPhone scans open Apple App Store or Wallet links while Android phones open Google Play.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <div className="text-xs font-mono text-slate-500">03</div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                Printable Counter Flyers Included
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Generate print-ready 1024px PNGs, crisp vector SVGs, and formatted tabletop cards you can print straight from any browser.
              </p>
            </div>

            <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg p-6">
              <div className="text-xs font-mono text-slate-500">04</div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                Real-Time Scan Analytics & Campaign Pause Fallbacks
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                See daily scan volume and device breakdown across every flyer, yard sign, and product insert. Temporarily pause any promotion and route scanners to a clean fallback page rather than a dead 404 screen.
              </p>
            </div>
          </div>
        </section>

        {/* Industries / Proof of Impact */}
        <section id="industries" className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
          <div className="max-w-2xl mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Where businesses rely on ScanRoute every day
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Designed for physical-to-digital touchpoints where broken links or outdated flyers cost real revenue.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {INDUSTRIES.map((item) => (
              <article
                key={item.title}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-slate-100 border-b border-slate-200 overflow-hidden">
                  {brokenImages[item.title] ? (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                      {item.title}
                    </div>
                  ) : (
                    <img
                      src={item.image}
                      alt={item.alt}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [item.title]: true }))
                      }
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs font-mono text-sky-700 font-medium">
                      {item.metric}
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Transparent Pricing */}
        <section id="pricing" className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16">
          <div className="max-w-2xl mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Straightforward monthly plans
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              No per-scan surprise fees and no third-party ads shown to your customers before redirecting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`bg-white rounded-lg p-6 flex flex-col justify-between ${
                  plan.featured
                    ? 'border-2 border-sky-700'
                    : 'border border-slate-200'
                }`}
              >
                <div>
                  <div className="text-xs text-slate-500">{plan.audience}</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                    <div className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                      {plan.priceLabel}
                      <span className="text-xs font-normal text-slate-500">/mo</span>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                    {plan.summary}
                  </p>

                  <div className="mt-5 pt-4 border-t border-slate-200 space-y-2.5">
                    {plan.limits.map((lim) => (
                      <div
                        key={lim.label}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-slate-500">{lim.label}</span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {lim.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectPlanForContact(plan.planValue)}
                  className={`mt-6 w-full py-2.5 px-4 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    plan.featured
                      ? 'bg-sky-700 hover:bg-sky-800 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  Request {plan.name} Setup
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Client Inquiry / Custom Onboarding Form */}
        <section id="contact" className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-20">
          <div className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-3">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Get set up for your business today
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Want custom QR routes and print-ready flyers prepared for your tables, yard signs, or packaging? Send your details and we will configure your workspace and share your ready-to-print files.
              </p>
              <div className="pt-2 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Same-day custom route & flyer setup</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Zero ads or countdowns before redirect</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Includes print-ready SVG and 1024px PNG files</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              {submitSuccess ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-md space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    Request received
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Thank you. Your setup inquiry has been saved, and you can also inspect live route creation right now inside the dashboard.
                  </p>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSubmitSuccess(false)}
                      className="px-3.5 py-2 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 rounded-md hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                    >
                      Send Another Inquiry
                    </button>
                    <button
                      type="button"
                      onClick={onOpenDashboard}
                      className="px-3.5 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      Open Live Workspace
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInquirySubmit} className="space-y-4">
                  {submitError && (
                    <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
                      {submitError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="inq-business" className="block text-xs font-medium text-slate-700 mb-1">
                        Business or Your Name
                      </label>
                      <input
                        id="inq-business"
                        type="text"
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Harbor Street Bistro"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="inq-email" className="block text-xs font-medium text-slate-700 mb-1">
                        Work Email
                      </label>
                      <input
                        id="inq-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="owner@harborbistro.com"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="inq-plan" className="block text-xs font-medium text-slate-700 mb-1">
                      Plan Interest
                    </label>
                    <select
                      id="inq-plan"
                      value={selectedPlan}
                      onChange={(e) => setSelectedPlan(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    >
                      <option value="Starter ($12/mo)">Starter ($12/mo)</option>
                      <option value="Business ($29/mo)">Business ($29/mo)</option>
                      <option value="Agency ($79/mo)">Agency ($79/mo)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="inq-message" className="block text-xs font-medium text-slate-700 mb-1">
                      What will you be printing QR codes on? (optional)
                    </label>
                    <textarea
                      id="inq-message"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="e.g., 20 table menu cards and a front window sign..."
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {submitting ? 'Submitting...' : 'Request Onboarding & Sample Flyers'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Official Footer */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold text-slate-900">ScanRoute</span>
            <span>Dynamic QR & Smart Link Infrastructure</span>
            <span aria-hidden="true">·</span>
            <span>hello@scanroute.app</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#capabilities" className="hover:text-slate-900">
              Capabilities
            </a>
            <a href="#pricing" className="hover:text-slate-900">
              Pricing
            </a>
            <button
              type="button"
              onClick={onOpenDashboard}
              className="hover:text-slate-900 cursor-pointer"
            >
              Client Dashboard
            </button>
            <span>© {new Date().getFullYear()} ScanRoute</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
