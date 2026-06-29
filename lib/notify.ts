import { createClient } from '@supabase/supabase-js'
import { pushMessage, buildLogNotificationFlex, buildNewClientNotificationFlex } from './line-reply'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// notifyClientLog()：新增互動紀錄後，推播通知給所有已綁定 LINE 的顧問（排除新增者本人）
//   - 呼叫方應 .catch(console.error) 避免錯誤阻斷主流程
export async function notifyClientLog(
  clientId: number,
  log: { content: string; priority: string },
  addedByConsultantId: string | null,
) {
  // 1. 查客戶資訊
  const { data: client } = await supabase
    .from('線上All企業主總表')
    .select('id, "1. 企業主名", "2. 公司名稱", consultant_id')
    .eq('id', clientId)
    .maybeSingle()

  if (!client) return

  // 2. 查新增者姓名
  const { data: addedByConsultant } = addedByConsultantId
    ? await supabase.from('consultants').select('name').eq('id', addedByConsultantId).maybeSingle()
    : { data: null }

  // 3. 查所有已綁定 LINE 的顧問，排除新增者本人
  const { data: targets } = await supabase
    .from('consultants')
    .select('line_user_id')
    .not('line_user_id', 'is', null)
    .neq('id', addedByConsultantId ?? '')

  if (!targets?.length) return

  // 4. 推播給所有目標顧問
  const msg = buildLogNotificationFlex(
    client,
    log,
    addedByConsultant?.name ?? '某顧問',
  )
  await Promise.all(targets.map(t => pushMessage(t.line_user_id!, [msg])))
}

// notifyNewClient()：新增客戶後，推播通知給所有已綁定 LINE 的顧問（排除新增者本人）
//   - 呼叫方應 .catch(console.error) 避免錯誤阻斷主流程
export async function notifyNewClient(
  client: { id: number; '1. 企業主名': string; '2. 公司名稱'?: string | null; '9. 月費合約現狀'?: string | null },
  addedByConsultantId: string | null,
) {
  // 查新增者姓名
  const { data: addedByConsultant } = addedByConsultantId
    ? await supabase.from('consultants').select('name').eq('id', addedByConsultantId).maybeSingle()
    : { data: null }

  // 查所有已綁定 LINE 的顧問，排除新增者本人
  const { data: targets } = await supabase
    .from('consultants')
    .select('line_user_id')
    .not('line_user_id', 'is', null)
    .neq('id', addedByConsultantId ?? '')

  if (!targets?.length) return

  const msg = buildNewClientNotificationFlex(client, addedByConsultant?.name ?? '某顧問')
  await Promise.all(targets.map(t => pushMessage(t.line_user_id!, [msg])))
}
