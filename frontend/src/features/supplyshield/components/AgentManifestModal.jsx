import { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, FileJson2, Shield } from 'lucide-react';

const AgentManifestModal = ({ manifest, nodeTitle, onClose }) => {
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (manifest && !dialog.open) {
      dialog.showModal();
    } else if (!manifest && dialog.open) {
      dialog.close();
    }
  }, [manifest]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Light-dismiss fallback for browsers without native closedby="any"
    let removeFallback = null;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      const onPointerDown = (e) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      removeFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (removeFallback) removeFallback();
    };
  }, [onClose]);

  const handleCopy = async () => {
    if (!manifest) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="manifest-dialog-title"
      className="m-auto w-[92vw] max-w-2xl rounded-2xl border border-cyan-500/40 bg-slate-900 text-slate-100 p-0 shadow-2xl shadow-cyan-950/60"
    >
      {manifest && (
        <div className="flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-800 bg-slate-950/70">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                <FileJson2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="manifest-dialog-title" className="text-base font-bold text-slate-100 truncate">
                  {nodeTitle || manifest.name} — agent.json
                </h2>
                <p className="text-xs font-mono text-cyan-300 truncate">
                  {manifest.protocol || 'a2a/v1'} · id: {manifest.agent_id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
              <form method="dialog">
                <button
                  type="submit"
                  aria-label="Close agent manifest dialog"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>

          <div className="p-6 overflow-y-auto space-y-4">
            {manifest.role && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <Shield className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm text-slate-200">{manifest.role}</p>
              </div>
            )}

            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </dialog>
  );
};

export default AgentManifestModal;
