import React, { useEffect, useState } from 'react';
import { Check, CheckSquare, Copy, Square } from 'lucide-react';

const DEPLOY_STEPS = [
  {
    id: 'step-1',
    title: '1. Create Supabase Project & Run Schema SQL',
    description:
      'In your free Supabase project, open SQL Editor and run the contents of supabase/schema.sql from this repository. It creates profiles, qr_routes, scan_events, client_inquiries, and automatic signup triggers.',
    command: `-- In Supabase Dashboard -> SQL Editor, paste and run:
--   supabase/schema.sql
-- Then copy your Project URL, anon public key, and service_role secret key.`,
  },
  {
    id: 'step-2',
    title: '2. Deploy ScanRoute to Free Azure App Service B1 Linux',
    description:
      'Your GitHub Student Pack includes 750 hours/month of App Service B1 Linux free for 12 months—hosting both your public storefront and fast /r/:slug redirects.',
    command: `az group create --name scanroute-rg --location eastus
az appservice plan create --name scanroute-plan --resource-group scanroute-rg --sku B1 --is-linux
az webapp create --resource-group scanroute-rg --plan scanroute-plan --name scanroute-app-$RANDOM --runtime "NODE:22-lts"`,
  },
  {
    id: 'step-3',
    title: '3. Wire Supabase, Cron Secret & Build Settings on Azure',
    description:
      'Keep SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET strictly on the server. Build the Vite client with your public VITE_SUPABASE_* values and push.',
    command: `az webapp config appsettings set --resource-group scanroute-rg --name <YOUR_APP_NAME> --settings \\
  NODE_ENV=production \\
  WEBSITES_PORT=3000 \\
  DATA_DIR=/home/data \\
  SUPABASE_URL=https://<PROJECT>.supabase.co \\
  SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \\
  VITE_SUPABASE_URL=https://<PROJECT>.supabase.co \\
  VITE_SUPABASE_ANON_KEY=<ANON_KEY> \\
  CRON_SECRET=<RANDOM_32_CHAR_SECRET> \\
  SCM_DO_BUILD_DURING_DEPLOYMENT=true

az webapp up --resource-group scanroute-rg --name <YOUR_APP_NAME> --runtime "NODE:22-lts"`,
  },
  {
    id: 'step-4',
    title: '4. Enable the 3-Day Keep-Alive Cron (GitHub UI or cron-job.org)',
    description:
      'In your GitHub repo, open Actions -> New workflow -> set up a workflow yourself, paste this YAML as .github/workflows/supabase-keepalive.yml, and add APP_URL and CRON_SECRET under Settings -> Secrets and variables -> Actions. (Or point any free cron service at /api/cron/keep-alive with the Bearer token.)',
    command: `name: Supabase Keep-Alive Ping

on:
  schedule:
    - cron: '0 8 */3 * *'
  workflow_dispatch:

jobs:
  ping-scanroute:
    runs-on: ubuntu-latest
    steps:
      - name: Ping ScanRoute Keep-Alive Endpoint
        run: |
          curl --fail --silent --show-error \\
            -H "Authorization: Bearer \${{ secrets.CRON_SECRET }}" \\
            "\${{ secrets.APP_URL }}/api/cron/keep-alive"`,
  },
];

const GUARDRAILS = [
  {
    id: 'az-sql',
    title: 'Run supabase/schema.sql in Supabase SQL Editor',
    detail: 'Creates profiles, qr_routes, scan_events, client_inquiries, and Row-Level Security policies.',
  },
  {
    id: 'az-cron',
    title: 'Add 3-day keep-alive cron in GitHub Actions UI (or cron-job.org)',
    detail: 'Pings /api/cron/keep-alive with CRON_SECRET every 3 days so Supabase Free stays awake past 7 days.',
  },
  {
    id: 'az-alert',
    title: 'Set Azure Cost Management alerts at $5, $20, and $50',
    detail: 'Verifies your $100 student allowance stays untouched while running on B1 free hours.',
  },
  {
    id: 'az-stripe',
    title: 'Upgrade Supabase to Pro ($25/mo) once you hit 1 paying Business client ($29/mo)',
    detail: 'Adds automatic daily database backups and removes all free-tier pause limits.',
  },
];

const CHECKLIST_KEY = 'scanroute_azure_checklist_v2';

export const AzureDeployView: React.FC = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(CHECKLIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checkedIds));
    } catch {
      // Ignore storage errors
    }
  }, [checkedIds]);

  const handleCopy = async (id: string, cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Supabase Postgres + Azure Student Pack Deployment
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              ScanRoute is wired to use Supabase Postgres and Supabase Auth automatically as soon as your environment variables are set—while keeping local preview mode functional with zero setup.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-emerald-700 font-semibold whitespace-nowrap shrink-0">
            Est. Cloud Cost: $0.00/mo
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {DEPLOY_STEPS.map((step) => (
            <div key={step.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                <button
                  type="button"
                  onClick={() => handleCopy(step.id, step.command)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
                >
                  {copiedId === step.id ? (
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
              <p className="text-xs text-slate-600">{step.description}</p>
              <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto leading-relaxed">
                {step.command}
              </pre>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Production Launch Checklist
          </h2>
          <span className="text-xs font-mono tabular-nums font-semibold text-sky-700">
            {checkedIds.length} / {GUARDRAILS.length}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {GUARDRAILS.map((item) => {
            const done = checkedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleCheck(item.id)}
                className="w-full py-3.5 text-left flex items-start gap-3 hover:bg-slate-50 rounded-sm px-1 cursor-pointer"
              >
                {done ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <div
                    className={`text-xs font-medium ${
                      done ? 'text-slate-500 line-through' : 'text-slate-900'
                    }`}
                  >
                    {item.title}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
