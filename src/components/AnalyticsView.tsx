import React from 'react';
import { RefreshCw } from 'lucide-react';
import { AnalyticsResponse, DeviceType } from '../types/qr';
import { ScanVolumeChart } from './ScanVolumeChart';

interface AnalyticsViewProps {
  analytics: AnalyticsResponse | null;
  loading: boolean;
  onRefresh: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  analytics,
  loading,
  onRefresh,
}) => {
  if (loading && !analytics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
        <p className="text-sm font-medium text-slate-900">Unable to load scan telemetry.</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-3 px-4 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md cursor-pointer whitespace-nowrap"
        >
          Retry
        </button>
      </div>
    );
  }

  const deviceEntries: { device: DeviceType; count: number; pct: number }[] = (
    ['iOS', 'Android', 'Desktop'] as DeviceType[]
  ).map((device) => {
    const count = analytics.deviceCounts[device] ?? 0;
    const pct = analytics.totalScans > 0 ? Math.round((count / analytics.totalScans) * 100) : 0;
    return { device, count, pct };
  });

  const topDevice = [...deviceEntries].sort((a, b) => b.count - a.count)[0];
  const topRoute = analytics.topRoutes[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Tracked Scans</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {analytics.totalScans}
          </div>
          <div className="mt-1 text-xs text-slate-500">All-time route redirects</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Active QR Routes</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {analytics.activeRoutes}
            <span className="text-sm font-normal text-slate-500"> / {analytics.totalRoutes}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Serving live redirects</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Primary Scan Device</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {topDevice ? topDevice.device : 'N/A'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {topDevice ? `${topDevice.pct}% of all scans` : 'No scans yet'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Highest Volume Route</div>
          <div className="mt-1.5 text-lg font-semibold text-slate-900 truncate">
            {topRoute ? `/r/${topRoute.slug}` : 'N/A'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums truncate">
            {topRoute ? `${topRoute.scans} scans` : 'Create a route'}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-sm font-semibold text-slate-900">14-Day Scan Volume</h2>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <ScanVolumeChart series={analytics.dailySeries} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
            Device Breakdown
          </h3>
          <div className="space-y-4">
            {deviceEntries.map((item) => (
              <div key={item.device} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800">{item.device}</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    {item.count} scans ({item.pct}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-xs overflow-hidden">
                  <div
                    className="h-full bg-sky-600 rounded-xs"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Recent Scan Log</h3>
            <span className="text-xs text-slate-500">Latest 20 redirects</span>
          </div>

          {analytics.recentScans.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No scan events recorded yet. Test any route or open /r/:slug to record live scans.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2 px-4">Slug</th>
                    <th className="py-2 px-3">Device</th>
                    <th className="py-2 px-3">Source</th>
                    <th className="py-2 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {analytics.recentScans.slice(0, 10).map((scan) => (
                    <tr key={scan.id} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-medium text-slate-900">/r/{scan.slug}</td>
                      <td className="py-2 px-3 text-slate-700">{scan.device}</td>
                      <td className="py-2 px-3 font-sans text-slate-600">{scan.referrer}</td>
                      <td className="py-2 px-4 text-right text-slate-500 whitespace-nowrap">
                        {new Date(scan.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
