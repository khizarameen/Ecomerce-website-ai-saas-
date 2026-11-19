import { useEffect, useRef, useState } from 'react';
import {
  X,
  Printer,
  Copy,
  Check,
  ShieldCheck,
  Handshake,
  FileCheck2,
  Hash,
  Clock,
  FileText,
} from 'lucide-react';

const POReceiptModal = ({ isOpen, purchaseOrder, onClose }) => {
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && purchaseOrder && !dialog.open) {
      dialog.showModal();
    } else if ((!isOpen || !purchaseOrder) && dialog.open) {
      dialog.close();
    }
  }, [isOpen, purchaseOrder]);

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

  const handleCopyHash = async () => {
    if (!purchaseOrder?.po_hash) return;
    try {
      await navigator.clipboard.writeText(purchaseOrder.po_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const haggleDialogue = purchaseOrder?.haggle_dialogue || [];
  const auditTrail = purchaseOrder?.audit_trail || [];

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="po-receipt-dialog-title"
      className="m-auto w-[95vw] max-w-4xl rounded-2xl border border-emerald-500/50 bg-slate-900 text-slate-100 p-0 shadow-2xl shadow-emerald-950/60 print:border-slate-300 print:bg-white print:text-slate-900"
    >
      {purchaseOrder && (
        <div className="flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800 bg-slate-950/90 print:bg-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300">
                <FileText className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="po-receipt-dialog-title" className="text-base sm:text-lg font-bold text-slate-100 truncate">
                  Signed Smart PO &amp; Customs Certificate — {purchaseOrder.po_number}
                </h2>
                <p className="text-xs font-mono text-emerald-300 truncate">
                  {purchaseOrder.status} ·{' '}
                  {purchaseOrder.issued_at
                    ? `Issued ${new Date(purchaseOrder.issued_at).toLocaleString()}`
                    : 'Issued Live via Escrow Mesh'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                Print Certificate
              </button>
              <form method="dialog">
                <button
                  type="submit"
                  aria-label="Close Smart PO and Customs Certificate modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>

          {/* Printable Receipt Body */}
          <div className="p-6 overflow-y-auto space-y-5 text-xs">
            {/* Escrow Cryptographic Hash Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 border border-emerald-500/40 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Hash className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-mono text-slate-400 shrink-0">ESCROW HASH:</span>
                <span className="font-mono font-bold text-emerald-300 truncate">{purchaseOrder.po_hash}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyHash}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono print:hidden"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* 3-Column Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Supplier & SLA */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold uppercase">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  <span>Supplier &amp; SLA Contract</span>
                </div>
                <p className="text-sm font-bold text-slate-100">{purchaseOrder.supplier_name}</p>
                <p className="text-slate-400 font-mono">
                  {purchaseOrder.quantity}x {purchaseOrder.item_name}
                </p>
                <div className="pt-2 border-t border-slate-800 space-y-1 font-mono text-slate-300">
                  <p>Region: {purchaseOrder.supplier_location || 'Verified Hub'}</p>
                  <p>Freight: {purchaseOrder.logistics_mode}</p>
                  <p>
                    ETA: {purchaseOrder.delivery_eta_days}d (SLA &le; {purchaseOrder.sla_deadline_days}d)
                  </p>
                  <p>Route Risk: {purchaseOrder.risk_score}/100</p>
                </div>
              </div>

              {/* Haggle-Bot Financial Ledger */}
              <div className="rounded-xl border border-amber-500/30 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-mono font-bold uppercase">
                  <Handshake className="w-4 h-4" aria-hidden="true" />
                  <span>Haggle-Bot Escrow Rebate</span>
                </div>
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Original Vendor Quote:</span>
                    <span className="line-through">
                      ${Number(purchaseOrder.original_supplier_cost_usd || purchaseOrder.supplier_cost_usd || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-300 font-bold">
                    <span>A2A Rebate (-{purchaseOrder.haggle_rebate_pct || 0}%):</span>
                    <span>-${Number(purchaseOrder.haggle_discount_usd || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-200">
                    <span>Negotiated Goods Cost:</span>
                    <span>${Number(purchaseOrder.supplier_cost_usd || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Logistics Freight:</span>
                    <span>${Number(purchaseOrder.freight_cost_usd || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-bold text-slate-100">
                    <span>Total Landed:</span>
                    <span className="text-emerald-300">
                      ${Number(purchaseOrder.total_landed_cost_usd || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customs-Shield Certificate */}
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 font-mono font-bold uppercase">
                  <FileCheck2 className="w-4 h-4" aria-hidden="true" />
                  <span>Customs-Shield Certificate</span>
                </div>
                <p className="inline-block px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 font-mono font-bold">
                  {purchaseOrder.customs_status || 'GREEN-LANE PRE-CLEARED'}
                </p>
                <div className="space-y-1 font-mono text-slate-300 pt-1">
                  <p>
                    Clearance ID:{' '}
                    <span className="text-cyan-300 font-bold">{purchaseOrder.customs_clearance_id || 'CLR-SS-VERIFIED'}</span>
                  </p>
                  <p>
                    HS Tariff Code:{' '}
                    <span className="text-amber-300 font-bold">{purchaseOrder.hs_code || '8471.30'}</span>
                  </p>
                  <p className="text-slate-400">{purchaseOrder.hs_description}</p>
                  <p className="text-emerald-300">{purchaseOrder.hazmat_compliance}</p>
                </div>
              </div>
            </div>

            {/* 2-Round Haggle Dialogue Transcript */}
            {haggleDialogue.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 space-y-2.5">
                <h3 className="font-mono font-bold uppercase text-amber-300 flex items-center gap-1.5">
                  <Handshake className="w-4 h-4" aria-hidden="true" />
                  Haggle-Bot 2-Round Autonomous Negotiation Log
                </h3>
                <div className="space-y-2 font-mono">
                  {haggleDialogue.map((turn, idx) => (
                    <div
                      key={`${turn.round}-${idx}`}
                      className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-1.5"
                    >
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold shrink-0 w-fit">
                        R{turn.round} · {turn.from}
                      </span>
                      <span className="text-slate-200">{turn.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamped Audit Trail */}
            {auditTrail.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 space-y-2.5">
                <h3 className="font-mono font-bold uppercase text-cyan-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  Full 6-Node Timestamped Audit Trail
                </h3>
                <div className="space-y-1.5 font-mono">
                  {auditTrail.map((entry, idx) => (
                    <div
                      key={`${entry.timestamp}-${idx}`}
                      className="rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2 flex flex-col gap-0.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span className="text-emerald-300 font-bold">
                          @{entry.node} · {entry.title}
                        </span>
                        <span>{entry.timestamp}</span>
                      </div>
                      <p className="text-slate-200">{entry.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
};

export default POReceiptModal;
