// Vercel Serverless — Data Sync via Blob REST API (no SDK needed)
const BLOB_BASE = 'https://gdq7v04phurwco3e.private.blob.vercel-storage.com';
const BLOB_PATH = 'myhealth-data.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const fileUrl = BLOB_BASE + '/' + BLOB_PATH;

  if (req.method === 'GET') {
    try {
      const r = await fetch(fileUrl, {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!r.ok) {
        return res.status(200).json({ version: 1, entries: [], plans: [] });
      }
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    }
  }

  if (req.method === 'PUT') {
    try {
      const jsonStr = JSON.stringify(req.body);
      const r = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: jsonStr
      });
      if (!r.ok) {
        const err = await r.text();
        return res.status(500).json({ ok: false, error: err });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  res.status(404).end();
}
