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

  const envCheck = {
    storeId: process.env.BLOB_STORE_ID || '(not set)',
    tokenPresent: !!process.env.BLOB_READ_WRITE_TOKEN,
    tokenPrefix: (process.env.BLOB_READ_WRITE_TOKEN || '').slice(0, 25)
  };

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: 'myhealth-sync-' });
      if (!blobs || blobs.length === 0)
        return res.status(200).json({ version: 1, entries: [], plans: [], env: envCheck });
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      let best = null, bestCount = -1;
      for (const b of blobs) {
        try {
          const d = await (await fetch(b.url)).json();
          const cnt = (d.entries?.length || 0) + (d.plans?.length || 0);
          if (cnt > bestCount) { best = d; bestCount = cnt; }
        } catch(e) {}
      }
      return res.status(200).json((best || { version: 1, entries: [], plans: [] }));
    } catch (e) {
      return res.status(500).json({ error: e.message, env: envCheck });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      console.log('[PUT] env:', JSON.stringify(envCheck));
      console.log('[PUT] body keys:', Object.keys(body).join(','));

      const result = await put('myhealth-sync-' + Date.now() + '.json', JSON.stringify(body), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });

      console.log('[PUT] success, url:', result.url);
      return res.status(200).json({ ok: true, url: result.url });
    } catch (e) {
      console.error('[PUT] ERROR:', e);
      return res.status(500).json({
        ok: false,
        error: e.message,
        name: e.name,
        env: envCheck
      });
    }
  }

  res.status(404).end();
}
