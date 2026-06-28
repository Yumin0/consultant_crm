import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { line_user_id } = req.query

  // 若帶 line_user_id，查詢單一綁定顧問
  if (line_user_id) {
    const { data, error } = await supabase
      .from('consultants')
      .select('id, name')
      .eq('line_user_id', line_user_id as string)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  const { data, error } = await supabase
    .from('consultants')
    .select('id, name')
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}
