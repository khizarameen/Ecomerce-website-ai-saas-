import { useEffect, useRef } from 'react';
import { Terminal, AlertTriangle, CheckCircle2, Info, Zap } from 'lucide-react';

const LEVEL_STYLES = {
  info: {
    border: 'border-cyan-500/40 bg-cyan-950/20',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    Icon: Info,
  },
  warning: {
    border: 'border-amber-500/40 bg-amber-950/20',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    Icon: Zap,
  },
  danger: {
    border: 'border-red-500/60 bg-red-950/35',
    badge: 'bg-red-500/25 text-red-200 border-red-400/60',
    Icon: AlertTriangle,
  },
  success: {
    border: 'border-emerald-500/50 bg-emerald-950/25',
    badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50',
    Icon: CheckCircle2,
  },
};

const TelemetryFeed = ({ logs, isStreaming }) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  return (
    <section
      aria-label="Live Agent-to-Agent Telemetry Feed"
      className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden h-[360px]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/80">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-wide text-slate-100 uppercase font-mono">
            A2A Mesh Telemetry Stream
          </h2>
        </div>
        <span
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
            isStreaming
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-cyan-400 animate-ping' : 'bg-slate-400'}`}
            aria-hidden="true"
          />
          {isStreaming ? 'STREAMING LIVE' : `${logs.length} EVENTS`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono text-xs bg-slate-950/90">
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-center px-4">
            Click &ldquo;Execute Crisis Route&rdquo; to watch the 4 autonomous agents negotiate stock, detect route hazards, upgrade freight, and sign Escrow PO.
          </div>
        ) : (
          logs.map((item, idx) => {
            const cfg = LEVEL_STYLES[item.level] || LEVEL_STYLES.info;
            const Icon = cfg.Icon;
            return (
              <div
                key={`${item.timestamp}-${idx}`}
                className={`rounded-xl border px-3 py-2.5 transition-all ${cfg.border}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badge}`}>
                      <Icon className="w-3 h-3" aria-hidden="true" />
                      {item.title}
                    </span>
                    <span className="text-[11px] text-slate-400">@{item.node}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{item.timestamp}</span>
                </div>
                <p className="text-slate-100 leading-relaxed">{item.message}</p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
};

export default TelemetryFeed;
