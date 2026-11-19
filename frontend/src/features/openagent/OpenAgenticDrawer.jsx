import { Link } from 'react-router-dom';
import { GlobeAltIcon, XMarkIcon } from '@heroicons/react/24/outline';
import OpenAgenticWorkspace from './OpenAgenticWorkspace';

export default function OpenAgenticDrawer({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Open Agentic Web Node Drawer"
    >
      <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <GlobeAltIcon className="w-6 h-6 text-cyan-400" aria-hidden="true" />
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                Open Agentic Web Node (MIT NANDA · Otari)
              </h2>
              <p className="text-[11px] font-mono text-slate-300">
                Browser-Native Discovery, BYOK / Otari Config &amp; Cross-Site A2A Playground
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/open-agentic-hub"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 text-xs font-bold"
            >
              Open Full Hub Page →
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Open Agentic Drawer"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <XMarkIcon className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
          <OpenAgenticWorkspace compact />
        </div>
      </div>
    </div>
  );
}
