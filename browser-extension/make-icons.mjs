/* Gera os ícones PNG da extensão (16/32/48/128) sem dependências externas.
   Desenho clean: fundo vermelho (degradê sutil no mesmo tom) + dado branco
   centralizado (dado = dados aleatórios). Uso: node make-icons.mjs */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const GRAD_A = [239, 68, 68];    // #ef4444 vermelho
const GRAD_B = [220, 38, 38];    // #dc2626 vermelho escuro (degradê sutil)
const WHITE = [255, 255, 255];
const DOT = [220, 38, 38];       // #dc2626 pontos do dado

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function make(size) {
  const buf = Buffer.alloc(size * size * 4); // transparente
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const af = a / 255, ia = 1 - af;
    buf[i] = Math.round(r * af + buf[i] * ia);
    buf[i + 1] = Math.round(g * af + buf[i + 1] * ia);
    buf[i + 2] = Math.round(b * af + buf[i + 2] * ia);
    buf[i + 3] = Math.max(buf[i + 3], a);
  };

  // pinta uma forma definida por `inside(px,py)`; cor fixa ou função (px,py)=>[r,g,b]
  const paint = (x0, y0, x1, y1, inside, color) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        let cov = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;
          if (inside(px, py)) cov++;
        }
        if (cov) {
          const c = typeof color === 'function' ? color(x + 0.5, y + 0.5) : color;
          set(x, y, c, Math.round((cov / 9) * 255));
        }
      }
    }
  };

  const roundRect = (x0, y0, x1, y1, r) => (px, py) => {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    if (px < x0 + r && py < y0 + r) return Math.hypot(px - (x0 + r), py - (y0 + r)) <= r;
    if (px > x1 - r && py < y0 + r) return Math.hypot(px - (x1 - r), py - (y0 + r)) <= r;
    if (px < x0 + r && py > y1 - r) return Math.hypot(px - (x0 + r), py - (y1 - r)) <= r;
    if (px > x1 - r && py > y1 - r) return Math.hypot(px - (x1 - r), py - (y1 - r)) <= r;
    return true;
  };
  const circle = (cx, cy, r) => (px, py) => Math.hypot(px - cx, py - cy) <= r;

  const S = size;
  // fundo: degradê vertical sutil vermelho → vermelho escuro
  const grad = (px, py) => {
    const t = Math.max(0, Math.min(1, py / S));
    return [
      Math.round(GRAD_A[0] + (GRAD_B[0] - GRAD_A[0]) * t),
      Math.round(GRAD_A[1] + (GRAD_B[1] - GRAD_A[1]) * t),
      Math.round(GRAD_A[2] + (GRAD_B[2] - GRAD_A[2]) * t),
    ];
  };
  paint(0, 0, S, S, roundRect(0.5, 0.5, S - 0.5, S - 0.5, S * 0.22), grad);

  // dado branco centralizado
  const dx0 = S * 0.22, dy0 = S * 0.22, dx1 = S * 0.78, dy1 = S * 0.78;
  paint(dx0, dy0, dx1 + 1, dy1 + 1, roundRect(dx0, dy0, dx1, dy1, S * 0.11), WHITE);

  // face 5 do dado
  const dotR = Math.max(0.6, S * 0.055);
  const dcx = (dx0 + dx1) / 2, dcy = (dy0 + dy1) / 2;
  const off = (dx1 - dx0) * 0.26;
  const dots = S >= 32
    ? [[dcx - off, dcy - off], [dcx + off, dcy - off], [dcx, dcy], [dcx - off, dcy + off], [dcx + off, dcy + off]]
    : [[dcx - off, dcy - off], [dcx + off, dcy + off], [dcx, dcy]]; // 16px: face 3 (legível)
  for (const [cx, cy] of dots) paint(cx - dotR - 1, cy - dotR - 1, cx + dotR + 1, cy + dotR + 1, circle(cx, cy, dotR), DOT);

  return encodePNG(S, buf);
}

for (const s of [16, 32, 48, 128]) {
  writeFileSync(new URL(`./icon${s}.png`, import.meta.url), make(s));
  console.log(`icon${s}.png gerado`);
}
