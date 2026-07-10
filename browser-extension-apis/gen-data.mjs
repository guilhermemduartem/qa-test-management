/* Extrai DEFAULT_ENVS e DEFAULT_SERVICES de src/lib/apisStorage.ts e grava
   apis-data.js (consumido pela página da extensão). Roda: node gen-data.mjs */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/apisStorage.ts', import.meta.url), 'utf8');

function extractArray(marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('não achei ' + marker);
  const eq = src.indexOf('=', at);              // pula a anotação de tipo (ApiEnvironment[])
  const start = src.indexOf('[', eq);
  // acha o ] que fecha (contagem de colchetes)
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const text = src.slice(start, end + 1);
  // eslint-disable-next-line no-eval
  return eval('(' + text + ')');
}

const environments = extractArray('const DEFAULT_ENVS');
const services = extractArray('const DEFAULT_SERVICES');

// só o necessário p/ health check
const envs = environments.map((e) => ({ id: e.id, name: e.name }));
const svcs = services.map((s) => ({
  id: s.id, name: s.name, healthPath: s.healthPath || '/HealthCheck',
  method: s.method || 'GET', envUrls: s.envUrls,
}));

const out = `/* GERADO por gen-data.mjs a partir de src/lib/apisStorage.ts — não editar à mão. */
window.APIS_DATA = ${JSON.stringify({ environments: envs, services: svcs }, null, 2)};
`;
writeFileSync(new URL('./apis-data.js', import.meta.url), out);
console.log(`apis-data.js: ${envs.length} ambientes, ${svcs.length} serviços`);
