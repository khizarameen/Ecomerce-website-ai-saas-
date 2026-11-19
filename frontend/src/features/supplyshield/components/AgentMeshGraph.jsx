import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import MeshNode from './MeshNode';

const nodeTypes = {
  meshNode: MeshNode,
};

const EDGE_COLORS = {
  idle: '#334155',
  active: '#22d3ee',
  failed: '#ef4444',
  success: '#10b981',
};

const AgentMeshGraph = ({
  activeNode,
  edgeStatus = {},
  excludedSuppliers = [],
  supplierCandidates = [],
  selectedSupplier = null,
  riskReport = null,
  logisticsPlan = null,
  haggleReport = null,
  customsReport = null,
  purchaseOrder = null,
  itemName = '',
  maxDays = 3,
  maxBudget = null,
  onNodeSelect,
}) => {
  const nodes = useMemo(() => {
    const candA = supplierCandidates[0] || null;
    const candB = supplierCandidates[1] || null;

    const supAExcluded = candA ? excludedSuppliers.includes(candA.id) : false;
    const supBSelected = candB && selectedSupplier?.id === candB.id;
    const supASelected = candA && selectedSupplier?.id === candA.id;

    const getStatus = (key) => {
      if (key === 'supplier_a') {
        if (supAExcluded) return 'failed';
        if (supASelected && (logisticsPlan || (riskReport?.supplier_id === candA?.id && riskReport?.status === 'CLEAR'))) {
          return 'success';
        }
        if (activeNode === 'supplier_a' || supASelected) return 'active';
        return 'idle';
      }
      if (key === 'supplier_b') {
        if (activeNode === 'supplier_b') return 'active';
        if (supBSelected) return 'success';
        return 'idle';
      }
      if (key === 'orchestrator') {
        if (activeNode === 'orchestrator') return 'active';
        if (activeNode && activeNode !== 'idle') return 'success';
        return 'idle';
      }
      if (key === 'risk_radar') {
        if (riskReport?.status === 'CRITICAL') return 'failed';
        if (riskReport?.status === 'CLEAR') return 'success';
        if (activeNode === 'risk_radar') return 'active';
        return 'idle';
      }
      if (key === 'cargo_mesh') {
        if (activeNode === 'cargo_mesh') return 'active';
        if (logisticsPlan) return 'success';
        return 'idle';
      }
      if (key === 'haggle_bot') {
        if (activeNode === 'haggle_bot') return 'active';
        if (haggleReport) return 'success';
        return 'idle';
      }
      if (key === 'customs_shield') {
        if (activeNode === 'customs_shield') return 'active';
        if (customsReport) return 'success';
        return 'idle';
      }
      if (key === 'budget_guard') {
        if (purchaseOrder) return purchaseOrder.status === 'ESCROW_LOCKED_APPROVED' ? 'success' : 'failed';
        if (activeNode === 'budget_guard') return 'active';
        return 'idle';
      }
      return 'idle';
    };

    const budgetText = maxBudget ? `$${Number(maxBudget).toLocaleString()}` : 'Auto';
    const orchTitle = itemName ? itemName.slice(0, 28) : 'Universal Orchestrator';

    return [
      {
        id: 'orchestrator',
        type: 'meshNode',
        position: { x: 20, y: 155 },
        data: {
          manifestId: 'orchestrator',
          iconType: 'orchestrator',
          roleLabel: 'LangGraph Core',
          title: orchTitle,
          metric: `SLA <= ${maxDays}d · Cap ${budgetText}`,
          status: getStatus('orchestrator'),
          badgeText: activeNode === 'orchestrator' ? 'PLANNING' : activeNode ? 'ROUTED' : 'READY',
          hasTarget: false,
        },
      },
      {
        id: 'supplier_a',
        type: 'meshNode',
        position: { x: 300, y: 30 },
        data: {
          manifestId: 'supplier-node',
          iconType: 'supplier',
          roleLabel: candA ? `supplier-node · ${candA.id}` : 'supplier-node · Primary',
          title: candA ? candA.name : 'Primary Vendor Quote',
          metric: candA
            ? `${candA.quantity}x ${candA.product_name.slice(0, 18)} · $${Number(candA.price).toLocaleString()}`
            : 'Awaiting Catalog Query',
          status: getStatus('supplier_a'),
          badgeText: supAExcluded ? 'EXCLUDED (RISK)' : supASelected ? 'LOCKED DIRECT' : 'STANDBY',
        },
      },
      {
        id: 'supplier_b',
        type: 'meshNode',
        position: { x: 300, y: 275 },
        data: {
          manifestId: 'supplier-node',
          iconType: 'supplier',
          roleLabel: candB ? `supplier-node · ${candB.id}` : 'supplier-node · Backup',
          title: candB ? candB.name : 'Express Backup Vendor',
          metric: candB
            ? `${candB.quantity}x ${candB.product_name.slice(0, 18)} · $${Number(candB.price).toLocaleString()}`
            : 'Awaiting Failover Quote',
          status: getStatus('supplier_b'),
          badgeText: supBSelected ? 'LOCKED' : 'STANDBY',
        },
      },
      {
        id: 'risk_radar',
        type: 'meshNode',
        position: { x: 590, y: 155 },
        data: {
          manifestId: 'risk-radar',
          iconType: 'risk_radar',
          roleLabel: 'risk-radar',
          title: 'Risk & Corridor Radar',
          metric: riskReport
            ? `${riskReport.status} · Risk ${riskReport.risk_score}/100 · +${riskReport.delay_days}d`
            : 'Dynamic Corridor Telemetry',
          status: getStatus('risk_radar'),
          badgeText:
            riskReport?.status === 'CRITICAL'
              ? `DELAY +${riskReport.delay_days}d`
              : riskReport?.status === 'CLEAR'
              ? 'CLEAR ROUTE'
              : 'STANDBY',
        },
      },
      {
        id: 'cargo_mesh',
        type: 'meshNode',
        position: { x: 870, y: 155 },
        data: {
          manifestId: 'cargo-mesh',
          iconType: 'cargo_mesh',
          roleLabel: 'cargo-mesh',
          title: 'Logistics Cargo Mesh',
          metric: logisticsPlan
            ? `${logisticsPlan.mode} · ${logisticsPlan.total_delivery_days}d`
            : 'Dynamic Weight & SLA Routing',
          status: getStatus('cargo_mesh'),
          badgeText: logisticsPlan?.upgraded_from_sea ? 'AIR CHARTER' : logisticsPlan ? 'LOCKED' : 'STANDBY',
        },
      },
      {
        id: 'haggle_bot',
        type: 'meshNode',
        position: { x: 1150, y: 45 },
        data: {
          manifestId: 'haggle-bot',
          iconType: 'haggle_bot',
          roleLabel: 'haggle-bot · Node 5',
          title: 'A2A Price Bargaining',
          metric: haggleReport
            ? `-${haggleReport.rebate_pct}% (-$${Number(haggleReport.rebate_amount_usd).toLocaleString()}) · ${haggleReport.rounds}-Rd A2A`
            : '8%–14% Escrow Rebate Target',
          status: getStatus('haggle_bot'),
          badgeText: haggleReport ? `REBATE -${haggleReport.rebate_pct}%` : 'STANDBY',
        },
      },
      {
        id: 'customs_shield',
        type: 'meshNode',
        position: { x: 1150, y: 265 },
        data: {
          manifestId: 'customs-shield',
          iconType: 'customs_shield',
          roleLabel: 'customs-shield · Node 6',
          title: 'Customs & HS-Code Shield',
          metric: customsReport
            ? `HS ${customsReport.hs_code} · ${customsReport.clearance_id}`
            : 'HS Classification & Hazmat',
          status: getStatus('customs_shield'),
          badgeText: customsReport ? customsReport.status : 'STANDBY',
        },
      },
      {
        id: 'budget_guard',
        type: 'meshNode',
        position: { x: 1450, y: 155 },
        data: {
          manifestId: 'budget-guard',
          iconType: 'budget_guard',
          roleLabel: 'budget-guard',
          title: 'FinOps Escrow Guard',
          metric: purchaseOrder
            ? `$${Number(purchaseOrder.total_landed_cost_usd).toLocaleString()} · Saved $${Number(purchaseOrder.savings_usd).toLocaleString()}`
            : 'Budget & PO Hash Signer',
          status: getStatus('budget_guard'),
          badgeText: purchaseOrder
            ? purchaseOrder.status === 'ESCROW_LOCKED_APPROVED'
              ? 'ESCROW APPROVED'
              : 'REVIEW'
            : 'STANDBY',
          hasSource: false,
        },
      },
    ];
  }, [
    activeNode,
    excludedSuppliers,
    supplierCandidates,
    selectedSupplier,
    riskReport,
    logisticsPlan,
    haggleReport,
    customsReport,
    purchaseOrder,
    itemName,
    maxDays,
    maxBudget,
  ]);

  const edges = useMemo(() => {
    const buildEdge = (id, source, target, statusKey, customLabel = '') => {
      const st = edgeStatus[statusKey] || 'idle';
      const color = EDGE_COLORS[st] || EDGE_COLORS.idle;
      const isAnimated = st === 'active' || st === 'success' || st === 'failed';
      return {
        id,
        source,
        target,
        animated: isAnimated,
        label: customLabel || undefined,
        labelStyle: {
          fill: st === 'failed' ? '#fecaca' : st === 'success' ? '#a7f3d0' : '#bae6fd',
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 700,
        },
        labelBgStyle: {
          fill: '#020617',
          fillOpacity: 0.9,
        },
        style: {
          stroke: color,
          strokeWidth: st === 'idle' ? 2 : 3.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
      };
    };

    return [
      buildEdge('e-orch-sup-a', 'orchestrator', 'supplier_a', 'orchestrator_to_supplier_a'),
      buildEdge(
        'e-orch-sup-b',
        'orchestrator',
        'supplier_b',
        'orchestrator_to_supplier_b',
        edgeStatus.orchestrator_to_supplier_b === 'success' ? 'REROUTED' : ''
      ),
      buildEdge(
        'e-sup-a-risk',
        'supplier_a',
        'risk_radar',
        'supplier_a_to_risk',
        edgeStatus.supplier_a_to_risk === 'failed'
          ? 'RISK DELAY (BLOCKED)'
          : edgeStatus.supplier_a_to_risk === 'success'
          ? 'CLEAR DIRECT'
          : ''
      ),
      buildEdge(
        'e-sup-b-risk',
        'supplier_b',
        'risk_radar',
        'supplier_b_to_risk',
        edgeStatus.supplier_b_to_risk === 'success' ? 'CLEAR ROUTE' : ''
      ),
      buildEdge(
        'e-risk-cargo',
        'risk_radar',
        'cargo_mesh',
        'risk_to_cargo',
        edgeStatus.risk_to_cargo === 'success' ? 'SLA DISPATCH' : ''
      ),
      buildEdge(
        'e-cargo-haggle',
        'cargo_mesh',
        'haggle_bot',
        'cargo_to_haggle',
        edgeStatus.cargo_to_haggle === 'success' ? 'A2A HAGGLE' : ''
      ),
      buildEdge(
        'e-haggle-customs',
        'haggle_bot',
        'customs_shield',
        'haggle_to_customs',
        edgeStatus.haggle_to_customs === 'success' ? 'REBATE LOCKED' : ''
      ),
      buildEdge(
        'e-customs-budget',
        'customs_shield',
        'budget_guard',
        'customs_to_budget',
        edgeStatus.customs_to_budget === 'success' ? 'GREEN-LANE PO' : ''
      ),
    ];
  }, [edgeStatus]);

  return (
    <div className="w-full h-[460px] rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl shadow-cyan-950/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeSelect?.(node.data)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} size={1} />
        <Controls className="!bg-slate-900 !border-slate-700 !text-slate-200 [&>button]:!bg-slate-900 [&>button]:!border-slate-700 [&>button]:!fill-slate-200" />
        <MiniMap
          nodeColor={(n) => {
            const st = n.data?.status;
            if (st === 'failed') return '#ef4444';
            if (st === 'success') return '#10b981';
            if (st === 'active') return '#22d3ee';
            return '#475569';
          }}
          maskColor="rgba(2, 6, 23, 0.78)"
          className="!bg-slate-900 !border !border-slate-800"
        />
      </ReactFlow>
    </div>
  );
};

export default AgentMeshGraph;
