// ─── LINE API 基礎設定 ───────────────────────────────────────────────────────
// LINE_API：LINE Messaging API 的基底 URL
// authHeaders()：組出帶有 Bearer Token 的 HTTP 標頭，呼叫 LINE API 時必須帶入
// replyMessage()：用 replyToken 回覆訊息（只能在使用者發訊後 30 秒內使用）
// pushMessage()：主動推播訊息給指定 userId（不需 replyToken，任何時間都可用）

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

// ─── 合約狀態：圖示對照 ──────────────────────────────────────────────────────
// STATUS_ICON：合約現狀關鍵字 → emoji 對照表（2026-07-22 由顏色改圖示）
//   公司用色規範沒有紅/橘/綠這種語意色，狀態嚴重度改用圖示本身的顏色語意來傳達，
//   文字統一用中性色（見 statusIcon() 呼叫端），不再用背景/文字色區分好壞
//   關鍵字取自資料庫「9. 月費合約現狀」實際出現過的用詞（見 docs/project-spec.md）
// statusIcon()：傳入合約狀態字串，回傳對應 emoji；不符合任何關鍵字（例如歷史雜訊
//   文字「Deadfile」「剩下三週!」）就回傳通用文件圖示，不隱藏原始文字

const STATUS_ICON: Record<string, string> = {
  '合約進行中': '✅',
  '合約中':     '✅',
  '合約暫停中': '⏸️',
  '暫停':       '⏸️',
  '合約退費':   '⚠️',
  '退費':       '⚠️',
  '過期未續':   '⛔',
  '尚未成交':   '🆕',
}

function statusIcon(s: string | null): string {
  if (!s) return '📄'
  for (const [key, icon] of Object.entries(STATUS_ICON)) {
    if (s.includes(key)) return icon
  }
  return '📄'
}

// ─── 時間格式工具 ────────────────────────────────────────────────────────────
// relativeTime()：將 ISO 時間轉為「今天 / 昨天 / N 天前 / N 週前 / N 個月前」
//   顯示在客戶卡片右下角的最後互動時間
// isStale()：超過 30 天沒有互動紀錄 → true，呼叫端會加 ⏰ 提示，不用顏色判斷
// formatDate()：將 ISO 時間轉為「M/D HH:MM」格式，顯示在互動紀錄條目裡

function relativeTime(iso: string | null): string {
  if (!iso) return '無紀錄'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 週前`
  return `${Math.floor(days / 30)} 個月前`
}

function isStale(iso: string | null): boolean {
  if (!iso) return false
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days >= 30
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── 身份綁定：顧問選擇選單 ──────────────────────────────────────────────────
// buildBindQuickReply()：當使用者首次使用 LINE Bot 時，
//   顯示「你好！請問你是哪位顧問？」並列出顧問快速回覆按鈕（最多 13 位）
// 修改歡迎文字：改 text 欄位
// 修改顯示顧問數量上限：改 .slice(0, 13) 的數字（LINE 最多支援 13 個 quickReply items）

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
  latest_log_urgent?: boolean
}

// ─── 客戶列表：單一泡泡、緊湊清單 ─────────────────────────────────────────────
// buildClientListFlex()：產生「查看顧問客戶列表」的 Flex Message
//   2026-07-22 二次改版：第一版（每人一段、含兩顆按鈕）雖然不用橫滑了，但每人還是
//   佔一大塊，資料一多還是要滑很久。改成每人壓成一行，整行可點直接進「查看」詳情
//   （詳情卡片本身已有「＋新增紀錄」按鈕），列表本身拿掉按鈕，換取一次能看到更多人。
//
// 單一 bubble 結構：
//   body
//     ├─ 標題文字（粗體）+ 分隔線
//     └─ 每位客戶一行（用 separator 分隔，整行 action=view，點了直接開詳情卡）：
//          左（flex 3）：狀態圖示+企業主名（粗體） / 公司名稱（小字，輔助資訊）
//          右（flex 2）：🚨緊急／⚠偏離（優先顯示緊急，靠右）/ 最後互動時間（超過30天加⏰）
//
// 修改 bubble 寬度：改 size: 'giga'（可選 nano / micro / kilo / mega / giga）

export function buildClientListFlex(clients: ClientRow[], title: string) {
  const rows = clients.flatMap((c, i) => [
    ...(i > 0 ? [{ type: 'separator', margin: 'md' }] : []),
    {
      type: 'box',
      layout: 'horizontal',
      margin: i > 0 ? 'md' : 'md',
      paddingAll: 'sm',
      action: { type: 'postback', label: '查看', data: `action=view&id=${c.id}` },
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          flex: 3,
          contents: [
            {
              type: 'text',
              text: `${statusIcon(c['9. 月費合約現狀'])} ${c['1. 企業主名'] || '—'}`,
              weight: 'bold',
              size: 'sm',
              color: '#111214',
              wrap: true,
            },
            { type: 'text', text: c['2. 公司名稱'] || '—', size: 'xs', color: '#9599A4', wrap: true },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 2,
          contents: [
            ...(c.latest_log_urgent
              ? [{ type: 'text', text: '🚨 緊急', size: 'xs', color: '#111214', align: 'end' as const }]
              : c['Issue（偏離狀態）']
              ? [{ type: 'text', text: '⚠ 偏離', size: 'xs', color: '#111214', align: 'end' as const }]
              : []),
            ...(c.latest_log_at
              ? [{ type: 'text', text: `${isStale(c.latest_log_at) ? '⏰ ' : ''}${relativeTime(c.latest_log_at)}`, size: 'xs', color: '#9599A4', align: 'end' as const }]
              : []),
          ],
        },
      ],
    },
  ])

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg', color: '#111214' },
          { type: 'text', text: '點任一行查看詳情與新增紀錄', size: 'xs', color: '#9599A4', margin: 'xs' },
          { type: 'separator', margin: 'md' },
          ...rows,
        ],
      },
    },
  }
}

type LogRow = {
  content: string
  created_at: string
  priority: string
  consultants: { name: string } | null
  category?: { name: string; icon: string | null } | null
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

// ─── 客戶詳情：Flex Message Bubble ───────────────────────────────────────────
// buildClientDetailFlex()：產生「查看單一客戶詳情」的 Flex Message
//
// 卡片三層結構：
//   header（標題列）→ 深藍背景 #1d4ed8
//     ├─ 企業主名  → 白色 #ffffff, weight: 'bold', size: 'lg'
//     └─ 公司名稱  → 淺藍 #bfdbfe, size: 'sm'
//        修改標題背景色：改 backgroundColor: '#1d4ed8'
//
//   body（主內容）
//     ├─ 合約現狀（水平列）→ 標籤灰色 #6b7280，值改用 statusIcon() 圖示 + 近黑文字
//     ├─ 學員動態（水平列）→ 標籤灰色，值深灰 #374151
//     ├─ ⚠ 偏離狀態區塊（有才顯示）→ 橘底 #fff7ed，文字 #c2410c
//     ├─ 處置方式區塊（有才顯示） → 藍底 #eff6ff，文字 #1d4ed8
//     ├─ 分隔線
//     └─ 最近互動紀錄清單
//          每筆紀錄（log）
//            ├─ 緊急時：紅底 #fef2f2，顯示「🚨 緊急」
//            ├─ 一般時：灰底 #f9fafb
//            ├─ 紀錄內容  → size: 'sm', color: '#374151'
//            └─ 顧問名 + 時間 → size: 'xs', color: '#9ca3af'
//
//   footer（底部）
//     └─ 「＋ 新增紀錄」按鈕 → style: 'primary', color: '#2563eb'（藍色）

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
          ...(log.category?.name
            ? [{ type: 'text', text: `${log.category.icon ?? ''} ${log.category.name}`.trim(), size: 'xs', color: '#2563eb', weight: 'bold' as const }]
            : []),
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
              { type: 'text', text: `${statusIcon(client['9. 月費合約現狀'])} ${client['9. 月費合約現狀'] || '—'}`, size: 'xs', color: '#111214', weight: 'bold', flex: 3 },
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

// ─── 企業主介紹卡（原型）：4 張主題卡 Carousel ────────────────────────────────
// buildClientProfileCarousel()：依 Chloe 需求文件的 4 象限設計，改用 carousel 呈現
//   （2026-07-22 視覺原型，資料來源尚未定案，目前用假資料測試樣式）
//
// 顏色需依 docs/brand-colors.md 公司用色規範的「衍生色階」做法：
//   挑一個輔助色當基準（此處用淺藍 #ADCFFF），往近黑/白內插出深淺色階，維持同一色系，
//   不要混用清單裡不同色相的色票（例如灰＋藍混雜，不算同一色系漸層）
//   背景較淺的卡片（textOnLight=true）標題文字要改深色，否則會看不清楚
//
// 每張卡片：
//   header → 姓名/公司（小字）+ 圖示與主題標題
//   body   → 條列內容
//   footer → 只有「行動計畫」卡才有「＋新增紀錄」按鈕，固定用近黑 #111214，不隨卡片色變化（維持按鈕辨識度一致）

type ProfileCard = {
  icon: string
  title: string
  color: string
  textOnLight?: boolean
  lines: string[]
  newLogClientId?: number
}

export function buildClientProfileCarousel(
  clientName: string,
  companyName: string,
  cards: ProfileCard[],
) {
  const bubbles = cards.map(card => {
    const titleColor = card.textOnLight ? '#111214' : '#ffffff'
    const subtitleColor = card.textOnLight ? '#111214' : '#F2F2F3'

    return {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        backgroundColor: card.color,
        contents: [
          { type: 'text', text: `${clientName}・${companyName}`, size: 'xs', color: subtitleColor },
          { type: 'text', text: `${card.icon} ${card.title}`, color: titleColor, weight: 'bold', size: 'md', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: card.lines.length > 0
          ? card.lines.map(line => ({ type: 'text', text: line, size: 'sm', color: '#374151', wrap: true }))
          : [{ type: 'text', text: '（暫無資料）', size: 'sm', color: '#9ca3af' }],
      },
      ...(card.newLogClientId
        ? {
            footer: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '12px',
              contents: [{
                type: 'button',
                action: { type: 'postback', label: '＋ 新增紀錄', data: `action=new_log&cid=${card.newLogClientId}` },
                style: 'primary',
                height: 'sm',
                color: '#111214',
              }],
            },
          }
        : {}),
    }
  })

  return {
    type: 'flex',
    altText: `${clientName} 企業主介紹卡`,
    contents: { type: 'carousel', contents: bubbles },
  }
}

// ─── 互動紀錄通知：推播給負責顧問 ──────────────────────────────────────────
// buildLogNotificationFlex()：有人為客戶新增互動紀錄時，推播給負責顧問
//
// 卡片結構：
//   header（橘色 #f97316）：🔔 新互動紀錄
//   body：
//     ├─ 企業主名（粗體）+ 公司（灰字）
//     ├─ 紀錄內容（灰底框，最多 120 字；緊急則加 🚨 badge）
//     └─ 「由 [顧問名] 新增 · 剛才」（小字灰色）
//   footer：「查看客戶詳情」按鈕（postback: action=view&id）

type NotificationClient = {
  id: number
  '1. 企業主名': string
  '2. 公司名稱': string
}

export function buildLogNotificationFlex(
  client: NotificationClient,
  log: { content: string; priority: string },
  addedBy: string,
) {
  const preview = log.content.length > 120 ? log.content.slice(0, 120) + '…' : log.content
  const isUrgent = log.priority === 'urgent'

  return {
    type: 'flex',
    altText: `🔔 ${client['1. 企業主名']} 有新互動紀錄（由 ${addedBy} 新增）`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        backgroundColor: '#f97316',
        contents: [
          { type: 'text', text: '🔔 新互動紀錄', color: '#ffffff', weight: 'bold', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: client['1. 企業主名'] || '—', weight: 'bold', size: 'md', color: '#111827' },
          { type: 'text', text: client['2. 公司名稱'] || '—', size: 'sm', color: '#6b7280' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            paddingAll: '10px',
            backgroundColor: isUrgent ? '#fef2f2' : '#f3f4f6',
            cornerRadius: '6px',
            contents: [
              ...(isUrgent
                ? [{ type: 'text', text: '🚨 緊急', size: 'xs', color: '#dc2626', weight: 'bold' as const }]
                : []),
              { type: 'text', text: preview, size: 'sm', color: '#374151', wrap: true },
            ],
          },
          {
            type: 'text',
            text: `由 ${addedBy} 新增 · 剛才`,
            size: 'xs',
            color: '#9ca3af',
            margin: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [{
          type: 'button',
          action: {
            type: 'postback',
            label: '查看客戶詳情',
            data: `action=view&id=${client.id}`,
          },
          style: 'primary',
          height: 'sm',
          color: '#2563eb',
        }],
      },
    },
  }
}

// ─── 新增客戶通知：推播給所有顧問 ───────────────────────────────────────────
// buildNewClientNotificationFlex()：有人新增客戶時，推播給其他已綁定顧問
//
// 卡片結構：
//   header（綠色 #16a34a）：🆕 新增客戶
//   body：企業主名（粗體）、公司（灰字）、合約狀態、「由 [顧問名] 建立」
//   footer：「查看客戶詳情」按鈕

type NewClientNotification = {
  id: number
  '1. 企業主名': string
  '2. 公司名稱'?: string | null
  '9. 月費合約現狀'?: string | null
}

export function buildNewClientNotificationFlex(
  client: NewClientNotification,
  addedBy: string,
) {
  const status = client['9. 月費合約現狀'] || null

  return {
    type: 'flex',
    altText: `🆕 新客戶：${client['1. 企業主名']}（由 ${addedBy} 建立）`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        backgroundColor: '#16a34a',
        contents: [
          { type: 'text', text: '🆕 新增客戶', color: '#ffffff', weight: 'bold', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: client['1. 企業主名'] || '—', weight: 'bold', size: 'md', color: '#111827' },
          { type: 'text', text: client['2. 公司名稱'] || '—', size: 'sm', color: '#6b7280' },
          ...(status ? [{
            type: 'text',
            text: `${statusIcon(status)} ${status}`,
            size: 'xs',
            color: '#111214',
            margin: 'sm' as const,
          }] : []),
          {
            type: 'text',
            text: `由 ${addedBy} 建立 · 剛才`,
            size: 'xs',
            color: '#9ca3af',
            margin: 'md' as const,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [{
          type: 'button',
          action: {
            type: 'postback',
            label: '查看客戶詳情',
            data: `action=view&id=${client.id}`,
          },
          style: 'primary',
          height: 'sm',
          color: '#16a34a',
        }],
      },
    },
  }
}

// ─── 快速紀錄：分類選單 Quick Reply ──────────────────────────────────────────
// buildCategoryQuickReply()：按「新增紀錄」後，先讓顧問選擇這筆紀錄屬於哪個類別
//   只傳入 is_archived = false 的現行 5 大類（呼叫端負責篩選）

export function buildCategoryQuickReply(
  categories: { id: number; name: string; icon: string | null }[],
  clientName: string,
) {
  return {
    type: 'text',
    text: `📋 請選擇「${clientName}」這筆紀錄的類別：`,
    quickReply: {
      items: categories.slice(0, 13).map(c => ({
        type: 'action',
        action: {
          type: 'postback',
          label: `${c.icon ?? ''} ${c.name}`.trim().slice(0, 20),
          data: `action=new_log_category&cat_id=${c.id}&cat_name=${encodeURIComponent(c.name)}`,
          displayText: c.name,
        },
      })),
    },
  }
}

// ─── 新增客戶：LIFF 表單入口 ─────────────────────────────────────────────────
// buildNewClientMessage()：回傳一個 bubble，內含「開啟新增客戶表單」按鈕
// 按鈕動作為 uri 類型，點擊後直接開啟 LIFF 表單頁面

export function buildNewClientMessage(liffId: string) {
  const liffUrl = `https://liff.line.me/${liffId}`
  return {
    type: 'flex',
    altText: '新增客戶',
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '新增客戶', weight: 'bold', size: 'md', color: '#111827' },
          { type: 'text', text: '點下方按鈕開啟表單填寫客戶基本資料', size: 'sm', color: '#6b7280', wrap: true, margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: '＋ 開啟新增表單',
            uri: liffUrl,
          },
          style: 'primary',
          height: 'sm',
          color: '#16a34a',
        }],
      },
    },
  }
}
