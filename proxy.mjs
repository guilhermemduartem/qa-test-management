/**
 * Proxy CORS local para o módulo de Health Check do QAReporter.
 * Use em produção quando o app estiver hospedado em domínio diferente das APIs.
 *
 * Iniciar: node proxy.mjs
 * Parar:   Ctrl+C
 *
 * Na configuração de cada ambiente no QAReporter, defina:
 *   Proxy URL → http://localhost:8010/
 */

import http from 'http';

const PORT = 8010;

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });
    res.end();
    return;
  }

  const raw = req.url?.slice(1) ?? '';
  const target = decodeURIComponent(raw);

  if (!target.startsWith('http')) {
    res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
    res.end('URL inválida — use: http://localhost:8010/<url-completa>');
    return;
  }

  try {
    const headers = {};
    if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

    let body;
    if (req.method === 'POST') {
      body = await new Promise((resolve) => {
        let buf = '';
        req.on('data', (chunk) => { buf += chunk.toString(); });
        req.on('end', () => resolve(buf));
      });
    }

    const resp = await fetch(target, {
      method: req.method,
      headers,
      body: body || undefined,
    });

    const respBody = await resp.text();

    res.writeHead(resp.status, {
      'Content-Type': resp.headers.get('content-type') ?? 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(respBody);
  } catch (err) {
    res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
    res.end(String(err));
  }
});

server.listen(PORT, () => {
  console.log(`\n  Proxy CORS rodando em http://localhost:${PORT}/`);
  console.log('  No QAReporter, configure: Proxy URL → http://localhost:8010/\n');
});
