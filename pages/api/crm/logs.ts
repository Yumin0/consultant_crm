import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { notifyClientLog } from '../../../lib/notify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { client_id, consultant_id, category_id, content, priority } = req.body

  if (!client_id || !content) {
    return res.status(400).json({ error: '必填欄位缺少：client_id 和 content' })
  }

  const { data, error } = await supabase
    .from('client_logs')
    .insert({
      client_id: Number(client_id),
      consultant_id: consultant_id || null,
      category_id: category_id ? Number(category_id) : null,
      content,
      priority: priority || 'normal',
    })
    .select(`
      id, content, priority, created_at,
      consultant:consultants(name),
      category:log_categories(name, icon)
    `)
    .single()

  if (error) return res.status(500).json({ error: error.message })

  notifyClientLog(
    Number(client_id),
    { content, priority: priority || 'normal' },
    consultant_id || null,
  ).catch(console.error)

  res.status(201).json(data)
}
