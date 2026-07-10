import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';

// Proxy CORS para desenvolvimento local — evita o erro "Failed to fetch"
// quando o app roda em localhost e as APIs estão em outros domínios.
// Em produção, configure o campo "Proxy URL" em cada ambiente nas APIs.
function corsProxyPlugin() {
  return {
    name: 'cors-proxy',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void } }) {
      server.middlewares.use('/cors-proxy', async (req: IncomingMessage, res: ServerResponse) => {
        const raw = req.url?.slice(1) ?? '';
        const target = decodeURIComponent(raw);

        if (!target.startsWith('http')) {
          res.writeHead(400);
          res.end('URL inválida');
          return;
        }

        try {
          const headers: Record<string, string> = {};
          if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'] as string;
          if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'] as string;

          let body: string | undefined;
          if (req.method === 'POST') {
            body = await new Promise<string>((resolve) => {
              let buf = '';
              req.on('data', (chunk: Buffer) => { buf += chunk.toString(); });
              req.on('end', () => resolve(buf));
            });
          }

          const resp = await fetch(target, {
            method: req.method ?? 'GET',
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
          res.writeHead(502);
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), corsProxyPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
