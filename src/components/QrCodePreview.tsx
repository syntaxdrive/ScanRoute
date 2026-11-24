import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer } from 'lucide-react';

interface QrCodePreviewProps {
  targetUrl: string;
  slug: string;
  title: string;
  fgColor: string;
  bgColor: string;
  onOpenPrintPoster?: () => void;
}

export const QrCodePreview: React.FC<QrCodePreviewProps> = ({
  targetUrl,
  slug,
  title,
  fgColor,
  bgColor,
  onOpenPrintPoster,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      try {
        setError('');
        const [pngUrl, svg] = await Promise.all([
          QRCode.toDataURL(targetUrl, {
            width: 1024,
            margin: 2,
            errorCorrectionLevel: 'M',
            color: {
              dark: fgColor,
              light: bgColor,
            },
          }),
          QRCode.toString(targetUrl, {
            type: 'svg',
            margin: 2,
            errorCorrectionLevel: 'M',
            color: {
              dark: fgColor,
              light: bgColor,
            },
          }),
        ]);

        if (!cancelled) {
          setDataUrl(pngUrl);
          setSvgMarkup(svg);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to render QR preview for this URL.');
        }
      }
    }

    renderQr();
    return () => {
      cancelled = true;
    };
  }, [targetUrl, fgColor, bgColor]);

  const handleDownloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `scanroute-${slug}.png`;
    a.click();
  };

  const handleDownloadSvg = () => {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scanroute-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-md">
        {error ? (
          <p className="text-xs text-rose-700 py-10">{error}</p>
        ) : dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR code for ${title}`}
            className="w-40 h-40 rounded-xs border border-slate-200 bg-white"
          />
        ) : (
          <div className="w-40 h-40 bg-slate-200 animate-pulse rounded-xs" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={!dataUrl}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          PNG
        </button>
        <button
          type="button"
          onClick={handleDownloadSvg}
          disabled={!svgMarkup}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          SVG
        </button>
        {onOpenPrintPoster && (
          <button
            type="button"
            onClick={onOpenPrintPoster}
            disabled={!dataUrl}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Flyer
          </button>
        )}
      </div>
    </div>
  );
};
