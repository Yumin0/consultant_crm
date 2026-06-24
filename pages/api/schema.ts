import type { NextApiRequest, NextApiResponse } from 'next';

export type ColumnInfo = {
  name: string;
  type: string;
  isPrimaryKey: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { table } = req.query;
  if (!table || typeof table !== 'string') {
    return res.status(400).json({ error: 'Missing table parameter' });
  }

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
  const definition = spec.definitions?.[table];
  if (!definition) {
    return res.status(404).json({ error: `Table "${table}" not found in schema` });
  }

  const properties = definition.properties || {};
  const primaryKeys: string[] = [];
  const columns: ColumnInfo[] = [];

  for (const [colName, colDef] of Object.entries(properties)) {
    const def = colDef as any;
    const isPrimaryKey =
      typeof def.description === 'string' && def.description.includes('<pk/>');
    if (isPrimaryKey) primaryKeys.push(colName);
    columns.push({ name: colName, type: def.type ?? 'string', isPrimaryKey });
  }

  return res.status(200).json({ primaryKeys, columns });
}
