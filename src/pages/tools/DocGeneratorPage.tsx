/* ═══════════════════════════════════════════════════════════
   DocGeneratorPage — gerador genérico de documentos numéricos
   (CPF, CNPJ, RG). Config-driven para evitar duplicação.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { CopyButton } from '../../components/tools/CopyButton';
import type { ToolKey } from '../../components/Sidebar';
import type { ReactNode } from 'react';

export interface DocGeneratorConfig {
  activeTool: ToolKey;
  title: string;
  subtitle?: string;
  heading: string;
  description: string;
  help: ReactNode;
  /** rótulo no singular, ex.: "CPF" */
  unit: string;
  gerar: () => string;
  formatar: (valor: string, comMascara: boolean) => string;
}

export function DocGeneratorPage({ config }: { config: DocGeneratorConfig }) {
  const [quantidade, setQuantidade] = useState(1);
  const [comMascara, setComMascara] = useState(true);
  const [resultados, setResultados] = useState<string[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());

  const gerar = () => {
    const lista: string[] = [];
    for (let i = 0; i < quantidade; i++) lista.push(config.formatar(config.gerar(), comMascara));
    setResultados(lista);
    setCopiados(new Set());
  };

  // Gera um valor inicial automaticamente ao abrir / trocar de ferramenta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { gerar(); }, [config.activeTool]);

  return (
    <ToolLayout title={config.title} subtitle={config.subtitle} activeTool={config.activeTool} help={config.help}>
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>{config.heading}</h2>
            <p>{config.description}</p>
          </div>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-section-head">
          <span>Configurações</span>
        </div>
        <div className="cnpj-filters cnpj-filters--two">
          <div className="filter-field">
            <label>Quantidade</label>
            <select className="col-filter" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
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
          <button className="btn btn-primary btn-sm casos-new-btn cnpj-primary-action" onClick={gerar}>Gerar {config.unit}</button>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-section-head">
          <span>Resultados</span>
          <span className="tool-section-hint">{resultados.length} item(ns)</span>
        </div>
        <div className="tool-results">
          {resultados.length === 0 ? (
            <p className="tool-empty">Nenhum {config.unit} gerado ainda.</p>
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
