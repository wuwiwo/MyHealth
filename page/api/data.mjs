import { put, list } from '@vercel/blob';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('ENV CHECK:', {
    storeId: process.env.BLOB_STORE_ID,
    tokenPresent: !!process.env.BLOB_READ_WRITE_TOKEN,
    tokenPrefix: process.env.BLOB_READ_WRITE_TOKEN?.substring(0, 20)
  });

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({
        prefix: 'myhealth-sync-',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      if (!blobs || blobs.length === 0) {
        return res.status(200).json({ version: 1, entries: [], plans: [] });
      }
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      let best = null, bestCount = -1;
      for (const b of blobs) {
        try {
          const resp = await fetch(b.url);
          const d = await resp.json();
          const cnt = (d.entries?.length || 0) + (d.plans?.length || 0);
          if (cnt > bestCount) { best = d; bestCount = cnt; }
        } catch(e) {}
      }
      if (best) return res.status(200).json(best);
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    } catch (e) {
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const jsonStr = JSON.stringify(body);
      console.log('PUT: body length', jsonStr.length);
      await put('myhealth-sync-' + Date.now() + '.json', jsonStr, {
        contentType: 'application/json',
        access: 'private',
        addRandomSuffix: true
      });
      console.log('PUT: success');
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('PUT error:', e);
      return res.status(200).json({ ok: false, error: e.message, stack: e.stack?.split('\n')[0] });
    }
  }

  res.status(404).end();
}
