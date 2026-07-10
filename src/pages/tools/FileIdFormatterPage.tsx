/* ═══════════════════════════════════════════════════════════
   FileIdFormatterPage — converte uma lista de IDs em JSON
   [{"FileExternalId":N}, ...] para importar no Postman.
   ═══════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { CopyButton } from '../../components/tools/CopyButton';
import {
  extractNumbersPreserveOrder, formatFileIds, downloadText, timestampFilename,
} from '../../lib/toolUtils';
import { showToast } from '../../lib/toast';

export function FileIdFormatterPage() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [extractedCount, setExtractedCount] = useState<number | null>(null);

  const convert = () => {
    const extracted = extractNumbersPreserveOrder(input);
    setOutput(formatFileIds(extracted));
    setExtractedCount(extracted.length);
  };

  const clear = () => { setInput(''); setOutput(''); setExtractedCount(null); };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
    } catch {
      showToast('Não foi possível ler a área de transferência. Cole manualmente.', 'warning');
    }
  };

  return (
    <ToolLayout
      title="FileID Formatter"
      activeTool="fileid"
      help={
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Cole IDs na entrada, um por linha ou separados por vírgula.</li>
            <li>Clique em converter para gerar o JSON de FileExternalId.</li>
            <li>Copie ou baixe o resultado para usar no Postman.</li>
          </ul>
        </>
      }
    >
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>Formatador de FileID</h2>
            <p>Converta listas de IDs em JSON pronto para importar no Postman.</p>
          </div>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-section-head">
          <span>Entrada</span>
        </div>
        <div className="tool-row">
          <div>
            <label className="tool-field-label">Entrada</label>
            <textarea
              className="tool-textarea"
              value={input}
              placeholder={'12345\n67890\n12345, 99999'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); convert(); }
              }}
            />
            <div className="tool-field-actions">
              <button type="button" className="btn btn-danger btn-sm" onClick={clear}>Limpar</button>
            </div>
          </div>
          <div>
            <label className="tool-field-label">Saída (JSON)</label>
            <textarea className="tool-textarea" value={output} readOnly placeholder="[]" />
          </div>
        </div>

        <div className="tool-actions tool-actions-wide">
          <button type="button" className="btn btn-primary" onClick={convert}>
            Converter (Ctrl+Enter)
          </button>
          <button type="button" className="btn btn-ghost" onClick={paste}>Colar</button>
          <CopyButton value={output} label="Copiar saída" className="btn btn-ghost" />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadText(timestampFilename('fileExternalIds', 'json'), output)}
            disabled={!output}
          >
            Baixar JSON
          </button>
        </div>

        {extractedCount !== null && (
          <p className="tool-status is-ok">
            <strong>{extractedCount} números extraídos</strong> · repetidos removidos · ordem preservada
          </p>
        )}
      </div>
    </ToolLayout>
  );
}
