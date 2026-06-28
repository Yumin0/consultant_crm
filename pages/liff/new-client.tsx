import { useEffect, useState } from 'react'

type Consultant = { id: string; name: string }

const STATUS_OPTIONS = ['合約中', '合約暫停中', '退費', '過期未續', '尚未成交']

export default function NewClientLiff() {
  const [ready, setReady] = useState(false)
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [currentConsultantId, setCurrentConsultantId] = useState('')

  // 表單欄位
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState('')
  const [consultantId, setConsultantId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      const liff = (await import('@line/liff')).default
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID_NEW_CLIENT! })

      // 取得顧問列表
      const res = await fetch('/api/crm/consultants')
      const list: Consultant[] = await res.json()
      setConsultants(list)

      // 用 LINE userId 比對已綁定的顧問，自動帶入
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile()
        const matched = list.find((_, i) => {
          // 這裡只能在前端比對，需要呼叫 API 查詢
          return false
        })
        // 呼叫後端查詢綁定的顧問
        const meRes = await fetch(`/api/crm/consultants?line_user_id=${profile.userId}`)
        if (meRes.ok) {
          const me: Consultant | null = await meRes.json()
          if (me) {
            setCurrentConsultantId(me.id)
            setConsultantId(me.id)
          }
        }
      }

      setReady(true)
    }
    init().catch(console.error)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('請填寫企業主名'); return }
    setSubmitting(true)
    setError('')

    const selected = consultants.find(c => c.id === consultantId)
    const res = await fetch('/api/crm/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        company: company.trim(),
        status,
        consultant_id: consultantId || undefined,
        consultant_name: selected?.name,
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || '新增失敗，請再試一次')
      setSubmitting(false)
      return
    }

    const created = await res.json()
    setDone(`✅ 已新增「${created['1. 企業主名']}」`)

    // 2 秒後關閉 LIFF
    setTimeout(async () => {
      const liff = (await import('@line/liff')).default
      liff.closeWindow()
    }, 2000)
  }

  if (!ready) {
    return (
      <div style={styles.center}>
        <p style={{ color: '#6b7280' }}>載入中…</p>
      </div>
    )
  }

  if (done) {
    return (
      <div style={styles.center}>
        <p style={{ fontSize: 20, color: '#16a34a' }}>{done}</p>
        <p style={{ color: '#6b7280', marginTop: 8 }}>視窗即將關閉</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>＋ 新增客戶</h2>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>企業主名 <span style={{ color: '#dc2626' }}>*</span></label>
        <input
          style={styles.input}
          placeholder="例如：王小明"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <label style={styles.label}>公司名稱</label>
        <input
          style={styles.input}
          placeholder="例如：科技有限公司"
          value={company}
          onChange={e => setCompany(e.target.value)}
        />

        <label style={styles.label}>月費合約現狀</label>
        <select style={styles.input} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">請選擇（可略）</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label style={styles.label}>執行顧問</label>
        <select style={styles.input} value={consultantId} onChange={e => setConsultantId(e.target.value)}>
          <option value="">請選擇（可略）</option>
          {consultants.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" style={styles.button} disabled={submitting}>
          {submitting ? '新增中…' : '儲存客戶'}
        </button>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '24px 20px 40px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 24,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    marginTop: 12,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
    color: '#111827',
    backgroundColor: '#fff',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    marginTop: 4,
  },
  button: {
    marginTop: 24,
    width: '100%',
    padding: '14px',
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
  },
}
