/* ═══════════════════════════════════════════════════════════
   generators.ts — Geradores de dados de teste (CPF, CNPJ, RG,
   Cartão de Crédito). Portado de ttt/index.html (Orion).
   Funções puras, sem dependência de DOM — testáveis e isoladas.
   ═══════════════════════════════════════════════════════════ */

/* ── CPF ── */
export function gerarCPF(): string {
  const digitos: number[] = [];
  for (let i = 0; i < 9; i++) digitos.push(Math.floor(Math.random() * 10));

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += digitos[i] * (10 - i);
  let resto = soma % 11;
  digitos.push(resto < 2 ? 0 : 11 - resto);

  soma = 0;
  for (let i = 0; i < 10; i++) soma += digitos[i] * (11 - i);
  resto = soma % 11;
  digitos.push(resto < 2 ? 0 : 11 - resto);

  return digitos.join('');
}

export function formatarCPF(cpf: string, comMascara: boolean): string {
  return comMascara ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf;
}

/* ── CNPJ ── */
function randomCnpjChar(): string {
  const pool = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return pool[Math.floor(Math.random() * pool.length)];
}

function cnpjCharValue(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return code - 48;
  if (code >= 97 && code <= 122) return ch.toUpperCase().charCodeAt(0) - 48;
  return 0;
}

function calcularDvCnpj(base: string): string {
  let soma = 0;
  let peso = 5;
  for (let i = 0; i < base.length; i++) {
    soma += cnpjCharValue(base[i]) * peso;
    peso = peso === 2 ? 9 : peso - 1;
  }
  let resto = soma % 11;
  let dv1 = resto < 2 ? 0 : 11 - resto;

  soma = 0;
  peso = 6;
  const fullBase = base + String(dv1);
  for (let i = 0; i < fullBase.length; i++) {
    soma += cnpjCharValue(fullBase[i]) * peso;
    peso = peso === 2 ? 9 : peso - 1;
  }
  resto = soma % 11;
  const dv2 = resto < 2 ? 0 : 11 - resto;
  return `${dv1}${dv2}`;
}

export function gerarCNPJ(alfanumerico = false): string {
  const base = alfanumerico
    ? Array.from({ length: 12 }, () => randomCnpjChar()).join('')
    : Array.from({ length: 12 }, () => String(Math.floor(Math.random() * 10))).join('');
  return base + calcularDvCnpj(base);
}

export function formatarCNPJ(cnpj: string, comMascara: boolean): string {
  if (!comMascara) return cnpj;
  const clean = String(cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

/* ── RG ── */
export function gerarRG(): string {
  let rg = '';
  for (let i = 0; i < 8; i++) rg += Math.floor(Math.random() * 10);

  let soma = 0;
  let peso = 2;
  for (let i = 0; i < 8; i++) {
    soma += parseInt(rg[i], 10) * peso;
    peso++;
  }
  const resto = soma % 11;
  let digito: number | string = resto === 0 ? 0 : 11 - resto;
  if (digito === 10) digito = 'X';

  return rg + digito;
}

export function formatarRG(rg: string, comMascara: boolean): string {
  return comMascara ? rg.replace(/(\d{2})(\d{3})(\d{3})(\w{1})/, '$1.$2.$3-$4') : rg;
}

/* ── Cartão de Crédito ── */
export type Bandeira = 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard' | 'discover';

export const BANDEIRAS: { value: Bandeira; label: string }[] = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'American Express' },
  { value: 'elo', label: 'Elo' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'discover', label: 'Discover' },
];

export function gerarNumeroCartao(bandeira: Bandeira = 'visa'): string {
  let numero = '';
  let comprimento = 16;

  switch (bandeira) {
    case 'visa':
      numero = '4';
      break;
    case 'mastercard':
      numero = '5' + (Math.floor(Math.random() * 5) + 1);
      break;
    case 'amex':
      numero = '3' + (Math.floor(Math.random() * 2) + 4);
      comprimento = 15;
      break;
    case 'elo':
      numero = '6' + (Math.floor(Math.random() * 3) + 3);
      break;
    case 'hipercard':
    case 'discover':
      numero = '6' + (Math.floor(Math.random() * 2) + 0);
      break;
    default:
      numero = '4';
  }

  const digitosRestantes = comprimento - numero.length - 1;
  for (let i = 0; i < digitosRestantes; i++) numero += Math.floor(Math.random() * 10);

  // Dígito verificador via algoritmo de Luhn.
  let soma = 0;
  let duplicar = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let digito = parseInt(numero[i], 10);
    if (duplicar) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    soma += digito;
    duplicar = !duplicar;
  }
  const digitoVerificador = (10 - (soma % 10)) % 10;
  return numero + digitoVerificador;
}

export function gerarDataValidade(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear() + Math.floor(Math.random() * 10) + 1;
  const mes = Math.floor(Math.random() * 12) + 1;
  return `${mes.toString().padStart(2, '0')}/${ano.toString().slice(-2)}`;
}

export function gerarCVV(bandeira: Bandeira = 'visa'): string {
  return bandeira === 'amex'
    ? String(Math.floor(Math.random() * 9000) + 1000)
    : String(Math.floor(Math.random() * 900) + 100);
}

export function formatarNumeroCartao(numero: string, comMascara: boolean, bandeira: Bandeira = 'visa'): string {
  if (!comMascara) return numero;
  return bandeira === 'amex'
    ? numero.replace(/(\d{4})(\d{6})(\d{5})/, '$1 $2 $3')
    : numero.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4');
}

/* ── Email ── */
const NOMES_EMAIL = [
  'ana','bruno','carlos','diana','edu','fernanda','gabriel','helena','igor','julia',
  'lucas','mariana','nicolas','olivia','pedro','rafaela','sergio','tatiana','vitor','yasmin',
  'joao','beatriz','rafael','camila','thiago','larissa','matheus','leticia','rodrigo','amanda',
  'zeus','hermes','apollo','artemis','athena','poseidon','ares','hera','nike','iris',
  'daphne','atlas','titan','phoenix','kronos','helios','selene','eros','tyche','nyx',
  'zezinho','binho','dudinha','teteu','xuxu','fofo','pipoca','cebola','batata','churros',
  'fofinho','chapolin','ninja','pirata','vampiro','lobisomem','monstrao','maromba',
  'bolinha','gatinho','amendoim','biscoito','mingau','doido','maluco','turbo','flashzin',
];
const DOMINIOS_EMAIL = ['gmail.com','hotmail.com','yahoo.com.br','outlook.com','icloud.com','teste.com.br'];
export function gerarEmail(): string {
  const pick = () => NOMES_EMAIL[Math.floor(Math.random() * NOMES_EMAIL.length)];
  const n = Math.floor(Math.random() * 9999) + 1;
  return `${pick()}.${pick()}${n}@${DOMINIOS_EMAIL[Math.floor(Math.random() * DOMINIOS_EMAIL.length)]}`;
}

/* ── UUID ── */
export function gerarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* ── Lorem Ipsum ── */
const LOREM_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');
export function gerarLorem(n: number): string {
  const words = Array.from({ length: n }, (_, i) => LOREM_WORDS[i % LOREM_WORDS.length]);
  const t = words.join(' ');
  return t.charAt(0).toUpperCase() + t.slice(1) + '.';
}

/* ── Endereço BR ── */
export type EnderecoBR = { rua: string; bairro: string; cidade: string; estado: string; cep: string };
const ENDERECOS_BR: EnderecoBR[] = [
  { rua: 'Avenida Paulista',               bairro: 'Bela Vista',        cidade: 'São Paulo',      estado: 'SP', cep: '01310-100' },
  { rua: 'Rua Augusta',                    bairro: 'Consolação',        cidade: 'São Paulo',      estado: 'SP', cep: '01305-100' },
  { rua: 'Rua Oscar Freire',               bairro: 'Cerqueira César',   cidade: 'São Paulo',      estado: 'SP', cep: '01426-001' },
  { rua: 'Avenida Brigadeiro Faria Lima',  bairro: 'Jardim Paulistano', cidade: 'São Paulo',      estado: 'SP', cep: '01452-001' },
  { rua: 'Rua Haddock Lobo',               bairro: 'Cerqueira César',   cidade: 'São Paulo',      estado: 'SP', cep: '01414-001' },
  { rua: 'Avenida Atlântica',              bairro: 'Copacabana',        cidade: 'Rio de Janeiro', estado: 'RJ', cep: '22021-001' },
  { rua: 'Rua Visconde de Pirajá',         bairro: 'Ipanema',           cidade: 'Rio de Janeiro', estado: 'RJ', cep: '22410-003' },
  { rua: 'Rua Barata Ribeiro',             bairro: 'Copacabana',        cidade: 'Rio de Janeiro', estado: 'RJ', cep: '22011-002' },
  { rua: 'Rua do Ouvidor',                 bairro: 'Centro',            cidade: 'Rio de Janeiro', estado: 'RJ', cep: '20040-030' },
  { rua: 'Avenida Afonso Pena',            bairro: 'Cruzeiro',          cidade: 'Belo Horizonte', estado: 'MG', cep: '30130-009' },
  { rua: 'Rua da Bahia',                   bairro: 'Centro',            cidade: 'Belo Horizonte', estado: 'MG', cep: '30160-010' },
  { rua: 'Avenida do Contorno',            bairro: 'Santa Efigênia',    cidade: 'Belo Horizonte', estado: 'MG', cep: '30110-017' },
  { rua: 'Travessa Frei Caneca',           bairro: 'Centro',            cidade: 'Curitiba',       estado: 'PR', cep: '80010-090' },
  { rua: 'Avenida do Batel',               bairro: 'Batel',             cidade: 'Curitiba',       estado: 'PR', cep: '80420-090' },
  { rua: 'Rua Marechal Deodoro',           bairro: 'Centro',            cidade: 'Curitiba',       estado: 'PR', cep: '80010-010' },
  { rua: 'Rua dos Andradas',               bairro: 'Centro Histórico',  cidade: 'Porto Alegre',   estado: 'RS', cep: '90020-005' },
  { rua: 'Avenida Borges de Medeiros',     bairro: 'Centro Histórico',  cidade: 'Porto Alegre',   estado: 'RS', cep: '90020-021' },
  { rua: 'Rua Padre Chagas',               bairro: 'Moinhos de Vento',  cidade: 'Porto Alegre',   estado: 'RS', cep: '90570-080' },
  { rua: 'Rua Chile',                      bairro: 'Centro Histórico',  cidade: 'Salvador',       estado: 'BA', cep: '40026-032' },
  { rua: 'Avenida Estados Unidos',         bairro: 'Comércio',          cidade: 'Salvador',       estado: 'BA', cep: '40010-020' },
  { rua: 'Avenida Beira Mar',              bairro: 'Mucuripe',          cidade: 'Fortaleza',      estado: 'CE', cep: '60165-121' },
  { rua: 'Rua Tibúrcio Cavalcanti',        bairro: 'Meireles',          cidade: 'Fortaleza',      estado: 'CE', cep: '60125-100' },
  { rua: 'Quadra SQN 206 Bloco E',         bairro: 'Asa Norte',         cidade: 'Brasília',       estado: 'DF', cep: '70844-050' },
  { rua: 'Quadra SQS 108',                 bairro: 'Asa Sul',           cidade: 'Brasília',       estado: 'DF', cep: '70347-000' },
  { rua: 'Avenida Eduardo Ribeiro',        bairro: 'Centro',            cidade: 'Manaus',         estado: 'AM', cep: '69010-001' },
  { rua: 'Rua Japurá',                     bairro: 'Centro',            cidade: 'Manaus',         estado: 'AM', cep: '69025-020' },
  { rua: 'Avenida Boa Viagem',             bairro: 'Pina',              cidade: 'Recife',         estado: 'PE', cep: '51011-000' },
  { rua: 'Rua do Bom Jesus',               bairro: 'Recife',            cidade: 'Recife',         estado: 'PE', cep: '50030-170' },
];
export function gerarEnderecoBR(): EnderecoBR {
  const t = ENDERECOS_BR[Math.floor(Math.random() * ENDERECOS_BR.length)];
  const num = Math.floor(Math.random() * 2000) + 1;
  const compl = Math.random() > 0.65 ? `, Apto ${Math.floor(Math.random() * 200) + 1}` : '';
  return { rua: `${t.rua}, ${num}${compl}`, bairro: t.bairro, cidade: t.cidade, estado: t.estado, cep: t.cep };
}

/* ── Passaporte ── */
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rndLetra = () => LETRAS[Math.floor(Math.random() * LETRAS.length)];
const rndDigitos = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/**
 * Passaporte brasileiro: 2 letras maiúsculas + 6 dígitos (padrão atual desde 2010).
 * Exemplo: FT123456
 */
export function gerarPassaporteBR(): string {
  return `${rndLetra()}${rndLetra()}${rndDigitos(6)}`;
}

/**
 * Passaporte internacional (padrão ICAO 9303 simplificado): 2 letras + 7 dígitos (9 chars).
 * Formato adotado por vários países (EUA, Europa, etc.).
 * Exemplo: KP4782391
 */
export function gerarPassaporteInternacional(): string {
  return `${rndLetra()}${rndLetra()}${rndDigitos(7)}`;
}
