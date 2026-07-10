/* ═══════════════════════════════════════════════════════════
   toolUtils.ts — helpers das Ferramentas (Orion):
   FileID formatter, download, base64 e consulta de endereço EUA.
   ═══════════════════════════════════════════════════════════ */

/* ── FileID Formatter ── */
export function extractNumbersPreserveOrder(text: string): number[] {
  const matches = text.match(/\d+/g) || [];
  const seen = new Set<number>();
  const list: number[] = [];
  for (const m of matches) {
    const n = Number(m);
    if (!seen.has(n)) {
      seen.add(n);
      list.push(n);
    }
  }
  return list;
}

export function formatFileIds(nums: number[]): string {
  if (!nums || nums.length === 0) return '[]';
  const lines = nums.map((n, i) => `  {"FileExternalId":${n}}${i < nums.length - 1 ? ',' : ''}`);
  return '[\n' + lines.join('\n') + '\n]';
}

/* ── Download / nome de arquivo com timestamp ── */
export function timestampFilename(prefix: string, ext: string): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${prefix}${dd}${mm}${yyyy}${hh}${min}${ss}.${ext}`;
}

export function downloadText(filename: string, content: string, mime = 'application/json;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── OFX → Base64 ── */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/* ── Consulta de Endereço EUA ── */
export interface EnderecoEUA {
  zipCode: string;
  country: string;
  countryAbbr: string;
  placeName: string;
  state: string;
  stateAbbr: string;
  latitude: string;
  longitude: string;
  neighbourhood: string;
  road: string;
  suburb: string;
  city: string;
  county: string;
  displayName: string;
}

export type ConsultaEnderecoResult =
  | { success: true; data: EnderecoEUA }
  | { success: false; error: string };

export async function consultarEnderecoEUA(zipCode: string): Promise<ConsultaEnderecoResult> {
  try {
    const zipLimpo = zipCode.replace(/\D/g, '');
    if (!zipLimpo || zipLimpo.length < 5) {
      throw new Error('ZIP Code inválido. Digite um código postal válido dos EUA.');
    }

    const zipResponse = await fetch(`https://api.zippopotam.us/us/${zipLimpo}`);
    if (!zipResponse.ok) {
      throw new Error('ZIP Code não encontrado. Verifique o código e tente novamente.');
    }
    const zipData = await zipResponse.json();
    const place = zipData.places[0];
    const { latitude, longitude } = place;

    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: { 'User-Agent': 'OrionSystem/1.0' } },
    );
    if (!geoResponse.ok) {
      throw new Error('Erro ao consultar dados de geolocalização.');
    }
    const geoData = await geoResponse.json();
    const addr = geoData.address || {};

    return {
      success: true,
      data: {
        zipCode: zipData['post code'],
        country: zipData.country,
        countryAbbr: zipData['country abbreviation'],
        placeName: place['place name'],
        state: place.state,
        stateAbbr: place['state abbreviation'],
        latitude,
        longitude,
        neighbourhood: addr.neighbourhood || 'N/A',
        road: addr.road || 'N/A',
        suburb: addr.suburb || 'N/A',
        city: addr.city || addr.town || place['place name'],
        county: addr.county || 'N/A',
        displayName: geoData.display_name,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' };
  }
}
