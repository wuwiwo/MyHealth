import { put, get, del } from '@vercel/blob';

export const config = { runtime: 'edge' };

const BLOB_NAME = 'myhealth-sync-data.json';

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  if (req.method === 'GET') {
    try {
      const blob = await get(BLOB_NAME);
      if (!blob) {
        return new Response(JSON.stringify({ version: 1, entries: [], plans: [] }), {
          status: 200, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      const text = await blob.text();
      return new Response(text, {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ version: 1, entries: [], plans: [] }), {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = await req.json();
      await put(BLOB_NAME, JSON.stringify(body), {
        contentType: 'application/json',
        access: 'private',
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(null, { status: 404, headers });
}
