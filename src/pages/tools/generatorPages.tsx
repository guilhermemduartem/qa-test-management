/* ═══════════════════════════════════════════════════════════
   generatorPages — configurações das páginas de geradores
   (CPF, CNPJ, RG) que reutilizam DocGeneratorPage.
   ═══════════════════════════════════════════════════════════ */
import { DocGeneratorPage } from './DocGeneratorPage';
import {
  gerarCPF, formatarCPF,
  gerarRG, formatarRG,
  gerarCNPJ, formatarCNPJ,
} from '../../lib/generators';
import { useEffect, useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { CopyButton } from '../../components/tools/CopyButton';

export const GeradorCpfPage = () => (
  <DocGeneratorPage
    config={{
      activeTool: 'cpf',
      title: 'Gerador de CPF',
      heading: 'CPF válido para testes',
      description: 'Gere CPFs válidos com dígito verificador correto.',
      help: (
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Defina a quantidade de CPFs que deseja gerar.</li>
            <li>Escolha se quer aplicar máscara no resultado.</li>
            <li>Clique em gerar para obter CPFs válidos para testes.</li>
          </ul>
        </>
      ),
      unit: 'CPF',
      gerar: gerarCPF,
      formatar: formatarCPF,
    }}
  />
);

export const GeradorCnpjPage = () => (
  <GeradorCnpjAlfanumericoPage />
);

function GeradorCnpjAlfanumericoPage() {
  const [quantidade, setQuantidade] = useState(1);
  const [comMascara, setComMascara] = useState(true);
  const [alfanumerico, setAlfanumerico] = useState(false);
  const [resultados, setResultados] = useState<string[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());

  const gerar = () => {
    const lista: string[] = [];
    for (let i = 0; i < quantidade; i++) lista.push(formatarCNPJ(gerarCNPJ(alfanumerico), comMascara));
    setResultados(lista);
    setCopiados(new Set());
  };

  // Gera um valor inicial automaticamente ao abrir / trocar o modo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { gerar(); }, [alfanumerico]);

  return (
    <ToolLayout
      title="Gerador de CNPJ"
      subtitle=""
      activeTool="cnpj"
      help={
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Escolha se o CNPJ será com letras ou no formato tradicional.</li>
            <li>Defina a quantidade e se quer aplicar máscara.</li>
            <li>Clique em gerar para obter CNPJs válidos com dígito verificador correto.</li>
          </ul>
        </>
      }
    >
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>CNPJ numérico e alfanumérico</h2>
            <p>Gere CNPJs válidos com ou sem letras, com dígito verificador correto.</p>
          </div>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-section-head">
          <span>Configurações</span>
        </div>
        <div className="cnpj-filters">
          <div className="filter-field">
            <label>Quantidade</label>
            <select className="col-filter" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label>Tipo de CNPJ</label>
            <select className="col-filter" value={alfanumerico ? '1' : '0'} onChange={(e) => setAlfanumerico(e.target.value === '1')}>
              <option value="0">Sem letras</option>
              <option value="1">Com letras</option>
            </select>
          </div>
          <div className="filter-field">
            <label>Formato</label>
            <select className="col-filter" value={comMascara ? '1' : '0'} onChange={(e) => setComMascara(e.target.value === '1')}>
              <option value="1">Com máscara</option>
              <option value="0">Sem máscara</option>
            </select>
          </div>
        </div>
        <div className="cnpj-actions">
          <button className="btn btn-primary btn-sm casos-new-btn cnpj-primary-action" onClick={gerar}>Gerar CNPJ</button>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-section-head">
          <span>Resultados</span>
          <span className="tool-section-hint">{resultados.length} item(ns)</span>
        </div>
        <div className="tool-results">
          {resultados.length === 0 ? (
            <p className="tool-empty">Nenhum CNPJ gerado ainda.</p>
          ) : (
            resultados.map((valor, i) => (
              <div className={`tool-result-row${copiados.has(`${valor}-${i}`) ? ' is-copied' : ''}`} key={`${valor}-${i}`}>
                <span className="tool-result-value">{valor}</span>
                <div className="tool-result-actions">
                  <span className="tool-result-index">#{i + 1}</span>
                  <CopyButton
                    value={valor}
                    className="btn btn-ghost btn-xs cnpj-copy-btn"
                    onCopied={() => setCopiados((prev) => {
                      const next = new Set(prev);
                      next.add(`${valor}-${i}`);
                      return next;
                    })}
                    persistent
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ToolLayout>
  );
}

export const GeradorRgPage = () => (
  <DocGeneratorPage
    config={{
      activeTool: 'rg',
      title: 'Gerador de RG',
      heading: 'RG válido para testes',
      description: 'Gere RGs válidos com dígito verificador correto.',
      help: (
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Defina a quantidade de RGs que deseja gerar.</li>
            <li>Escolha se quer aplicar máscara no resultado.</li>
            <li>Clique em gerar para obter RGs válidos para testes.</li>
          </ul>
        </>
      ),
      unit: 'RG',
      gerar: gerarRG,
      formatar: formatarRG,
    }}
  />
);
