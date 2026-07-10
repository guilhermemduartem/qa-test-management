/* ═══════════════════════════════════════════════════════════
   ImageDropzone — upload/preview de prints de um critério.
   Mesma UX da execução (colar Ctrl+V, arrastar ou procurar),
   mas mantém o armazenamento embutido em base64 (dataUrl) para
   a exportação PDF/DOCX continuar funcionando offline.
   ═══════════════════════════════════════════════════════════ */
import { useRef, useState, type ClipboardEvent } from 'react';
import { showToast } from '../lib/toast';
import { generateId } from '../lib/utils';
import type { ReportImage } from '../types';

interface ImageDropzoneProps {
  images: ReportImage[];
  onAdd: (images: ReportImage[]) => void;
  onRemove: (imageId: string) => void;
  onMove: (imageId: string, dir: -1 | 1) => void;
  onRename: (imageId: string, newName: string) => void;
}

function ImageThumb({
  img,
  index,
  total,
  onRemove,
  onMove,
  onRename,
}: {
  img: ReportImage;
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(img.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== img.name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="image-thumb">
      <img src={img.dataUrl} alt={img.name} loading="lazy" />

      {/* Move buttons */}
      <div className="image-thumb-move">
        {index > 0 && (
          <button
            className="image-thumb-move-btn"
            onClick={() => onMove(-1)}
            title="Mover para cima"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
        {index < total - 1 && (
          <button
            className="image-thumb-move-btn"
            onClick={() => onMove(1)}
            title="Mover para baixo"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Remove button */}
      <button className="image-thumb-remove" onClick={onRemove} title="Remover">✕</button>

      {/* Name / rename */}
      <div className="image-thumb-name">
        {editing ? (
          <input
            ref={inputRef}
            className="image-thumb-name-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="image-thumb-name-text" onClick={startEdit} title="Clique para renomear">
            {img.name}
            <svg className="image-thumb-rename-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

export function ImageDropzone({ images, onAdd, onRemove, onMove, onRename }: ImageDropzoneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  const validImages = (images || []).filter(
    (img) => typeof img?.dataUrl === 'string' && img.dataUrl.trim() !== '',
  );

  const handleFiles = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) {
      showToast('Selecione arquivos de imagem.', 'warning');
      return;
    }
    const loaded: ReportImage[] = [];
    let count = 0;
    valid.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        loaded.push({ id: generateId(), dataUrl: String(e.target?.result || ''), name: file.name || 'print.png' });
        count++;
        if (count === valid.length) {
          onAdd(loaded);
          showToast(`${loaded.length} imagem(ns) adicionada(s).`, 'success');
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) { e.preventDefault(); handleFiles(files); }
  };

  return (
    <div className="images-section">
      <div className="steps-label">
        <span>Prints de Tela</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{validImages.length} imagem(ns)</span>
      </div>
      <div className="image-grid">
        {validImages.map((img, i) => (
          <ImageThumb
            key={img.id}
            img={img}
            index={i}
            total={validImages.length}
            onRemove={() => onRemove(img.id)}
            onMove={(dir) => onMove(img.id, dir)}
            onRename={(name) => onRename(img.id, name)}
          />
        ))}
      </div>
      <div
        ref={ref}
        className={`evi-drop${over ? ' over' : ''}`}
        tabIndex={0}
        onClick={() => ref.current?.focus()}
        onPaste={onPaste}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files)); }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" />
        </svg>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)' }}>Cole um print (Ctrl+V), arraste a imagem ou</span>
        <label className="evi-drop-browse" onClick={(e) => e.stopPropagation()}>
          Procurar Arquivo
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
          />
        </label>
      </div>
    </div>
  );
}
