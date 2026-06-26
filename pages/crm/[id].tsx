import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

type ClientDetail = {
  id: number
  '1. 企業主名': string
  '2. 公司名稱': string
  '3. 執行顧問': string
  '4. 方案': string
  '5. 簽約日': string
  '9. 月費合約現狀': string
  '11. 學員動態': string
  'Issue（偏離狀態）': string | null
  'Action（處置）': string | null
  合約金額: number | null
  員工數: number | null
  專家: string | null
  產業別: string | null
  身份: string | null
}

type Log = {
  id: number
  content: string
  priority: 'normal' | 'urgent'
  created_at: string
  consultant: { name: string } | null
  category: { name: string; icon: string } | null
}

type Category = { id: number; name: string; icon: string }

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ClientDetail() {
  const router = useRouter()
  const { id } = router.query
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showAddLog, setShowAddLog] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [loading, setLoading] = useState(true)

  // Add log form state
  const [logCategory, setLogCategory] = useState<number | null>(null)
  const [logPriority, setLogPriority] = useState<'normal' | 'urgent'>('normal')
  const [logContent, setLogContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetch(`/api/crm/client/${id}`).then(r => r.json()),
      fetch('/api/crm/categories').then(r => r.json()),
    ]).then(([detail, cats]) => {
      setClient(detail.client)
      setLogs(detail.logs || [])
      setCategories(cats || [])
      setLoading(false)
    })
  }, [id])

  async function submitLog() {
    if (!logContent.trim()) return
    setSubmitting(true)
    const res = await fetch('/api/crm/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: id,
        category_id: logCategory,
        content: logContent.trim(),
        priority: logPriority,
      }),
    })
    if (res.ok) {
      const newLog = await res.json()
      setLogs(prev => [newLog, ...prev])
      setLogContent('')
      setLogCategory(null)
      setLogPriority('normal')
      setShowAddLog(false)
    }
    setSubmitting(false)
  }

  const filteredLogs = categoryFilter === 'all'
    ? logs
    : logs.filter(l => l.category?.name === categories.find(c => c.id === categoryFilter)?.name)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">載入中…</p>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">找不到此企業主</p>
      </div>
    )
  }

  return (
    <>
      <Head><title>{client['1. 企業主名']} — 顧問 CRM</title></Head>
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="text-blue-600 text-sm font-medium"
            >
              ← 返回
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-gray-900 truncate">{client['1. 企業主名']}</h1>
              <p className="text-xs text-gray-500 truncate">{client['2. 公司名稱']}</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* 基本資料卡 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">基本資料</h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Field label="執行顧問" value={client['3. 執行顧問']} />
              <Field label="專家" value={client['專家']} />
              <Field label="方案" value={client['4. 方案']} />
              <Field label="產業別" value={client['產業別']} />
              <Field label="員工數" value={client['員工數']?.toString()} />
              <Field label="身份" value={client['身份']} />
              <Field label="簽約日" value={client['5. 簽約日']} />
              <Field label="合約金額" value={client['合約金額'] ? `$${client['合約金額'].toLocaleString()}` : undefined} />
            </div>
          </div>

          {/* 合約狀態卡 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">合約狀態</h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Field label="月費合約現狀" value={client['9. 月費合約現狀']} highlight />
              <Field label="學員動態" value={client['11. 學員動態']} highlight />
            </div>
            {client['Issue（偏離狀態）'] && (
              <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
                <p className="text-xs font-medium text-orange-700">⚠ 偏離狀態</p>
                <p className="text-sm text-orange-800 mt-1">{client['Issue（偏離狀態）']}</p>
              </div>
            )}
            {client['Action（處置）'] && (
              <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs font-medium text-blue-700">處置方式</p>
                <p className="text-sm text-blue-800 mt-1">{client['Action（處置）']}</p>
              </div>
            )}
          </div>

          {/* 互動紀錄 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-500">互動紀錄（{logs.length}）</h2>
            </div>

            {/* Category filter chips */}
            {categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-3">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    categoryFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  全部
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'all' : cat.id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      categoryFilter === cat.id ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {filteredLogs.map(log => (
                <div
                  key={log.id}
                  className={`bg-white rounded-xl border px-4 py-3 ${
                    log.priority === 'urgent' ? 'border-red-200 bg-red-50' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {log.priority === 'urgent' && (
                        <span className="text-xs font-bold text-red-600">🚨 緊急</span>
                      )}
                      {log.category && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {log.category.icon} {log.category.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.content}</p>
                  {log.consultant && (
                    <p className="text-xs text-gray-400 mt-1.5">— {log.consultant.name}</p>
                  )}
                </div>
              ))}
              {filteredLogs.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">尚無紀錄</p>
              )}
            </div>
          </div>
        </div>

        {/* Add Log FAB */}
        {!showAddLog && (
          <button
            onClick={() => setShowAddLog(true)}
            className="fixed bottom-6 right-4 bg-blue-600 text-white rounded-full px-5 py-3 shadow-lg text-sm font-semibold active:bg-blue-700"
          >
            ＋ 新增紀錄
          </button>
        )}

        {/* Add Log Panel */}
        {showAddLog && (
          <div className="fixed inset-0 bg-black/40 z-20 flex items-end" onClick={() => setShowAddLog(false)}>
            <div
              className="bg-white rounded-t-2xl w-full p-5 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">新增紀錄</h3>
                <button onClick={() => setShowAddLog(false)} className="text-gray-400 text-lg">✕</button>
              </div>

              {/* Category chips */}
              <div>
                <p className="text-xs text-gray-500 mb-2">類別</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setLogCategory(logCategory === cat.id ? null : cat.id)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        logCategory === cat.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <p className="text-xs text-gray-500 mb-2">優先級</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLogPriority('normal')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      logPriority === 'normal'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    一般
                  </button>
                  <button
                    onClick={() => setLogPriority('urgent')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      logPriority === 'urgent'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    🚨 緊急
                  </button>
                </div>
              </div>

              {/* Content */}
              <div>
                <p className="text-xs text-gray-500 mb-2">紀錄內容</p>
                <textarea
                  value={logContent}
                  onChange={e => setLogContent(e.target.value)}
                  placeholder="輸入本次互動的重要內容…"
                  rows={4}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button
                onClick={submitLog}
                disabled={!logContent.trim() || submitting}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 active:bg-blue-700"
              >
                {submitting ? '儲存中…' : '儲存紀錄'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Field({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-medium mt-0.5 ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>
        {value || '—'}
      </p>
    </div>
  )
}
