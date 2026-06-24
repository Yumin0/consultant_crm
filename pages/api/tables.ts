import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    return res.status(500).json({ error: `Supabase API error: ${response.status}` });
  }

  const spec = await response.json();
  const tables = Object.keys(spec.definitions || {}).sort();
  return res.status(200).json({ tables });
}
