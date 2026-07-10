/* ═══════════════════════════════════════════════════════════
   cnabParser.ts — Parser de arquivos CNAB/NF-e (Layout RPS V4.0).
   Portado de ttt/index.html (Orion). Lógica pura, sem DOM.
   Cada linha é identificada pelo primeiro caractere (tipo de
   registro) e os campos são extraídos por posição fixa.
   ═══════════════════════════════════════════════════════════ */

export type SectionVariant = 'primary' | 'accent';

export interface NfSection {
  titulo: string;
  variant: SectionVariant;
  campos: [string, string][];
}

export interface CnabResult {
  sections: NfSection[];
  totalServico: number;
  totalRetencao: number;
  contadorNF: number;
  tiposFaltando: string[];
}

export function formatarMoeda(valor: number): string {
  if (!valor) return 'R$ 0,00';
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

const trim = (s: string) => s.trim();
const campo = (linha: string, ini: number, fim: number) => trim(linha.slice(ini, fim)) || '-';

/* Registro Tipo 4 (Detalhe) — Layout Arquivo Texto RPS V4.0 (1-based → 0-based). */
function parseTipo4(line: string): [string, string][] {
  const l = line.replace(/\r?\n/g, '');
  return [
    ['Tipo do Registro', trim(l.substring(0, 1)) || '-'],
    ['Enquadramento Simples', trim(l.substring(1, 2)) || '-'],
    ['Regime Apuração Simples', trim(l.substring(2, 3)) || '-'],
    ['Código País Prestação', trim(l.substring(3, 6)) || '-'],
    ['Código Cidade Prestação', trim(l.substring(6, 13)) || '-'],
    ['Código Cidade Tomador', trim(l.substring(13, 20)) || '-'],
    ['NIF Tomador Estrangeiro', trim(l.substring(20, 60)) || '-'],
    ['Código NBS', trim(l.substring(60, 69)) || '-'],
    ['CEP Tomador Exterior', trim(l.substring(69, 80)) || '-'],
    ['Estado Tomador Exterior', trim(l.substring(80, 140)) || '-'],
    ['Vínculo Partes', trim(l.substring(140, 141)) || '-'],
    ['Reservado', trim(l.substring(141, 171)) || '-'],
    ['CEP Serviço Exterior', trim(l.substring(171, 182)) || '-'],
    ['Estado Serviço Exterior', trim(l.substring(182, 242)) || '-'],
    ['Nome Evento', trim(l.substring(242, 497)) || '-'],
    ['Data Início Evento', trim(l.substring(497, 505)) || '-'],
    ['Data Fim Evento', trim(l.substring(505, 513)) || '-'],
    ['Justificativa Substituição', trim(l.substring(513, 514)) || '-'],
    ['Indicador Operação', trim(l.substring(514, 520)) || '-'],
    ['Classificação Tributária IBS/CBS', trim(l.substring(520, 526)) || '-'],
    ['Situação Tributária IBS/CBS', trim(l.substring(526, 529)) || '-'],
    ['Uso Consumo Pessoal', trim(l.substring(529, 530)) || '-'],
    ['Indicador Destinatário', trim(l.substring(530, 531)) || '-'],
  ];
}

/** Faz o parse do conteúdo completo do arquivo CNAB/NF-e. */
export function parseCnab(texto: string): CnabResult {
  const linhas = texto.split('\n').filter((l) => l.trim());
  const sections: NfSection[] = [];
  let totalServico = 0;
  let totalRetencao = 0;
  let contadorNF = 0;

  for (const linha of linhas) {
    if (!linha) continue;

    if (linha.startsWith('1')) {
      sections.push({
        titulo: '📋 Cabeçalho',
        variant: 'primary',
        campos: [
          ['Tipo do Registro', campo(linha, 0, 1)],
          ['Inscrição do Contribuinte', campo(linha, 1, 8)],
          ['Versão do Lay-Out', campo(linha, 8, 14)],
          ['Identificação da Remessa', campo(linha, 14, 25)],
        ],
      });
    } else if (linha.startsWith('2')) {
      contadorNF++;
      sections.push({
        titulo: `🧾 Nota Fiscal ${String(contadorNF).padStart(3, '0')}`,
        variant: 'primary',
        campos: [
          ['Tipo do Registro', campo(linha, 0, 1)],
          ['Tipo do RPS', campo(linha, 1, 6)],
          ['Série do RPS', campo(linha, 6, 10)],
          ['Série da NF-e', campo(linha, 10, 15)],
          ['Número do RPS', campo(linha, 15, 25)],
          ['Data do RPS', campo(linha, 25, 33)],
          ['Hora do RPS', campo(linha, 33, 39)],
          ['Situação do RPS', campo(linha, 39, 40)],
          ['Código de Motivo de Cancelamento', campo(linha, 40, 42)],
          ['Número da NF-e a ser cancelada/substituída', campo(linha, 42, 49)],
          ['Série da NF-e a ser cancelada/substituída', campo(linha, 49, 54)],
          ['Data de emissão da NF-e a ser cancelada/substituída', campo(linha, 54, 62)],
          ['Descrição do Cancelamento', campo(linha, 62, 242)],
          ['Código do Serviço Prestado', campo(linha, 242, 251)],
          ['Local da Prestação do Serviço', campo(linha, 251, 252)],
          ['Serviço Prestado em Vias Públicas', campo(linha, 252, 253)],
          ['Endereço Logradouro do Serviço Prestado', campo(linha, 253, 328)],
          ['Número Logradouro do Serviço Prestado', campo(linha, 328, 337)],
          ['Complemento Logradouro do Serviço Prestado', campo(linha, 337, 367)],
          ['Bairro Logradouro do Serviço Prestado', campo(linha, 367, 407)],
          ['Cidade Logradouro do Serviço Prestado', campo(linha, 407, 447)],
          ['UF Logradouro do Serviço Prestado', campo(linha, 447, 449)],
          ['CEP Logradouro do Serviço Prestado', campo(linha, 449, 457)],
          ['Quantidade de Serviço', campo(linha, 457, 463)],
          ['Valor do Serviço', campo(linha, 463, 478)],
          ['Reservado', campo(linha, 478, 483)],
          ['Valor Total das Retenções', campo(linha, 483, 498)],
          ['Tomador Estrangeiro', campo(linha, 498, 499)],
          ['País da Nacionalidade do Tomador Estrangeiro', campo(linha, 499, 502)],
          ['Serviço Prestado é Exportação', campo(linha, 502, 503)],
          ['Indicador do CPF/CNPJ do Tomador', campo(linha, 503, 504)],
          ['CPF/CNPJ do Tomador', campo(linha, 504, 518)],
          ['Razão Social / Nome do Tomador', campo(linha, 518, 578)],
          ['Endereço Logradouro Tomador', campo(linha, 578, 653)],
          ['Número Logradouro Tomador', campo(linha, 653, 662)],
          ['Complemento Logradouro Tomador', campo(linha, 662, 692)],
          ['Bairro Logradouro Tomador', campo(linha, 692, 732)],
          ['Cidade Logradouro Tomador', campo(linha, 732, 772)],
          ['UF Logradouro Tomador', campo(linha, 772, 774)],
          ['CEP Logradouro Tomador', campo(linha, 774, 782)],
          ['E-mail Tomador', campo(linha, 782, 934)],
          ['Fatura', campo(linha, 934, 940)],
          ['Valor Fatura', campo(linha, 940, 955)],
          ['Forma de Pagamento', campo(linha, 955, 970)],
          ['Discriminação do Serviço', campo(linha, 970, 1970)],
        ],
      });
      // O valor é expresso em centavos (15 posições) → divide por 100.
      const valorServico = parseInt(linha.substring(463, 478).trim() || '0', 10) / 100;
      totalServico += Number.isNaN(valorServico) ? 0 : valorServico;
    } else if (linha.startsWith('3')) {
      sections.push({
        titulo: `💰 Retenção (Nota Fiscal ${String(contadorNF).padStart(3, '0')})`,
        variant: 'accent',
        campos: [
          ['Tipo do Registro', campo(linha, 0, 1)],
          ['Código de Outros Valores', campo(linha, 1, 3)],
          ['Valor', campo(linha, 3, 18)],
        ],
      });
      const valorRetencao = parseInt(linha.substring(3, 18).trim() || '0', 10) / 100;
      totalRetencao += Number.isNaN(valorRetencao) ? 0 : valorRetencao;
    } else if (linha.startsWith('4')) {
      sections.push({
        titulo: `📝 Detalhe (Nota Fiscal ${String(contadorNF).padStart(3, '0')})`,
        variant: 'accent',
        campos: parseTipo4(linha),
      });
    } else if (linha.startsWith('9')) {
      sections.push({
        titulo: '📄 Rodapé',
        variant: 'primary',
        campos: [
          ['Tipo do Registro', campo(linha, 0, 1)],
          ['Número Total de Linhas', campo(linha, 1, 8)],
          ['Valor Total dos Serviços', campo(linha, 8, 23)],
          ['Valor Total das Retenções', campo(linha, 23, 38)],
        ],
      });
    }
  }

  const tiposEncontrados = new Set<string>();
  for (const linha of linhas) {
    if (linha.startsWith('1')) tiposEncontrados.add('Cabeçalho');
    if (linha.startsWith('2')) tiposEncontrados.add('Nota Fiscal');
    if (linha.startsWith('3')) tiposEncontrados.add('Retenção');
    if (linha.startsWith('4')) tiposEncontrados.add('Detalhe (Tipo 4)');
    if (linha.startsWith('9')) tiposEncontrados.add('Rodapé');
  }
  const tiposEsperados = ['Cabeçalho', 'Nota Fiscal', 'Retenção', 'Rodapé'];
  const tiposFaltando = tiposEsperados.filter((t) => !tiposEncontrados.has(t));

  return { sections, totalServico, totalRetencao, contadorNF, tiposFaltando };
}
