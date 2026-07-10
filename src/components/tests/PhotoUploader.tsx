/* ═══════════════════════════════════════════════════════════
   PhotoUploader — anexa fotos/arquivos (colar Ctrl+V, arrastar
   ou procurar) e mostra miniaturas. Envia ao bucket qa-evidence.
   Reutilizado nos defeitos (runner e tela de Defeitos).
   ═══════════════════════════════════════════════════════════ */
import { useRef, useState, type ClipboardEvent } from 'react';
import { uploadEvidence } from '../../lib/testManagement';
import type { Evidence } from '../../types/tests';
import { IconUpload, IconExternal, IconX } from './icons';

function isImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
}

export function PhotoUploader({ folderId, evidence, onChange }: {
  folderId: string; evidence: Evidence[]; onChange: (next: Evidence[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const add = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setUploading(true);
    const added: Evidence[] = [];
    for (const f of list) { const ev = await uploadEvidence(folderId, f); if (ev) added.push(ev); }
    if (added.length) onChange([...evidence, ...added]);
    setUploading(false);
  };
  const remove = (i: number) => onChange(evidence.filter((_, idx) => idx !== i));
  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) { e.preventDefault(); add(files); }
  };

  return (
    <div>
      <div
        ref={ref}
        className={`evi-drop${over ? ' over' : ''}`}
        tabIndex={0}
        onClick={() => ref.current?.focus()}
        onPaste={onPaste}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
      >
        <IconUpload />
        <span>{uploading ? 'Enviando…' : 'Cole um print (Ctrl+V), arraste a imagem ou'}</span>
        <label className="evi-drop-browse" onClick={(e) => e.stopPropagation()}>
          Procurar Arquivo
          <input type="file" multiple hidden disabled={uploading} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      {evidence.length > 0 && (
        <div className="runner-evidence-list" style={{ marginTop: 12 }}>
          {evidence.map((e, i) => (
            <div className={`evi${isImage(e.url) ? ' evi--img' : ''}`} key={i}>
              {isImage(e.url) ? (
                <>
                  <a className="evi-thumb" href={e.url} target="_blank" rel="noreferrer" title={e.name}><img src={e.url} alt={e.name} /></a>
                  <span className="evi-cap" title={e.name}>{e.name}</span>
                </>
              ) : (
                <a className="evi-link" href={e.url} target="_blank" rel="noreferrer" title={e.name}><IconExternal /> {e.name}</a>
              )}
              <button className="evi-del" onClick={() => remove(i)} title="Remover" aria-label="Remover evidência"><IconX /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
