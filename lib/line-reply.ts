const LINE_API = 'https://api.line.me/v2/bot'

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
  }
}

export async function replyMessage(replyToken: string, messages: object[]) {
  await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ replyToken, messages }),
  })
}

export async function pushMessage(userId: string, messages: object[]) {
  await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ to: userId, messages }),
  })
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  '合約中': '#16a34a',
  '續約':   '#2563eb',
  '退費':   '#dc2626',
  '暫停':   '#d97706',
  '過期未續': '#6b7280',
}

function statusColor(s: string | null): string {
  if (!s) return '#6b7280'
  for (const [key, color] of Object.entries(STATUS_COLOR)) {
    if (s.includes(key)) return color
  }
  return '#6b7280'
}

function relativeTime(iso: string | null): string {
  if (!iso) return '無紀錄'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 週前`
  return `${Math.floor(days / 30)} 個月前`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Flex Message builders ────────────────────────────────────────────────────

export function buildBindQuickReply(consultants: { id: string; name: string }[]) {
  return {
    type: 'text',
    text: '👋 你好！請問你是哪位顧問？',
    quickReply: {
      items: consultants.slice(0, 13).map(c => ({
        type: 'action',
        action: {
          type: 'postback',
          label: c.name.slice(0, 20),
          data: `action=bind&id=${c.id}`,
          displayText: c.name,
        },
      })),
    },
  }
}

type ClientRow = {
  id: number
  '1. 企業主名': string
  '2. 公司名稱': string
  '9. 月費合約現狀': string | null
  'Issue（偏離狀態）': string | null
  latest_log_at?: string | null
}

export function buildClientListFlex(clients: ClientRow[], title: string) {
  const bubbles = clients.map(c => ({
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      spacing: 'sm',
      contents: [
        {
          type: 'text',
          text: c['1. 企業主名'] || '—',
          weight: 'bold',
          size: 'md',
          color: '#111827',
        },
        {
          type: 'text',
          text: c['2. 公司名稱'] || '—',
          size: 'sm',
          color: '#6b7280',
          wrap: true,
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            {
              type: 'text',
              text: c['9. 月費合約現狀'] || '—',
              size: 'xs',
              color: statusColor(c['9. 月費合約現狀']),
              flex: 1,
            },
            ...(c['Issue（偏離狀態）']
              ? [{ type: 'text', text: '⚠ 偏離', size: 'xs', color: '#f97316', align: 'end' as const }]
              : []),
            ...(c.latest_log_at
              ? [{ type: 'text', text: relativeTime(c.latest_log_at), size: 'xs', color: '#9ca3af', align: 'end' as const }]
              : []),
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '查看',
            data: `action=view&id=${c.id}`,
          },
          style: 'link',
          height: 'sm',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '新增紀錄',
            data: `action=new_log&cid=${c.id}`,
          },
          style: 'primary',
          height: 'sm',
          color: '#2563eb',
          flex: 1,
        },
      ],
    },
  }))

  const container = bubbles.length === 1
    ? bubbles[0]
    : { type: 'carousel', contents: bubbles }

  return {
    type: 'flex',
    altText: title,
    contents: container,
  }
}

type LogRow = {
  content: string
  created_at: string
  priority: string
  consultants: { name: string } | null
}

type ClientDetail = {
  id: number
  '1. 企業主名': string
  '2. 公司名稱': string
  '9. 月費合約現狀': string | null
  '11. 學員動態': string | null
  'Issue（偏離狀態）': string | null
  'Action（處置）': string | null
}

export function buildClientDetailFlex(client: ClientDetail, logs: LogRow[]) {
  const logItems = logs.length > 0
    ? logs.map(log => ({
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        paddingAll: '10px',
        backgroundColor: log.priority === 'urgent' ? '#fef2f2' : '#f9fafb',
        cornerRadius: '8px',
        contents: [
          ...(log.priority === 'urgent'
            ? [{ type: 'text', text: '🚨 緊急', size: 'xs', color: '#dc2626', weight: 'bold' as const }]
            : []),
          { type: 'text', text: log.content, size: 'sm', color: '#374151', wrap: true },
          {
            type: 'text',
            text: `— ${log.consultants?.name ?? '未知'} · ${formatDate(log.created_at)}`,
            size: 'xs',
            color: '#9ca3af',
            margin: 'xs',
          },
        ],
      }))
    : [{ type: 'text', text: '尚無互動紀錄', size: 'sm', color: '#9ca3af', margin: 'md' }]

  return {
    type: 'flex',
    altText: `${client['1. 企業主名']} 詳情`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        backgroundColor: '#1d4ed8',
        contents: [
          { type: 'text', text: client['1. 企業主名'] || '—', color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: client['2. 公司名稱'] || '—', color: '#bfdbfe', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '合約現狀', size: 'xs', color: '#6b7280', flex: 2 },
              { type: 'text', text: client['9. 月費合約現狀'] || '—', size: 'xs', color: statusColor(client['9. 月費合約現狀']), weight: 'bold', flex: 3 },
            ],
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '學員動態', size: 'xs', color: '#6b7280', flex: 2 },
              { type: 'text', text: client['11. 學員動態'] || '—', size: 'xs', color: '#374151', flex: 3, wrap: true },
            ],
          },
          ...(client['Issue（偏離狀態）'] ? [{
            type: 'box', layout: 'vertical', margin: 'md', paddingAll: '10px',
            backgroundColor: '#fff7ed', cornerRadius: '6px',
            contents: [
              { type: 'text', text: '⚠ 偏離狀態', size: 'xs', color: '#c2410c', weight: 'bold' as const },
              { type: 'text', text: client['Issue（偏離狀態）']!, size: 'xs', color: '#9a3412', wrap: true, margin: 'xs' },
            ],
          }] : []),
          ...(client['Action（處置）'] ? [{
            type: 'box', layout: 'vertical', margin: 'sm', paddingAll: '10px',
            backgroundColor: '#eff6ff', cornerRadius: '6px',
            contents: [
              { type: 'text', text: '處置方式', size: 'xs', color: '#1d4ed8', weight: 'bold' as const },
              { type: 'text', text: client['Action（處置）']!, size: 'xs', color: '#1e40af', wrap: true, margin: 'xs' },
            ],
          }] : []),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '最近互動紀錄', size: 'xs', color: '#6b7280', weight: 'bold', margin: 'md' },
          ...logItems,
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        paddingAll: '12px',
        contents: [{
          type: 'button',
          action: {
            type: 'postback',
            label: '＋ 新增紀錄',
            data: `action=new_log&cid=${client.id}`,
          },
          style: 'primary',
          height: 'sm',
          color: '#2563eb',
        }],
      },
    },
  }
}
