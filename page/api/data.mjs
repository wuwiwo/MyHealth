import { put, list, del } from '@vercel/blob';

const PREFIX = 'myhealth-sync-';
const KEEP_LAST = 20; // keep latest N snapshots, delete older ones

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

async function cleanupOldBlobs() {
  try {
    const { blobs } = await list({ prefix: PREFIX });
    if (!blobs || blobs.length <= KEEP_LAST) return;
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const stale = blobs.slice(KEEP_LAST);
    await del(stale.map(b => b.url));
    console.log(`[cleanup] removed ${stale.length} old blobs`);
  } catch (e) {
    console.log('[cleanup] skipped:', e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: PREFIX });
      if (!blobs || blobs.length === 0)
        return res.status(200).json({ version: 1, entries: [], plans: [] });
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const data = await (await fetch(blobs[0].url)).json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const result = await put(PREFIX + Date.now() + '.json', JSON.stringify(body), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      // Fire-and-forget cleanup so the blob store doesn't grow unbounded
      cleanupOldBlobs();
      return res.status(200).json({ ok: true, url: result.url });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  res.status(404).end();
}
