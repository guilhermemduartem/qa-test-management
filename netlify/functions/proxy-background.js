// ═══════════════════════════════════════════════════════════════════════════
// proxy-background — Background Function (sufixo "-background").
// Executa por até ~15 min, sem o teto de 30s da função síncrona, encaminhando
// a chamada para o destino e gravando o resultado em qa_bulk_proxy_results.
// O front dispara (fire-and-forget, recebe 202) e faz polling pelo jobId.
//
// Env necessárias no Netlify:
//   SUPABASE_URL (ou VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function patchResult(jobId, fields) {
  if (!SUPABASE_URL || !SERVICE_ROLE || !jobId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/qa_bulk_proxy_results?id=eq.${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(fields),
    });
  } catch (_) { /* nada a fazer; o polling do front expira sozinho */ }
}

exports.handler = async function (event) {
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400 }; }
  const { jobId, target, method, headers: fwdHeaders, body } = payload;

  if (!jobId || !target || !/^https?:\/\//.test(String(target))) {
    await patchResult(jobId, { status: 'error', ok: false, http_status: 0, body: 'URL inválida' });
    return { statusCode: 400 };
  }

  try {
    const m = (method || 'GET').toUpperCase();
    const resp = await fetch(target, {
      method: m,
      headers: fwdHeaders || {},
      body: m !== 'GET' && m !== 'HEAD' && body ? body : undefined,
    });
    const text = await resp.text();
    await patchResult(jobId, { status: 'done', ok: resp.ok, http_status: resp.status, body: text });
  } catch (err) {
    await patchResult(jobId, { status: 'error', ok: false, http_status: 0, body: String(err) });
  }
  return { statusCode: 200 };
};
