import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id)
  if (isNaN(id)) return res.status(400).json({ error: '無效的 id' })

  if (req.method === 'GET') {
    const [{ data: client, error: ce }, { data: logs, error: le }] =
      await Promise.all([
        supabase
          .from('線上All企業主總表')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('client_logs')
          .select(`
            id, content, priority, created_at,
            consultant:consultants(name),
            category:log_categories(name, icon)
          `)
          .eq('client_id', id)
          .order('created_at', { ascending: false })
          .limit(100),
      ])

    if (ce) return res.status(404).json({ error: ce.message })
    return res.json({ client, logs: logs || [] })
  }

  if (req.method === 'PATCH') {
    const updates = req.body
    const { error } = await supabase
      .from('線上All企業主總表')
      .update(updates)
      .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
