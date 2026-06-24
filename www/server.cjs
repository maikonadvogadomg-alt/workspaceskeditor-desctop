'use strict';

const http = require('http');
const url = require('url');

const PORT = parseInt(process.env.PORT || '8080', 10);
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

// CORS headers
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Read body
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Proxy to Gemini
async function handleAIChat(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  if (!GEMINI_KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Chave Gemini não configurada. Adicione GEMINI_API_KEY nos Secrets.' }));
    return;
  }

  try {
    const raw = await readBody(req);
    const { system, messages } = JSON.parse(raw);

    const openaiMessages = [];
    if (system) openaiMessages.push({ role: 'system', content: system });
    for (const m of (messages || [])) {
      openaiMessages.push({ role: m.role, content: m.content });
    }

    const payload = JSON.stringify({
      model: GEMINI_MODEL,
      messages: openaiMessages,
      max_tokens: 8192,
      temperature: 0.7,
    });

    const resp = await fetch(`${GEMINI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_KEY}`,
      },
      body: payload,
    });

    const respBody = await resp.text();
    if (!resp.ok) {
      res.writeHead(resp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: respBody }));
      return;
    }

    const data = JSON.parse(respBody);
    const content = data.choices?.[0]?.message?.content || '';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  }
}

// Health
async function handleHealth(req, res) {
  setCors(res);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, gemini: !!GEMINI_KEY, model: GEMINI_MODEL }));
}

// Server
const server = http.createServer(async (req, res) => {
  const parsed = new url.URL(req.url, `http://localhost:${PORT}`);

  if (parsed.pathname === '/api/ai/chat') return handleAIChat(req, res);
  if (parsed.pathname === '/api/healthz' || parsed.pathname === '/api/health') return handleHealth(req, res);

  if (parsed.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SK-Server] http://0.0.0.0:${PORT}`);
  console.log(`[SK-Server] Gemini: ${GEMINI_KEY ? 'configurado (' + GEMINI_MODEL + ')' : 'sem chave'}`);
});
