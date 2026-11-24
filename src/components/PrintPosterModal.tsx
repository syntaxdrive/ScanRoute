import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';
import { QrRouteWithStats } from '../types/qr';

interface PrintPosterModalProps {
  route: QrRouteWithStats | null;
  shortUrl: string;
  onClose: () => void;
}

export const PrintPosterModal: React.FC<PrintPosterModalProps> = ({
  route,
  shortUrl,
  onClose,
}) => {
  const [headline, setHeadline] = useState('Scan with your phone camera');
  const [subcopy, setSubcopy] = useState('Instant access — no app download needed');
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (!route) return;
    setHeadline(route.title);
    setSubcopy('Point your phone camera to open');
    QRCode.toDataURL(shortUrl, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: route.fgColor, light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [route, shortUrl]);

  if (!route) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between print:hidden">
          <h2 id="poster-modal-title" className="text-sm font-semibold text-slate-900">
            Printable Counter Card & Flyer Kit
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

        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <div className="md:col-span-5 space-y-4 print:hidden">
            <div>
              <label htmlFor="poster-headline" className="block text-xs font-medium text-slate-700 mb-1">
                Sign Headline
              </label>
              <input
                id="poster-headline"
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="poster-subcopy" className="block text-xs font-medium text-slate-700 mb-1">
                Call to Action Line
              </label>
              <input
                id="poster-subcopy"
                type="text"
                value={subcopy}
                onChange={(e) => setSubcopy(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Hand this printed table tent or window flyer directly to a local customer. Because it uses your dynamic{' '}
              <span className="font-mono text-slate-700">/r/{route.slug}</span> route, they never need to reprint it when offers change.
            </p>

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Table Card / Save PDF
            </button>
          </div>

          <div className="md:col-span-7 flex justify-center">
            <div className="w-full max-w-[300px] border-2 border-slate-900 rounded-lg p-6 bg-white text-center space-y-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                {route.category}
              </div>
              <h3 className="text-lg font-bold text-slate-900 leading-snug text-balance">
                {headline}
              </h3>
              <div className="flex justify-center py-2">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={`Printable QR for ${route.title}`}
                    className="w-44 h-44"
                  />
                )}
              </div>
              <p className="text-xs text-slate-600">{subcopy}</p>
              <div className="pt-2 border-t border-slate-200 text-[10px] font-mono text-slate-500 truncate">
                {shortUrl}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
