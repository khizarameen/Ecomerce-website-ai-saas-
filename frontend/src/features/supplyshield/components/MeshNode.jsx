import { Handle, Position } from '@xyflow/react';
import {
  Cpu,
  Server,
  CloudLightning,
  Plane,
  Handshake,
  FileCheck2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileCode2,
} from 'lucide-react';

const ICON_MAP = {
  orchestrator: Cpu,
  supplier: Server,
  risk_radar: CloudLightning,
  cargo_mesh: Plane,
  haggle_bot: Handshake,
  customs_shield: FileCheck2,
  budget_guard: ShieldCheck,
};

const STATE_STYLES = {
  idle: {
    card: 'border-slate-700/80 bg-slate-900/90 shadow-lg shadow-slate-950/60',
    badge: 'bg-slate-800 text-slate-300 border-slate-700',
    label: 'STANDBY',
    iconColor: 'text-slate-400',
  },
  active: {
    card: 'border-cyan-400 bg-slate-900/95 shadow-[0_0_26px_rgba(34,211,238,0.42)] ring-2 ring-cyan-400/50',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60',
    label: 'ACTIVE',
    iconColor: 'text-cyan-300',
  },
  failed: {
    card: 'border-red-500 bg-red-950/40 shadow-[0_0_26px_rgba(239,68,68,0.45)] ring-2 ring-red-500/50',
    badge: 'bg-red-500/20 text-red-200 border-red-400/70',
    label: 'CRISIS ALERT',
    iconColor: 'text-red-400',
  },
  success: {
    card: 'border-emerald-400 bg-emerald-950/35 shadow-[0_0_26px_rgba(16,185,129,0.4)] ring-2 ring-emerald-400/50',
    badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/70',
    label: 'VERIFIED',
    iconColor: 'text-emerald-300',
  },
};

const MeshNode = ({ data }) => {
  const Icon = ICON_MAP[data.iconType] || Cpu;
  const status = data.status || 'idle';
  const style = STATE_STYLES[status] || STATE_STYLES.idle;

  return (
    <div
      className={`min-w-[228px] max-w-[255px] rounded-xl border-2 px-4 py-3 text-left transition-all duration-300 cursor-pointer hover:brightness-110 ${style.card}`}
    >
      {data.hasTarget !== false && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-950"
        />
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg bg-slate-950/80 border border-slate-800 ${style.iconColor}`}>
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 truncate">
              {data.roleLabel}
            </p>
            <h3 className="text-sm font-bold text-slate-100 leading-tight truncate">
              {data.title}
            </h3>
          </div>
        </div>
      </div>

      {data.metric && (
        <p className="text-xs font-mono text-slate-200 bg-slate-950/70 border border-slate-800/80 rounded-md px-2.5 py-1.5 mb-2">
          {data.metric}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${style.badge}`}
        >
          {status === 'active' && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
          {status === 'failed' && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
          {status === 'success' && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
          <span>{data.badgeText || style.label}</span>
        </span>

        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
          <FileCode2 className="w-3 h-3" aria-hidden="true" />
          agent.json
        </span>
      </div>

      {data.hasSource !== false && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-950"
        />
      )}
    </div>
  );
};

export default MeshNode;
