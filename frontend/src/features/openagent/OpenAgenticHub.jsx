import { Link } from 'react-router-dom';
import { ArrowLeftIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import OpenAgenticWorkspace from './OpenAgenticWorkspace';

export default function OpenAgenticHub() {
  const { isAuthenticated, isSeller } = useAuth();
  const backPath = isAuthenticated && isSeller ? '/seller/dashboard' : '/home';

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white p-6 md:p-8 shadow-xl border border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 text-xs font-mono font-bold">
                <GlobeAltIcon className="w-4 h-4" aria-hidden="true" />
                <span>Open Agentic Web Challenge · MIT NANDA · Cognizant AI Lab · Mozilla Otari</span>
              </span>
              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">
                StoreHub Open Agentic Web Hub 🌐
              </h1>
              <p className="text-xs sm:text-sm text-slate-300">
                Inspect our public <code>/.well-known/agent-network.json</code> manifest, run our browser-native
                <code>/agent-runtime.js</code> with Mozilla Otari / BYOK or zero-config StoreHub Mesh fallback, and
                execute cross-site Agent-to-Agent (A2A) Anti-RTO negotiations live in your browser.
              </p>
            </div>

            <Link
              to={backPath}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-extrabold self-start md:self-auto"
            >
              <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
              <span>{isSeller ? 'Back to Seller Center' : 'Back to StoreHub'}</span>
            </Link>
          </div>
        </section>

        <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 md:p-6">
          <OpenAgenticWorkspace />
        </section>
      </div>
    </div>
  );
}
