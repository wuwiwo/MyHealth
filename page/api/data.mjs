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
      // Prefer blob with most entries (has real data), fallback to latest
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      let best = null, bestCount = -1;
      for (const b of blobs) {
        try {
          const r = await fetch(b.url, { headers: { Authorization: 'Bearer ' + token } });
          const d = await r.json();
          const cnt = (d.entries?.length || 0) + (d.plans?.length || 0);
          if (cnt > bestCount) { best = d; bestCount = cnt; }
        } catch(e) {}
      }
      if (best) return res.status(200).json(best);
    } catch (e) {
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    }
  }

  if (req.method === 'PUT') {
    try {
      const jsonStr = JSON.stringify(req.body);
      const fd = new FormData();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      fd.append('file', blob, PREFIX + 'data.json');
      const upRes = await fetch(base + '/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd
      });
      const upData = await upRes.json();
      if (!upRes.ok) {
        return res.status(500).json({ ok: false, error: JSON.stringify(upData) });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  res.status(404).end();
}
