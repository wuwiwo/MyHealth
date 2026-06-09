// Vercel Serverless Function — Data Sync via Vercel Blob REST API
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const fileUrl = 'https://blob.vercel-storage.com/myhealth-sync.json';

  if (req.method === 'GET') {
    try {
      const r = await fetch(fileUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error('not found');
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = JSON.stringify(req.body);
      await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-vercel-blob-access': 'private'
        },
        body
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  res.status(404).end();
}
