// Vercel Serverless — Data Sync via Blob (list + latest)
const PREFIX = 'myhealth-sync-';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const base = 'https://blob.vercel-storage.com';

  if (req.method === 'GET') {
    try {
      const list = await fetch(base + '/?prefix=' + PREFIX, {
        headers: { Authorization: 'Bearer ' + token }
      });
      const listData = await list.json();
      const blobs = listData.blobs || [];
      if (blobs.length === 0) {
        return res.status(200).json({ version: 1, entries: [], plans: [] });
      }
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const latest = await fetch(blobs[0].url, {
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await latest.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = JSON.stringify(req.body);
      await fetch(base + '/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pathname: PREFIX + 'data.json',
          data: body,
          contentType: 'application/json'
        })
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  res.status(404).end();
}
