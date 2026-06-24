import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { table } = req.query;
  if (!table || typeof table !== 'string') {
    return res.status(400).json({ error: 'Missing table parameter' });
  }

  const supabase = getClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase.from(table).select('*').limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data: data ?? [] });
  }

  if (req.method === 'POST') {
    // Omit empty-string fields so DB defaults (e.g. serial PK, timestamps) can apply
    const body = req.body as Record<string, string>;
    const payload = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== '')
    );
    const { data, error } = await supabase.from(table).insert(payload).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'PUT') {
    const { pkValues, row } = req.body as {
      pkValues: Record<string, unknown>;
      row: Record<string, string>;
    };
    if (!pkValues || Object.keys(pkValues).length === 0) {
      return res.status(400).json({ error: 'Missing pkValues' });
    }
    const { data, error } = await supabase.from(table).update(row).match(pkValues).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    const { pkValues } = req.body as { pkValues: Record<string, unknown> };
    if (!pkValues || Object.keys(pkValues).length === 0) {
      return res.status(400).json({ error: 'Missing pkValues' });
    }
    const { error } = await supabase.from(table).delete().match(pkValues);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
