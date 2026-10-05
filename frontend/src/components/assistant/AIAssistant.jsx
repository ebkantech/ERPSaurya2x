import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, Maximize2, Send, Sparkles, Bot, Zap, RotateCcw, ExternalLink } from 'lucide-react'
import clsx from 'clsx'

const INTENT_LABELS = {
  rfq_inquiry:      { label: 'RFQ',      cls: 'bg-violet-100 text-violet-700' },
  price_inquiry:    { label: 'Price',    cls: 'bg-blue-100 text-blue-700'     },
  quantity_inquiry: { label: 'Quantity', cls: 'bg-cyan-100 text-cyan-700'     },
  spec_inquiry:     { label: 'Specs',    cls: 'bg-indigo-100 text-indigo-700' },
  vendor_inquiry:   { label: 'Vendor',   cls: 'bg-green-100 text-green-700'   },
  po_inquiry:       { label: 'PO',       cls: 'bg-amber-100 text-amber-700'   },
  invoice_inquiry:  { label: 'Invoice',  cls: 'bg-orange-100 text-orange-700' },
  payment_inquiry:  { label: 'Payment',  cls: 'bg-emerald-100 text-emerald-700'},
  project_inquiry:  { label: 'Project',  cls: 'bg-teal-100 text-teal-700'     },
  document_inquiry: { label: 'Document', cls: 'bg-slate-100 text-slate-600'   },
  search:           { label: 'Search',   cls: 'bg-brand-100 text-brand-700'   },
}

const QUICK_PROMPTS = [
  'Show me solar panel prices',
  'Which vendors supply inverters?',
  'List overdue purchase orders',
  'Payment status for Tata Projects',
]

function IntentBadge({ intent }) {
  if (!intent) return null
  const info = INTENT_LABELS[intent] || INTENT_LABELS.search
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${info.cls}`}>
      {info.label}
    </span>
  )
}

function ResultCard({ result }) {
  return (
    <div className="bg-surface-50 border border-surface-200 rounded-lg p-2.5 hover:border-brand-200 transition-colors">
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2 flex-1">{result.title || '—'}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${result.source === 'semantic' ? 'bg-violet-100 text-violet-600' : 'bg-blue-100 text-blue-600'}`}>
          {result.source === 'semantic' ? 'AI' : 'KW'}
        </span>
      </div>
      {result.snippet && (
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{result.snippet}</p>
      )}
      {result.qty != null && (
        <p className="text-xs text-emerald-600 font-semibold mt-1">Qty: {result.qty}</p>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: 'bot',
      text: "Hello! I'm your Saurya2x assistant. Ask me about materials, vendors, purchase orders, payments, or projects.",
      intent: null,
      results: [],
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg) return
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
          text: data.reply || 'No response received.',
          intent: data.intent || null,
          results: data.results || [],
        },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: 'Could not reach the server. Please try again.', intent: null, results: [] },
      ])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([{
      id: 0, role: 'bot',
      text: "Chat cleared. How can I help you?",
      intent: null, results: [],
    }])
  }

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[380px] z-50"
          style={{ filter: 'drop-shadow(0 8px 32px rgba(12,33,61,0.22))' }}
        >
          <div className="bg-white rounded-2xl overflow-hidden border border-surface-200 flex flex-col"
            style={{ height: '520px' }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-900 to-brand-700 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <Sparkles size={16} className="text-brand-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-none">Saurya2x Assistant</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <p className="text-xs text-brand-300">Semantic search · AI-powered</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link to="/assistant" onClick={() => setIsOpen(false)}
                  title="Open full view"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-brand-300 hover:text-white transition-colors"
                >
                  <Maximize2 size={14} />
                </Link>
                <button onClick={clearChat} title="Clear chat"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-brand-300 hover:text-white transition-colors"
                >
                  <RotateCcw size={14} />
                </button>
                <button onClick={() => setIsOpen(false)} title="Close"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-brand-300 hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-surface-50">
              {messages.map(msg => (
                <div key={msg.id} className={clsx('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}>
                  {/* Avatar */}
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold',
                    msg.role === 'bot' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'
                  )}>
                    {msg.role === 'bot' ? 'Ω' : 'U'}
                  </div>

                  <div className={clsx('max-w-[85%] space-y-1.5', msg.role === 'user' && 'items-end flex flex-col')}>
                    {/* Bubble */}
                    <div className={clsx(
                      'px-3 py-2 rounded-2xl text-sm leading-relaxed',
                      msg.role === 'bot'
                        ? 'bg-white border border-surface-200 text-slate-800 rounded-tl-sm'
                        : 'bg-brand-500 text-white rounded-tr-sm'
                    )}>
                      {msg.text}
                    </div>

                    {/* Intent + results for bot */}
                    {msg.role === 'bot' && (msg.intent || (msg.results && msg.results.length > 0)) && (
                      <div className="space-y-1.5">
                        {msg.intent && <IntentBadge intent={msg.intent} />}
                        {msg.results && msg.results.length > 0 && (
                          <div className="space-y-1">
                            {msg.results.slice(0, 3).map((r, i) => (
                              <ResultCard key={i} result={r} />
                            ))}
                            {msg.results.length > 3 && (
                              <p className="text-xs text-slate-400 text-center pt-1">
                                +{msg.results.length - 3} more results ·{' '}
                                <Link to="/assistant" onClick={() => setIsOpen(false)} className="text-brand-500 hover:underline font-medium">
                                  See all
                                </Link>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">Ω</div>
                  <div className="bg-white border border-surface-200 rounded-2xl rounded-tl-sm">
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick prompts */}
            {messages.length === 1 && !loading && (
              <div className="px-3 py-2 border-t border-surface-100 bg-white flex gap-1.5 overflow-x-auto flex-shrink-0">
                {QUICK_PROMPTS.map(q => (
                  <button key={q} onClick={() => sendMessage(q)}
                    className="whitespace-nowrap text-xs px-2.5 py-1.5 bg-brand-50 text-brand-700 rounded-full border border-brand-100 hover:bg-brand-100 transition-colors font-medium"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-2.5 border-t border-surface-200 bg-white flex items-center gap-2 flex-shrink-0">
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask about materials, vendors, POs…"
                className="flex-1 text-sm bg-surface-50 border border-surface-200 rounded-xl px-3 py-2 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/20 placeholder-slate-400 text-slate-800 transition-colors"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-8 h-8 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 group"
        aria-label="Open AI Assistant"
      >
        {/* Pulse ring */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full bg-brand-500 animate-ping opacity-30 pointer-events-none" />
        )}
        <div className={clsx(
          'w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200',
          isOpen
            ? 'bg-slate-700 rotate-0 scale-95'
            : 'bg-gradient-to-br from-brand-600 to-brand-900 group-hover:scale-110 group-hover:shadow-xl'
        )}>
          {isOpen
            ? <X size={22} className="text-white" />
            : <Sparkles size={22} className="text-white" />
          }
        </div>
        {/* Tooltip */}
        {!isOpen && (
          <span className="absolute bottom-full right-0 mb-2 px-2.5 py-1 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            AI Assistant
          </span>
        )}
      </button>
    </>
  )
}
