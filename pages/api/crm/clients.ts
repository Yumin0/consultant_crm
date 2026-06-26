import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { search, consultant_id, status } = req.query

  let query = supabase
    .from('線上All企業主總表')
    .select(`
      id,
      "1. 企業主名",
      "2. 公司名稱",
      "3. 執行顧問",
      "4. 方案",
      "9. 月費合約現狀",
      "11. 學員動態",
      "Issue（偏離狀態）",
      consultant_id,
      expert_id,
      產業別
    `)
    .order('id')
    .limit(300)

  if (search) {
    query = query.or(
      `"1. 企業主名".ilike.%${search}%,"2. 公司名稱".ilike.%${search}%`
    )
  }

  if (consultant_id && consultant_id !== 'all') {
    query = query.eq('consultant_id', consultant_id)
  }

  if (status && status !== 'all') {
    query = query.eq('"9. 月費合約現狀"', status)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Fetch latest log per client for "最後更新"
  const clientIds = (data || []).map((r: any) => r.id)
  let latestLogs: Record<number, string> = {}
  if (clientIds.length > 0) {
    const { data: logs } = await supabase
      .from('client_logs')
      .select('client_id, created_at')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
    if (logs) {
      for (const log of logs) {
        if (!latestLogs[log.client_id]) {
          latestLogs[log.client_id] = log.created_at
        }
      }
    }
  }

  const result = (data || []).map((r: any) => ({
    ...r,
    latest_log_at: latestLogs[r.id] || null,
  }))

  res.json(result)
}
