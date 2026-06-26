import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

type Client = {
  id: number
  '1. 企業主名': string
  '2. 公司名稱': string
  '3. 執行顧問': string
  '9. 月費合約現狀': string
  '11. 學員動態': string
  'Issue（偏離狀態）': string | null
  latest_log_at: string | null
}

type Consultant = { id: string; name: string }

const STATUS_COLOR: Record<string, string> = {
  '合約中': 'bg-green-100 text-green-800',
  '續約': 'bg-blue-100 text-blue-800',
  '退費': 'bg-red-100 text-red-800',
  '暫停': 'bg-yellow-100 text-yellow-800',
  '合約退費': 'bg-red-100 text-red-800',
  '過期未續': 'bg-gray-100 text-gray-600',
}

function statusColor(s: string | null) {
  if (!s) return 'bg-gray-100 text-gray-500'
  for (const key of Object.keys(STATUS_COLOR)) {
    if (s.includes(key)) return STATUS_COLOR[key]
  }
  return 'bg-gray-100 text-gray-600'
}

function relativeTime(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 週前`
  return `${Math.floor(days / 30)} 個月前`
}

export default function CrmIndex() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [search, setSearch] = useState('')
  const [consultantFilter, setConsultantFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (consultantFilter !== 'all') params.set('consultant_id', consultantFilter)
    const res = await fetch(`/api/crm/clients?${params}`)
    const data = await res.json()
    setClients(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [search, consultantFilter])

  useEffect(() => {
    fetch('/api/crm/consultants').then(r => r.json()).then(setConsultants)
  }, [])

  useEffect(() => {
    const t = setTimeout(fetchClients, 300)
    return () => clearTimeout(t)
  }, [fetchClients])

  return (
    <>
      <Head><title>顧問 CRM</title></Head>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 py-3">
            <h1 className="text-lg font-bold text-gray-900 mb-3">企業主列表</h1>
            <input
              type="search"
              placeholder="搜尋姓名或公司名稱…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {/* Consultant filter chips */}
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setConsultantFilter('all')}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  consultantFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                全部
              </button>
              {consultants.map(c => (
                <button
                  key={c.id}
                  onClick={() => setConsultantFilter(c.id)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    consultantFilter === c.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Client count */}
        <div className="px-4 py-2 text-xs text-gray-400">
          {loading ? '載入中…' : `共 ${clients.length} 位企業主`}
        </div>

        {/* Client list */}
        <div className="px-4 pb-8 space-y-2">
          {clients.map(c => (
            <div
              key={c.id}
              onClick={() => router.push(`/crm/${c.id}`)}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3 active:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {c['1. 企業主名']}
                  </p>
                  <p className="text-sm text-gray-500 truncate mt-0.5">
                    {c['2. 公司名稱']}
                  </p>
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c['9. 月費合約現狀'])}`}>
                  {c['9. 月費合約現狀'] || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{c['3. 執行顧問']}</span>
                <div className="flex items-center gap-2">
                  {c['Issue（偏離狀態）'] && (
                    <span className="text-xs text-orange-500 font-medium">⚠ 偏離</span>
                  )}
                  {c.latest_log_at && (
                    <span className="text-xs text-gray-300">{relativeTime(c.latest_log_at)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!loading && clients.length === 0 && (
            <p className="text-center text-gray-400 py-12">查無符合條件的企業主</p>
          )}
        </div>
      </div>
    </>
  )
}
