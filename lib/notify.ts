import { createClient } from '@supabase/supabase-js'
import { pushMessage, buildLogNotificationFlex, buildNewClientNotificationFlex } from './line-reply'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// targetLineUserIds()：從一組顧問 id（負責顧問／專家）中，篩掉沒綁 LINE 的、
//   以及新增者本人，回傳可推播的 line_user_id 清單
async function targetLineUserIds(
  candidateIds: (string | null | undefined)[],
  addedByConsultantId: string | null,
): Promise<string[]> {
  const ids = Array.from(new Set(candidateIds)).filter(
    (id): id is string => !!id && id !== addedByConsultantId
  )
  if (!ids.length) return []

  const { data: targets } = await supabase
    .from('consultants')
    .select('line_user_id')
    .in('id', ids)
    .not('line_user_id', 'is', null)

  return (targets ?? []).map(t => t.line_user_id!).filter(Boolean)
}

// notifyClientLog()：新增互動紀錄後，只推播給這位客戶的負責顧問與專家（排除新增者本人）
//   - 呼叫方應 .catch(console.error) 避免錯誤阻斷主流程
export async function notifyClientLog(
  clientId: number,
  log: { content: string; priority: string },
  addedByConsultantId: string | null,
) {
  // 1. 查客戶資訊（含負責顧問、專家）
  const { data: client } = await supabase
    .from('線上All企業主總表')
    .select('id, "1. 企業主名", "2. 公司名稱", consultant_id, expert_id')
    .eq('id', clientId)
    .maybeSingle()

  if (!client) return

  // 2. 查新增者姓名
  const { data: addedByConsultant } = addedByConsultantId
    ? await supabase.from('consultants').select('name').eq('id', addedByConsultantId).maybeSingle()
    : { data: null }

  // 3. 只通知這位客戶的負責顧問與專家，排除新增者本人
  const lineUserIds = await targetLineUserIds(
    [client.consultant_id, client.expert_id],
    addedByConsultantId,
  )
  if (!lineUserIds.length) return

  const msg = buildLogNotificationFlex(
    client,
    log,
    addedByConsultant?.name ?? '某顧問',
  )
  await Promise.all(lineUserIds.map(id => pushMessage(id, [msg])))
}

// notifyNewClient()：新增客戶後，只推播給這位客戶的負責顧問與專家（排除新增者本人）
//   - client.consultant_id／expert_id 為這位新客戶指派到的顧問／專家（通知對象）
//   - addedByConsultantId 為實際操作新增的人（排除對象，可能跟 consultant_id 不同人）
//   - 呼叫方應 .catch(console.error) 避免錯誤阻斷主流程
export async function notifyNewClient(
  client: {
    id: number
    '1. 企業主名': string
    '2. 公司名稱'?: string | null
    '9. 月費合約現狀'?: string | null
    consultant_id?: string | null
    expert_id?: string | null
  },
  addedByConsultantId: string | null,
) {
  // 查新增者姓名
  const { data: addedByConsultant } = addedByConsultantId
    ? await supabase.from('consultants').select('name').eq('id', addedByConsultantId).maybeSingle()
    : { data: null }

  const lineUserIds = await targetLineUserIds(
    [client.consultant_id, client.expert_id],
    addedByConsultantId,
  )
  if (!lineUserIds.length) return

  const msg = buildNewClientNotificationFlex(client, addedByConsultant?.name ?? '某顧問')
  await Promise.all(lineUserIds.map(id => pushMessage(id, [msg])))
}
