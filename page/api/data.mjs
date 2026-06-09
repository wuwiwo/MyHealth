// Vercel Serverless Function — Data Sync API
// Uses Vercel KV (Redis) for persistent storage

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_KEY = 'myhealth_sync_data';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(200).json({ version: 1, entries: [], plans: [] });
      }
      const response = await fetch(`${KV_REST_API_URL}/get/${KV_KEY}`, {
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
      });
      const data = await response.json();
      const result = data.result ? JSON.parse(data.result) : { version: 1, entries: [], plans: [] };
      return res.status(200).json(result);
    } catch (e) {
      return res.status(200).json({ version: 1, entries: [], plans: [] });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = JSON.stringify(req.body);
      if (KV_REST_API_URL && KV_REST_API_TOKEN) {
        await fetch(`${KV_REST_API_URL}/set/${KV_KEY}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${KV_REST_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(404).end();
}
