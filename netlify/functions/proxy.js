exports.handler = async function (event) {
  // extrai o target do path: /api/proxy/<encoded-url>
  const raw = event.path.replace(/^\/?api\/proxy\//, '').replace(/^\/?\.netlify\/functions\/proxy\//, '');
  const target = decodeURIComponent(raw);

  if (!target.startsWith('http')) {
    return { statusCode: 400, body: 'URL inválida' };
  }

  try {
    const headers = {};
    if (event.headers['authorization']) headers['Authorization'] = event.headers['authorization'];
    if (event.headers['content-type']) headers['Content-Type'] = event.headers['content-type'];

    const resp = await fetch(target, {
      method: event.httpMethod,
      headers,
      body: event.httpMethod === 'POST' && event.body ? event.body : undefined,
    });

    const body = await resp.text();

    return {
      statusCode: resp.status,
      headers: {
        'Content-Type': resp.headers.get('content-type') ?? 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: String(err),
    };
  }
};
