/* ═══════════════════════════════════════════════════════════
   GeradorCartaoPage — gera números de cartão de crédito válidos
   (Luhn) por bandeira, com CVV e validade. Para uso em testes.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { CopyButton } from '../../components/tools/CopyButton';
import {
  BANDEIRAS, type Bandeira,
  gerarNumeroCartao, gerarCVV, gerarDataValidade, formatarNumeroCartao,
} from '../../lib/generators';

interface Cartao {
  numero: string;
  cvv: string;
  validade: string;
  bandeira: Bandeira;
}

export function GeradorCartaoPage() {
  const [quantidade, setQuantidade] = useState(1);
  const [bandeira, setBandeira] = useState<Bandeira>('visa');
  const [comMascara, setComMascara] = useState(true);
  const [resultados, setResultados] = useState<Cartao[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());

  const gerar = () => {
    const lista: Cartao[] = [];
    for (let i = 0; i < quantidade; i++) {
      const numero = gerarNumeroCartao(bandeira);
      lista.push({
        numero: formatarNumeroCartao(numero, comMascara, bandeira),
        cvv: gerarCVV(bandeira),
        validade: gerarDataValidade(),
        bandeira,
      });
    }
    setResultados(lista);
    setCopiados(new Set());
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { gerar(); }, []);

  const label = BANDEIRAS.find((b) => b.value === bandeira)?.label ?? bandeira;

  return (
    <ToolLayout
      title="Gerador de Cartão de Crédito"
      activeTool="cartao"
      help={
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Escolha a bandeira do cartão.</li>
            <li>Defina a quantidade e se quer aplicar máscara.</li>
            <li>Clique em gerar para obter cartões válidos pelo algoritmo de Luhn.</li>
          </ul>
        </>
      }
    >
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>Cartão válido para testes</h2>
            <p>Gere cartões válidos por bandeira, com CVV e data de validade.</p>
          </div>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-section-head">
          <span>Configurações</span>
        </div>
        <div className="cnpj-filters">
          <div className="filter-field">
            <label>Bandeira</label>
            <select className="col-filter" value={bandeira} onChange={(e) => setBandeira(e.target.value as Bandeira)}>
              {BANDEIRAS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>
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
          <button className="btn btn-primary btn-sm casos-new-btn cnpj-primary-action" onClick={gerar}>Gerar cartão</button>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-section-head">
          <span>Resultados</span>
          <span className="tool-section-hint">{resultados.length} item(ns)</span>
        </div>
        <div className="tool-results">
          {resultados.length === 0 ? (
            <p className="tool-empty">Nenhum cartão gerado ainda.</p>
          ) : (
            resultados.map((c, i) => (
              <div className={`tool-result-row tool-result-card${copiados.has(`${c.numero}-${i}`) ? ' is-copied' : ''}`} key={`${c.numero}-${i}`}>
                <div className="tool-card-fields">
                  <span className="tool-result-value">{c.numero}</span>
                  <span className="tool-card-meta">
                    {label} · CVV {c.cvv} · Val. {c.validade}
                  </span>
                </div>
                <div className="tool-result-actions">
                  <span className="tool-result-index">#{i + 1}</span>
                  <CopyButton
                    value={c.numero}
                    label="Copiar nº"
                    className="btn btn-ghost btn-xs cnpj-copy-btn"
                    onCopied={() => setCopiados((prev) => {
                      const next = new Set(prev);
                      next.add(`${c.numero}-${i}`);
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
