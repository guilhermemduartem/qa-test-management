/* Ícones PNG (16/32/48/128) — fundo verde + barras de sinal/health. Sem deps.
   Uso: node make-icons.mjs */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [16, 185, 129];   // #10b981
const WHITE = [255, 255, 255];

function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function make(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4, af = a / 255, ia = 1 - af;
    buf[i] = Math.round(r * af + buf[i] * ia); buf[i + 1] = Math.round(g * af + buf[i + 1] * ia);
    buf[i + 2] = Math.round(b * af + buf[i + 2] * ia); buf[i + 3] = Math.max(buf[i + 3], a);
  };
  const fillRoundRect = (x0, y0, x1, y1, r, color) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      let cov = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        let inside = true;
        if (px < x0 + r && py < y0 + r) inside = Math.hypot(px - (x0 + r), py - (y0 + r)) <= r;
        else if (px > x1 - r && py < y0 + r) inside = Math.hypot(px - (x1 - r), py - (y0 + r)) <= r;
        else if (px < x0 + r && py > y1 - r) inside = Math.hypot(px - (x0 + r), py - (y1 - r)) <= r;
        else if (px > x1 - r && py > y1 - r) inside = Math.hypot(px - (x1 - r), py - (y1 - r)) <= r;
        if (inside) cov++;
      }
      if (cov) set(x, y, color, Math.round((cov / 9) * 255));
    }
  };

  const S = size;
  fillRoundRect(0.5, 0.5, S - 0.5, S - 0.5, S * 0.22, BG);
  // 3 barras de sinal (alturas crescentes), brancas
  const bw = S * 0.13, gap = S * 0.07, baseY = S * 0.72;
  const heights = [0.20, 0.32, 0.44];
  const totalW = bw * 3 + gap * 2;
  let x = (S - totalW) / 2;
  heights.forEach((h) => {
    fillRoundRect(x, baseY - S * h, x + bw, baseY, Math.min(bw, S * h) / 2.2, WHITE);
    x += bw + gap;
  });
  return encodePNG(S, buf);
}

for (const s of [16, 32, 48, 128]) {
  writeFileSync(new URL(`./icon${s}.png`, import.meta.url), make(s));
  console.log(`icon${s}.png gerado`);
}
