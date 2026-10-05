import React, { useState, useRef, useEffect } from 'react'
import {
  Sparkles, Send, RotateCcw, Building2, ShoppingCart, CreditCard,
  Package, FolderKanban, FileText, Zap, Search, ChevronRight, Bot,
} from 'lucide-react'
import clsx from 'clsx'

const INTENT_LABELS = {
  rfq_inquiry:      { label: 'RFQ',      cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  price_inquiry:    { label: 'Price',    cls: 'bg-blue-100 text-blue-700 border-blue-200'       },
  quantity_inquiry: { label: 'Quantity', cls: 'bg-cyan-100 text-cyan-700 border-cyan-200'       },
  spec_inquiry:     { label: 'Specs',    cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  vendor_inquiry:   { label: 'Vendor',   cls: 'bg-green-100 text-green-700 border-green-200'   },
  po_inquiry:       { label: 'PO',       cls: 'bg-amber-100 text-amber-700 border-amber-200'   },
  invoice_inquiry:  { label: 'Invoice',  cls: 'bg-orange-100 text-orange-700 border-orange-200'},
  payment_inquiry:  { label: 'Payment',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200'},
  project_inquiry:  { label: 'Project',  cls: 'bg-teal-100 text-teal-700 border-teal-200'      },
  document_inquiry: { label: 'Document', cls: 'bg-slate-100 text-slate-600 border-slate-200'   },
  search:           { label: 'Search',   cls: 'bg-brand-50 text-brand-700 border-brand-200'    },
}

const CATEGORIES = [
  {
    label: 'Materials',
    icon: Package,
    color: 'text-orange-600 bg-orange-50',
    prompts: [
      'Show me all solar panel materials',
      'What inverters do we have in stock?',
      'List cable specifications',
      'Find earthing materials',
    ],
  },
  {
    label: 'Vendors',
    icon: Building2,
    color: 'text-violet-600 bg-violet-50',
    prompts: [
      'Which vendors supply solar equipment?',
      'Show me active contractor vendors',
      'List vendors from Maharashtra',
      'Who supplies earthing kits?',
    ],
  },
  {
    label: 'Purchase Orders',
    icon: ShoppingCart,
    color: 'text-blue-600 bg-blue-50',
    prompts: [
      'Show me active purchase orders',
      'What POs are pending delivery?',
      'POs for Solar Farm Alpha project',
      'List overdue purchase orders',
    ],
  },
  {
    label: 'Payments',
    icon: CreditCard,
    color: 'text-emerald-600 bg-emerald-50',
    prompts: [
      'Show me pending payments',
      'Payment status for Tata Projects',
      'List overdue payment invoices',
      'How much advance was paid to BHEL?',
    ],
  },
  {
    label: 'Projects',
    icon: FolderKanban,
    color: 'text-teal-600 bg-teal-50',
    prompts: [
      'List all active solar projects',
      'What is the status of Wind Farm Gamma?',
      'Show vendors assigned to Solar Farm Alpha',
      'Projects in Rajasthan',
    ],
  },
  {
    label: 'Documents',
    icon: FileText,
    color: 'text-slate-600 bg-slate-100',
    prompts: [
      'Find GST certificates',
      'Show PO document for BHEL',
      'List payment proof documents',
      'Find quality inspection reports',
    ],
  },
]

function IntentBadge({ intent }) {
  if (!intent) return null
  const info = INTENT_LABELS[intent] || INTENT_LABELS.search
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${info.cls}`}>
      {info.label}
    </span>
  )
}

function ResultCard({ result }) {
  return (
    <div className="card p-4 hover:shadow-card-hover transition-all cursor-pointer group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-2 flex-1">
          {result.title || '—'}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
          result.source === 'semantic' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {result.source === 'semantic' ? 'AI Match' : 'Keyword'}
        </span>
      </div>
      {result.snippet && (
        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{result.snippet}</p>
      )}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
        {result.qty != null && (
          <span className="text-xs font-bold text-emerald-600">Qty: {result.qty}</span>
        )}
        {result.file_path && (
          <span className="text-xs text-slate-400 font-mono truncate max-w-[160px]">{result.file_path}</span>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-3">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 bg-brand-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </div>
  )
}

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    {
      id: 0, role: 'bot',
      text: "Hello! I'm your Saurya2x AI Assistant. I can search across materials, vendors, purchase orders, payments, and projects using semantic and keyword search. What would you like to know?",
      intent: null, results: [],
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: msg }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'bot',
          text: data.reply || 'No response.',
          intent: data.intent || null,
          results: data.results || [],
        },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: 'Server error. Please ensure the backend is running.', intent: null, results: [] },
      ])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([{
      id: 0, role: 'bot',
      text: 'Chat cleared. What can I help you find?',
      intent: null, results: [],
    }])
  }

  return (
    <div className="h-full flex gap-5 pb-4" style={{ minHeight: 'calc(100vh - 7rem)' }}>
      {/* Left sidebar — prompt categories */}
      <div className="w-64 flex-shrink-0 space-y-3 overflow-y-auto">
        {/* Header */}
        <div className="card p-4 bg-gradient-to-br from-brand-900 to-brand-700 border-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Sparkles size={18} className="text-brand-300" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-none">Saurya2x Assistant</p>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className="text-xs text-brand-300">AI + Semantic Search</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-brand-300/80 leading-relaxed">
            Powered by FAISS vector search and keyword matching across all ERP data.
          </p>
        </div>

        {/* Categories */}
        {CATEGORIES.map(cat => {
          const Icon = cat.icon
          return (
            <div key={cat.label} className="card p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={`w-6 h-6 rounded-lg ${cat.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={12} />
                </div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{cat.label}</p>
              </div>
              <div className="space-y-1">
                {cat.prompts.map(p => (
                  <button key={p} onClick={() => sendMessage(p)}
                    className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-lg hover:bg-brand-50 hover:text-brand-700 text-xs text-slate-600 transition-colors group"
                    disabled={loading}
                  >
                    <ChevronRight size={10} className="flex-shrink-0 text-slate-300 group-hover:text-brand-400 transition-colors" />
                    <span className="line-clamp-1">{p}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Right — chat area */}
      <div className="flex-1 flex flex-col card overflow-hidden min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-brand-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Conversation</h2>
            <span className="badge badge-green text-xs">Online</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">{messages.length - 1} messages</span>
            <button onClick={clearChat} title="Clear conversation"
              className="p-1.5 rounded-lg hover:bg-surface-100 text-slate-400 hover:text-slate-600 transition-colors ml-2">
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-surface-50">
          {messages.map(msg => (
            <div key={msg.id} className={clsx('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
              {/* Avatar */}
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-sm shadow-sm',
                msg.role === 'bot'
                  ? 'bg-gradient-to-br from-brand-600 to-brand-900 text-white'
                  : 'bg-slate-200 text-slate-700'
              )}>
                {msg.role === 'bot' ? 'Ω' : 'U'}
              </div>

              <div className={clsx('flex-1 max-w-[85%] space-y-3', msg.role === 'user' && 'flex flex-col items-end')}>
                {/* Message bubble */}
                <div className={clsx(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed max-w-full',
                  msg.role === 'bot'
                    ? 'bg-white border border-surface-200 text-slate-800 rounded-tl-sm shadow-sm'
                    : 'bg-brand-500 text-white rounded-tr-sm shadow-sm'
                )}>
                  {msg.text}
                </div>

                {/* Bot extras */}
                {msg.role === 'bot' && (
                  <>
                    {msg.intent && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Detected:</span>
                        <IntentBadge intent={msg.intent} />
                      </div>
                    )}
                    {msg.results && msg.results.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                          {msg.results.length} Result{msg.results.length !== 1 ? 's' : ''}
                        </p>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                          {msg.results.map((r, i) => (
                            <ResultCard key={i} result={r} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-brand-900 flex items-center justify-center font-bold text-sm text-white flex-shrink-0 mt-0.5 shadow-sm">Ω</div>
              <div className="bg-white border border-surface-200 rounded-2xl rounded-tl-sm shadow-sm">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-surface-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask anything about your ERP data… (Enter to send)"
                className="w-full pl-10 pr-4 py-3 text-sm bg-surface-50 border border-surface-200 rounded-xl outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 placeholder-slate-400 text-slate-800 transition-all"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={loading}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="flex items-center gap-2 px-5 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              <Send size={15} />
              Send
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Searching across materials, vendors, POs, payments and projects in real-time
          </p>
        </div>
      </div>
    </div>
  )
}
