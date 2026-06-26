import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import {
  replyMessage,
  buildBindQuickReply,
  buildClientListFlex,
  buildClientDetailFlex,
} from '../../../lib/line-reply'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const config = { api: { bodyParser: false } }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function verifySignature(body: string, sig: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET!)
    .update(body)
    .digest('base64')
  return hash === sig
}

async function getConsultant(lineUserId: string) {
  const { data } = await supabase
    .from('consultants')
    .select('id, name')
    .eq('line_user_id', lineUserId)
    .maybeSingle()
  return data as { id: string; name: string } | null
}

async function getSession(lineUserId: string) {
  const { data } = await supabase
    .from('bot_sessions')
    .select('state, data')
    .eq('line_user_id', lineUserId)
    .maybeSingle()
  return data as { state: string; data: Record<string, string> } | null
}

async function setSession(lineUserId: string, state: string, data: Record<string, string>) {
  await supabase.from('bot_sessions').upsert({
    line_user_id: lineUserId,
    state,
    data,
    updated_at: new Date().toISOString(),
  })
}

async function clearSession(lineUserId: string) {
  await supabase.from('bot_sessions').delete().eq('line_user_id', lineUserId)
}

async function sendBindPrompt(replyToken: string) {
  const { data: consultants } = await supabase
    .from('consultants')
    .select('id, name')
    .order('name')
  await replyMessage(replyToken, [buildBindQuickReply(consultants ?? [])])
}

// ─── Event handlers ───────────────────────────────────────────────────────────

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

async function handleText(replyToken: string, lineUserId: string, text: string) {
  // 1. Check multi-turn session state first
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
    return
  }

  if (session?.state === 'awaiting_search') {
    await clearSession(lineUserId)
    await handleSearch(replyToken, text)
    return
  }

  // 2. Check if consultant is bound
  const consultant = await getConsultant(lineUserId)
  if (!consultant) {
    await sendBindPrompt(replyToken)
    return
  }

  // 3. Keyword shortcuts
  if (text.includes('我的客戶')) {
    await handleMyClients(replyToken, consultant)
    return
  }

  if (text.includes('查顧問') || text.includes('所有顧問')) {
    await handleConsultantSelector(replyToken)
    return
  }

  // 4. Default: search
  await handleSearch(replyToken, text)
}

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

  // Fetch latest log per client
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

async function handlePostback(replyToken: string, lineUserId: string, data: string) {
  const params = new URLSearchParams(data)
  const action = params.get('action')

  // Bind identity (no consultant required)
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

// ─── Main handler ─────────────────────────────────────────────────────────────

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
