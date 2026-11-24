import React from 'react';
import { CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { ClientInquiry } from '../types/qr';

interface InquiriesViewProps {
  inquiries: ClientInquiry[];
  loading: boolean;
  onRefresh: () => void;
  onToggleStatus: (id: string, nextStatus: 'New' | 'Contacted') => Promise<void>;
}

export const InquiriesView: React.FC<InquiriesViewProps> = ({
  inquiries,
  loading,
  onRefresh,
  onToggleStatus,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Incoming Client Setup Inquiries
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Leads submitted through your public ScanRoute website contact form.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading && inquiries.length === 0 ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-12 bg-slate-100 rounded-md animate-pulse" />
          ))}
        </div>
      ) : inquiries.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-slate-900">No client inquiries yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Submissions from the public website onboarding form will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 px-4">Business & Contact</th>
                <th className="py-2.5 px-3">Plan</th>
                <th className="py-2.5 px-3">Details</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Received</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inquiries.map((inq) => (
                <tr key={inq.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{inq.businessName}</div>
                    <div className="mt-0.5 text-slate-500 font-mono">{inq.email}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-700 whitespace-nowrap font-mono">
                    {inq.plan}
                  </td>
                  <td className="py-3 px-3 text-slate-600 max-w-xs">
                    {inq.message || 'No additional notes'}
                  </td>
                  <td className="py-3 px-3 text-slate-500 font-mono tabular-nums whitespace-nowrap">
                    {new Date(inq.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        onToggleStatus(
                          inq.id,
                          inq.status === 'New' ? 'Contacted' : 'New'
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border cursor-pointer ${
                        inq.status === 'Contacted'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {inq.status === 'Contacted' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      {inq.status}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
