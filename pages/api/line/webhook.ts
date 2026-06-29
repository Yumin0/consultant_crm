import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import {
  replyMessage,
  buildBindQuickReply,
  buildClientListFlex,
  buildClientDetailFlex,
  buildNewClientMessage,
} from '../../../lib/line-reply'
import { notifyClientLog } from '../../../lib/notify'

// Supabase 客戶端：使用 service role key，可繞過 RLS 直接操作所有資料表
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 停用 Next.js 內建的 body parser，改為手動讀取原始 body（LINE 簽名驗證需要原始字串）
export const config = { api: { bodyParser: false } }

// ─── 工具函式 ─────────────────────────────────────────────────────────────────

// getRawBody()：從 request stream 手動讀取原始字串，供簽名驗證使用
async function getRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// verifySignature()：用 LINE_CHANNEL_SECRET 對 body 做 HMAC-SHA256，比對 x-line-signature header
// 驗證失敗 → 回傳 401，防止偽造請求
function verifySignature(body: string, sig: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET!)
    .update(body)
    .digest('base64')
  return hash === sig
}

// callMaiagent()：將使用者訊息傳入 Maiagent Chatbot，回傳 AI 回應文字
async function callMaiagent(text: string): Promise<string> {
  const res = await fetch(
    `https://api.maiagent.ai/api/v1/chatbots/${process.env.MAIAGENT_CHATBOT_ID}/completions/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Api-Key ${process.env.MAIAGENT_API_KEY}`,
      },
      body: JSON.stringify({ message: { content: text } }),
    }
  )
  const result = await res.json()
  return result.content || result.message?.content || JSON.stringify(result)
}

// getConsultant()：用 LINE userId 查詢已綁定的顧問；未綁定則回傳 null
async function getConsultant(lineUserId: string) {
  const { data } = await supabase
    .from('consultants')
    .select('id, name')
    .eq('line_user_id', lineUserId)
    .maybeSingle()
  return data as { id: string; name: string } | null
}

// getSession()：讀取使用者目前的對話狀態（state）與暫存資料（data）
// 用於多輪對話，例如「等待使用者輸入互動紀錄內容」
async function getSession(lineUserId: string) {
  const { data } = await supabase
    .from('bot_sessions')
    .select('state, data')
    .eq('line_user_id', lineUserId)
    .maybeSingle()
  return data as { state: string; data: Record<string, string> } | null
}

// setSession()：寫入或更新對話狀態，使用 upsert（有則更新、無則新增）
async function setSession(lineUserId: string, state: string, data: Record<string, string>) {
  await supabase.from('bot_sessions').upsert({
    line_user_id: lineUserId,
    state,
    data,
    updated_at: new Date().toISOString(),
  })
}

// clearSession()：刪除對話狀態，對話流程結束後呼叫（完成或取消）
async function clearSession(lineUserId: string) {
  await supabase.from('bot_sessions').delete().eq('line_user_id', lineUserId)
}

// handleMonthlyStatusEntry()：進入 Maiagent AI 對話模式
// 設定 session 狀態為 ai_chat，並發送提示訊息
async function handleMonthlyStatusEntry(replyToken: string, lineUserId: string) {
  await setSession(lineUserId, 'ai_chat', {})
  await replyMessage(replyToken, [{
    type: 'text',
    text: '🤖 已進入 AI 對話模式，請輸入你的問題。\n\n輸入「結束」可離開對話模式。',
  }])
}

// handleAiChat()：AI 對話模式下的訊息處理
// 輸入「結束」或「離開」退出；其他訊息轉發給 Maiagent 並回傳回應
async function handleAiChat(replyToken: string, lineUserId: string, text: string) {
  if (text.trim() === '結束' || text.trim() === '離開') {
    await clearSession(lineUserId)
    await replyMessage(replyToken, [{ type: 'text', text: '✅ 已離開 AI 對話模式。' }])
    return
  }
  const aiResponse = await callMaiagent(text)
  await replyMessage(replyToken, [{ type: 'text', text: aiResponse }])
}

// sendBindPrompt()：發送「請問你是哪位顧問？」的 Quick Reply 選單
// 當使用者尚未綁定身份時呼叫
async function sendBindPrompt(replyToken: string) {
  const { data: consultants } = await supabase
    .from('consultants')
    .select('id, name')
    .order('name')
  await replyMessage(replyToken, [buildBindQuickReply(consultants ?? [])])
}

// ─── 事件處理函式 ─────────────────────────────────────────────────────────────

// handleFollow()：使用者加入好友或解除封鎖時觸發
// 已綁定顧問 → 歡迎回來；尚未綁定 → 顯示顧問選擇選單
async function handleFollow(replyToken: string, lineUserId: string) {
  const consultant = await getConsultant(lineUserId)
  if (consultant) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: `歡迎回來，${consultant.name}！\n使用下方選單查詢客戶或新增紀錄。`,
    }])
    return
  }
  await sendBindPrompt(replyToken)
}

// handleText()：處理使用者傳入的文字訊息，依序判斷：
//   1. 是否處於多輪對話狀態（awaiting_content / awaiting_search）
//   2. 是否已綁定顧問身份
//   3. 關鍵字快速指令（「我的客戶」、「查顧問」）
//   4. 以上皆不符 → 視為搜尋關鍵字
const RICH_MENU_KEYWORDS = ['我的客戶', '查顧問', '所有顧問', '本月狀況']

async function handleText(replyToken: string, lineUserId: string, text: string) {
  const isRichMenuKeyword = RICH_MENU_KEYWORDS.some(k => text.includes(k))

  // 1. Rich Menu 關鍵字：強制清除 session，直接跳到關鍵字處理
  if (!isRichMenuKeyword) {
    const session = await getSession(lineUserId)

    if (session?.state === 'awaiting_content') {
      const { client_id, client_name, consultant_id } = session.data
      if (text.trim() === '取消') {
        await clearSession(lineUserId)
        await replyMessage(replyToken, [{ type: 'text', text: '已取消新增紀錄。' }])
        return
      }
      await supabase.from('client_logs').insert({
        client_id: Number(client_id),
        consultant_id,
        content: text.trim(),
        priority: 'normal',
      })
      await clearSession(lineUserId)
      await replyMessage(replyToken, [{
        type: 'text',
        text: `✅ 已新增「${client_name}」的互動紀錄。`,
      }])
      await notifyClientLog(
        Number(client_id),
        { content: text.trim(), priority: 'normal' },
        consultant_id,
      ).catch(console.error)
      return
    }

    if (session?.state === 'awaiting_search') {
      await clearSession(lineUserId)
      await handleSearch(replyToken, text)
      return
    }

    if (session?.state === 'ai_chat') {
      await handleAiChat(replyToken, lineUserId, text)
      return
    }
  } else {
    await clearSession(lineUserId)
  }

  // 2. 確認顧問身份是否已綁定
  const consultant = await getConsultant(lineUserId)
  if (!consultant) {
    await sendBindPrompt(replyToken)
    return
  }

  // 3. 關鍵字快速指令
  if (text.includes('我的客戶')) {
    await handleMyClients(replyToken, consultant)
    return
  }

  if (text.includes('查顧問') || text.includes('所有顧問')) {
    await handleConsultantSelector(replyToken)
    return
  }

  if (text.includes('本月狀況')) {
    await handleMonthlyStatusEntry(replyToken, lineUserId)
    return
  }

  // 4. 其他文字 → 直接當搜尋關鍵字
  await handleSearch(replyToken, text)
}

// handleConsultantSelector()：顯示「請選擇要查看的顧問」Quick Reply 選單
// 使用者輸入「查顧問」或「所有顧問」時觸發
async function handleConsultantSelector(replyToken: string) {
  const { data: consultants } = await supabase
    .from('consultants')
    .select('id, name')
    .order('name')
  await replyMessage(replyToken, [{
    type: 'text',
    text: '請選擇要查看的顧問：',
    quickReply: {
      items: (consultants ?? []).slice(0, 13).map(c => ({
        type: 'action',
        action: {
          type: 'postback',
          label: c.name.slice(0, 20),
          data: `action=consultant_clients&id=${c.id}&name=${encodeURIComponent(c.name)}`,
          displayText: c.name,
        },
      })),
    },
  }])
}

// handleMyClients()：查詢指定顧問的客戶列表（最多 10 位），並附上每位客戶的最後互動時間
// 「我的客戶」指令 或 查看其他顧問客戶時都會呼叫此函式
async function handleMyClients(replyToken: string, consultant: { id: string; name: string }) {
  const { data: clients } = await supabase
    .from('線上All企業主總表')
    .select(`id, "1. 企業主名", "2. 公司名稱", "9. 月費合約現狀", "Issue（偏離狀態）"`)
    .eq('consultant_id', consultant.id)
    .order('id')
    .limit(10)

  if (!clients?.length) {
    await replyMessage(replyToken, [{ type: 'text', text: '目前沒有負責的客戶。' }])
    return
  }

  // 撈每位客戶最新一筆互動紀錄的時間，顯示在卡片右下角
  const ids = clients.map(c => c.id)
  const { data: logs } = await supabase
    .from('client_logs')
    .select('client_id, created_at')
    .in('client_id', ids)
    .order('created_at', { ascending: false })

  const latestLog: Record<number, string> = {}
  for (const l of logs ?? []) {
    if (!latestLog[l.client_id]) latestLog[l.client_id] = l.created_at
  }

  const enriched = clients.map(c => ({ ...c, latest_log_at: latestLog[c.id] ?? null }))
  await replyMessage(replyToken, [buildClientListFlex(enriched, `我的客戶（${consultant.name}）`)])
}

// handleSearch()：依關鍵字模糊搜尋企業主名稱或公司名稱（最多回傳 5 筆）
// 找不到任何結果時回傳純文字提示
async function handleSearch(replyToken: string, term: string) {
  const { data: clients } = await supabase
    .from('線上All企業主總表')
    .select(`id, "1. 企業主名", "2. 公司名稱", "9. 月費合約現狀", "Issue（偏離狀態）"`)
    .or(`"1. 企業主名".ilike.%${term}%,"2. 公司名稱".ilike.%${term}%`)
    .limit(5)

  if (!clients?.length) {
    await replyMessage(replyToken, [{ type: 'text', text: `找不到「${term}」相關的企業主。` }])
    return
  }

  await replyMessage(replyToken, [buildClientListFlex(clients, `搜尋：${term}`)])
}

// handlePostback()：處理 Flex Message 按鈕點擊（postback 事件）
// action 參數對應各種按鈕行為：
//   bind              → 綁定顧問身份（不需先登入）
//   my_clients        → 查看自己的客戶列表
//   consultant_clients → 查看指定顧問的客戶列表
//   search            → 進入搜尋模式（等待使用者輸入關鍵字）
//   view              → 查看單一客戶詳情（顯示詳情 Flex Message）
//   new_log           → 新增互動紀錄（進入多輪對話，等待使用者輸入內容）
async function handlePostback(replyToken: string, lineUserId: string, data: string) {
  const params = new URLSearchParams(data)
  const action = params.get('action')

  // bind：綁定顧問身份，不需要已登入（第一次使用時操作）
  if (action === 'bind') {
    const { data: c } = await supabase
      .from('consultants')
      .update({ line_user_id: lineUserId })
      .eq('id', params.get('id'))
      .select('name')
      .maybeSingle()
    await replyMessage(replyToken, [{
      type: 'text',
      text: `✅ 身份已綁定，歡迎 ${c?.name}！\n使用下方選單開始操作。`,
    }])
    return
  }

  const consultant = await getConsultant(lineUserId)
  if (!consultant) {
    await sendBindPrompt(replyToken)
    return
  }

  switch (action) {
    case 'my_clients':
      await handleMyClients(replyToken, consultant)
      break

    case 'consultant_clients': {
      const targetId = params.get('id')!
      const targetName = decodeURIComponent(params.get('name') ?? '未知顧問')
      await handleMyClients(replyToken, { id: targetId, name: targetName })
      break
    }

    case 'search':
      await setSession(lineUserId, 'awaiting_search', {})
      await replyMessage(replyToken, [{
        type: 'text',
        text: '🔍 請輸入要查詢的企業主名稱或公司名稱：',
      }])
      break

    case 'view': {
      const clientId = params.get('id')
      const { data: client } = await supabase
        .from('線上All企業主總表')
        .select(`id, "1. 企業主名", "2. 公司名稱", "9. 月費合約現狀", "11. 學員動態", "Issue（偏離狀態）", "Action（處置）"`)
        .eq('id', clientId)
        .maybeSingle()

      if (!client) {
        await replyMessage(replyToken, [{ type: 'text', text: '找不到此客戶。' }])
        break
      }

      const { data: logs } = await supabase
        .from('client_logs')
        .select('content, created_at, priority, consultants(name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(3)

      await replyMessage(replyToken, [buildClientDetailFlex(client, (logs ?? []) as any)])
      break
    }

    case 'new_client': {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID_NEW_CLIENT!
      await replyMessage(replyToken, [buildNewClientMessage(liffId)])
      break
    }

    case 'new_log': {
      const cid = params.get('cid')!
      const { data: client } = await supabase
        .from('線上All企業主總表')
        .select(`id, "1. 企業主名"`)
        .eq('id', cid)
        .maybeSingle()

      const clientName = client?.['1. 企業主名'] ?? '該客戶'
      await setSession(lineUserId, 'awaiting_content', {
        client_id: cid,
        client_name: clientName,
        consultant_id: consultant.id,
      })
      await replyMessage(replyToken, [{
        type: 'text',
        text: `📝 請輸入對「${clientName}」的互動紀錄：\n\n（輸入「取消」可放棄）`,
      }])
      break
    }
  }
}

// ─── 主要進入點 ───────────────────────────────────────────────────────────────
// handler()：LINE webhook 的 API 路由主函式
// 流程：驗證請求來源 → 解析 events → 依事件類型分派處理函式
//   follow   → handleFollow（加好友 / 解封鎖）
//   message  → handleText（使用者傳文字）
//   postback → handlePostback（按下 Flex Message 按鈕）
// 所有 events 以 Promise.all 並行處理，最後統一回傳 200

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const sig = req.headers['x-line-signature'] as string

  if (!verifySignature(rawBody, sig)) return res.status(401).end()

  const { events } = JSON.parse(rawBody)
  await Promise.all(
    (events as any[]).map(async event => {
      const token = event.replyToken
      const userId = event.source?.userId
      if (!userId) return

      try {
        if (event.type === 'follow') {
          await handleFollow(token, userId)
        } else if (event.type === 'message' && event.message?.type === 'text') {
          await handleText(token, userId, event.message.text)
        } else if (event.type === 'postback') {
          await handlePostback(token, userId, event.postback.data)
        }
      } catch (err) {
        console.error('LINE webhook error:', err)
      }
    })
  )

  res.status(200).end()
}
