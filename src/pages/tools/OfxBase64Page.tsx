/* ═══════════════════════════════════════════════════════════
   OfxBase64Page — converte um arquivo OFX (ou qualquer binário)
   para Base64, para envio em APIs.
   ═══════════════════════════════════════════════════════════ */
import { useRef, useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { CopyButton } from '../../components/tools/CopyButton';
import { arrayBufferToBase64 } from '../../lib/toolUtils';
import { showToast } from '../../lib/toast';

export function OfxBase64Page() {
  const [fileName, setFileName] = useState('');
  const [base64, setBase64] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    setFileName(file.name);
    setBase64('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        setBase64(arrayBufferToBase64(e.target!.result as ArrayBuffer));
      } catch {
        showToast('Falha ao converter o arquivo.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const clear = () => {
    setFileName('');
    setBase64('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <ToolLayout
      title="OFX para Base64"
      activeTool="ofx"
      help={
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Selecione um arquivo OFX ou TXT.</li>
            <li>A conversão para Base64 acontece automaticamente.</li>
            <li>Copie o resultado gerado para usar em APIs ou testes.</li>
          </ul>
        </>
      }
    >
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>Conversor OFX para Base64</h2>
            <p>Converta arquivos OFX ou TXT em Base64 para uso em APIs e cenários de teste.</p>
          </div>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="tool-actions tool-actions-center">
          <label className="btn btn-primary">
            Selecionar arquivo OFX/TXT
            <input
              ref={inputRef}
              type="file"
              accept=".ofx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          {fileName && <button className="btn btn-ghost" onClick={clear}>Limpar</button>}
        </div>
        {fileName && <div className="tool-status">Arquivo selecionado: {fileName}</div>}
      </div>

      {base64 && (
        <div className="tool-card cnpj-block">
          <div className="tool-section-head">
            <span>Resultado</span>
            <span className="tool-section-hint">{base64.length.toLocaleString('pt-BR')} caracteres</span>
          </div>
            <label className="tool-field-label">Base64 ({base64.length.toLocaleString('pt-BR')} caracteres)</label>
            <textarea className="tool-textarea" value={base64} readOnly />
            <div className="tool-actions">
              <CopyButton value={base64} label="Copiar Base64" className="btn btn-ghost cnpj-copy-btn" persistent />
            </div>
        </div>
      )}
    </ToolLayout>
  );
}
