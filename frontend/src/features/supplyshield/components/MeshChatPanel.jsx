import { useState } from 'react';
import axios from 'axios';
import { MessageSquare, Send, Wrench, Loader2 } from 'lucide-react';
import { API_URL } from '../../../utils/api';

const API_BASE = API_URL.replace(/\/$/, '');

const MeshChatPanel = ({ sessionId, contextProducts = [], onProductsDiscovered, onHubDealsDiscovered }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Ask me follow-up questions — compare products, request cheaper alternatives, or check discounted cancelled orders in the Supply Chain Hub!',
      tools: [],
      hubDealsCount: 0,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text, tools: [] }]);
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/agent-chat/`, {
        message: text,
        session_id: sessionId,
        context_products: contextProducts.slice(0, 6),
      });

      const data = res.data || {};
      const hubDeals = Array.isArray(data.supply_chain_hub_deals) ? data.supply_chain_hub_deals : [];
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response || 'No response returned.',
          tools: data.tools_used || [],
          hubDealsCount: hubDeals.length,
        },
      ]);

      if (Array.isArray(data.products) && data.products.length > 0) {
        onProductsDiscovered?.(data.products);
      }
      if (hubDeals.length > 0) {
        onHubDealsDiscovered?.(hubDeals);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err.response?.data?.error || 'Could not reach /api/agent-chat/. Please verify the backend service is running.',
          tools: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      aria-label="Conversational AI Agent Follow-Up"
      className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/80">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-wide text-slate-100 uppercase font-mono">
            AI Shopping Consultant Follow-Up Chat
          </h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400">POST /api/agent-chat/</span>
      </div>

      <div className="max-h-[260px] overflow-y-auto p-4 space-y-3 bg-slate-950/70">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/40'
                  : 'bg-slate-900 text-slate-100 border border-slate-800'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.hubDealsCount > 0 && (
                <p className="mt-2 inline-block px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/40 font-mono text-[10px] font-bold">
                  🚚 +{m.hubDealsCount} Separate Supply Chain Hub Cancelled Deal(s) Shown Above
                </p>
              )}
              {Array.isArray(m.tools) && m.tools.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-800">
                  <Wrench className="w-3 h-3 text-purple-400" aria-hidden="true" />
                  {m.tools.map((t, ti) => (
                    <span
                      key={`${t}-${ti}`}
                      className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 border-t border-slate-800 bg-slate-900">
        <label htmlFor="mesh-followup-input" className="sr-only">
          Ask follow-up question to AI consultant
        </label>
        <input
          id="mesh-followup-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask follow-up: e.g. Compare top 2 options or suggest a cheaper alternative..."
          className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Send className="w-3.5 h-3.5" aria-hidden="true" />}
          Ask
        </button>
      </form>
    </section>
  );
};

export default MeshChatPanel;
