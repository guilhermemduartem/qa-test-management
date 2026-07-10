/* ═══════════════════════════════════════════════════════════
   ValidadorNfPage — valida/processa arquivos CNAB/NF-e (.txt),
   exibindo os registros por tipo, painel de totais e resumo.
   ═══════════════════════════════════════════════════════════ */
import { useRef, useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { parseCnab, formatarMoeda, type CnabResult } from '../../lib/cnabParser';
import { showToast } from '../../lib/toast';

export function ValidadorNfPage() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<CnabResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processar = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        setResult(parseCnab(String(e.target?.result ?? '')));
      } catch {
        showToast('Falha ao processar o arquivo.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const refazer = () => {
    setFileName('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <ToolLayout
      title="Validador de NF"
      subtitle="Selecione um arquivo CNAB/NF-e (.txt) para validar e visualizar os registros por tipo."
      activeTool="validador-nf"
      help={
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Selecione um arquivo CNAB/NF-e (.txt).</li>
            <li>A validação mostra os registros por tipo e os totais do arquivo.</li>
            <li>Use o botão Refazer para carregar outro arquivo.</li>
          </ul>
        </>
      }
    >
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>Validador de CNAB / NF-e</h2>
            <p>Selecione um arquivo CNAB/NF-e (.txt) para validar e visualizar os registros por tipo.</p>
          </div>
        </div>
      </div>

      {/* Painel de totais */}
      {result && (
        <div className="tool-card" style={{ marginBottom: 16 }}>
          <div className="nf-info-grid">
            <div className="nf-info-item">
              <span className="nf-info-label">Valor Total do Serviço</span>
              <span className="nf-info-value">{formatarMoeda(result.totalServico)}</span>
            </div>
            <div className="nf-info-item">
              <span className="nf-info-label">Valor Retido</span>
              <span className="nf-info-value">{formatarMoeda(result.totalRetencao)}</span>
            </div>
            <div className="nf-info-item">
              <span className="nf-info-label">Quantidade de NFs</span>
              <span className="nf-info-value">{result.contadorNF}</span>
            </div>
          </div>
        </div>
      )}

      <div className="tool-card">
        <div className="tool-actions tool-actions-center">
          <label className="btn btn-primary btn-sm cnpj-primary-action cnpj-file-button">
            {fileName ? fileName : 'Selecionar arquivo (.txt)'}
            <input
              ref={inputRef}
              type="file"
              accept=".txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processar(f);
              }}
            />
          </label>
          {result && <button className="btn btn-ghost btn-sm" onClick={refazer}>Refazer</button>}
        </div>

        {result && (
          <div className="nf-output">
            {result.tiposFaltando.length > 0 && (
              <div className="nf-warning">
                <strong>⚠️ Tipos de registro não encontrados:</strong>
                <ul>{result.tiposFaltando.map((t) => <li key={t}>{t}</li>)}</ul>
                <span className="nf-warning-note">
                  Isso pode ser normal se o arquivo não contiver todos os tipos de registro.
                </span>
              </div>
            )}

            {result.sections.map((sec, i) => (
              <div className="nf-section" key={`${sec.titulo}-${i}`}>
                <div className={`nf-section-header is-${sec.variant}`}>{sec.titulo}</div>
                <div className="nf-section-body">
                  {sec.campos.map(([rotulo, valor], j) => (
                    <div className="nf-field" key={`${rotulo}-${j}`}>
                      <span className="nf-field-label">{rotulo}</span>
                      <span className="nf-field-value">{valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Resumo final */}
            <div className="nf-summary">
              <h3>📊 Resumo Final</h3>
              <div className="nf-summary-grid">
                <div className="nf-summary-item">
                  <span className="nf-summary-label">Total de Serviços</span>
                  <span className="nf-summary-value">{formatarMoeda(result.totalServico)}</span>
                </div>
                <div className="nf-summary-item">
                  <span className="nf-summary-label">Total de Retenções</span>
                  <span className="nf-summary-value">{formatarMoeda(result.totalRetencao)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
