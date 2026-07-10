import { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal';
import { getComments, addComment, uploadAttachment, linkAttachment, getMyAzureId, downloadAttachment, extractImgTags } from '../../lib/azureDevOps';
import type { AzureComment } from '../../types/azure';
import type { Defect, Card } from '../../types/tests';
import { formatDate } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { IconBug, IconNote, IconCheck } from './icons';

export interface AzureItem {
  azureId: number;
  title: string;
  type: 'bug' | 'card';
  configId: string;
  defect?: Defect;
  card?: Card;
  linkedItems: { azureId: number; title: string; type: 'bug' | 'card' }[];
}

export const AZ_TYPE_COLOR: Record<'bug' | 'card', string> = { bug: '#ef4444', card: '#6366f1' };
export const AZ_TYPE_LABEL: Record<'bug' | 'card', string> = { bug: 'Bug', card: 'User Story' };

export function WorkItemModal({ item, apiCfg, onClose, onUpdated, onCloseItem }: {
  item: AzureItem;
  apiCfg: { organization: string; project: string; pat: string } | null;
  onClose: () => void;
  onUpdated?: (i: AzureItem) => void;
  onCloseItem?: (i: AzureItem) => Promise<void>;
}) {
  const [comments, setComments]               = useState<AzureComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [myAzureId, setMyAzureId]             = useState<string | null>(null);
  const [newComment, setNewComment]           = useState('');
  const [sending, setSending]                 = useState(false);
  const [uploading, setUploading]             = useState(false);
  const [closing, setClosing]                 = useState(false);
  const fileRef                               = useRef<HTMLInputElement>(null);
  const col                                   = AZ_TYPE_COLOR[item.type];
  const objectUrls                            = useRef<string[]>([]);
  const [lightbox, setLightbox]               = useState<string | null>(null);

  useEffect(() => () => { objectUrls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  /* Troca imagens de anexos Azure (protegidas por PAT) por blob URLs p/ exibir dentro do comentário. */
  const inlineComment = async (cm: AzureComment): Promise<AzureComment> => {
    if (!apiCfg) return cm;
    const tags = extractImgTags(cm.text ?? '').filter(t => /_apis\/wit\/attachments/i.test(t.url));
    if (tags.length === 0) return cm;
    let text = cm.text;
    for (const { raw, url } of tags) {
      try {
        const blob = await downloadAttachment(apiCfg, url);
        const obj = URL.createObjectURL(blob);
        objectUrls.current.push(obj);
        text = text.split(raw).join(obj);
      } catch { /* mantém original */ }
    }
    return { ...cm, text };
  };
  const inlineComments = (cms: AzureComment[]) => Promise.all(cms.map(inlineComment));

  const onImgClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') { e.preventDefault(); setLightbox((t as HTMLImageElement).src); }
  };

  useEffect(() => {
    if (!apiCfg) return;
    setLoadingComments(true);
    Promise.all([getComments(apiCfg, item.azureId), getMyAzureId(apiCfg)])
      .then(async ([cms, azId]) => { setComments(await inlineComments(cms)); setMyAzureId(azId); })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.azureId]);

  const sendComment = async () => {
    if (!newComment.trim() || !apiCfg) return;
    setSending(true);
    try {
      const c = await addComment(apiCfg, item.azureId, newComment.trim());
      setComments(prev => [...prev, c]);
      setNewComment('');
    } catch {
      showToast('Erro ao enviar comentário.', 'error');
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: File) => {
    if (!apiCfg) return;
    setUploading(true);
    try {
      const attUrl = await uploadAttachment(apiCfg, file.name, file);
      await linkAttachment(apiCfg, item.azureId, attUrl);
      const html = file.type.startsWith('image/')
        ? `<img src="${attUrl}" alt="${file.name}" style="max-width:100%" />`
        : `<a href="${attUrl}">${file.name}</a>`;
      const c = await addComment(apiCfg, item.azureId, html);
      setComments(prev => [...prev, c]);
      inlineComment(c).then(inl => setComments(prev => prev.map(x => x.id === c.id ? inl : x)));
      showToast('Arquivo enviado.', 'success');
    } catch {
      showToast('Erro ao enviar arquivo.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = async () => {
    if (!onCloseItem) return;
    setClosing(true);
    try {
      await onCloseItem(item);
      showToast('Item fechado.', 'success');
      onClose();
    } catch {
      showToast('Erro ao fechar item.', 'error');
    } finally {
      setClosing(false);
    }
  };

  const isClosed = item.defect?.status === 'closed' || item.card?.status === 'concluida';

  return (
    <Modal large title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {item.type === 'bug'
          ? <IconBug width={16} height={16} style={{ color: col, flexShrink: 0 } as React.CSSProperties} />
          : <IconNote width={16} height={16} style={{ color: col, flexShrink: 0 } as React.CSSProperties} />
        }
        <span style={{ fontSize: 11, fontWeight: 700, color: col, background: `${col}18`, border: `1px solid ${col}40`, borderRadius: 4, padding: '1px 7px', flexShrink: 0 }}>
          {AZ_TYPE_LABEL[item.type]} #{item.azureId}
        </span>
        <span style={{ wordBreak: 'break-word' }}>{item.title}</span>
      </div>
    } onClose={onClose} footer={
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        {item.linkedItems.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            {item.linkedItems.map(l => (
              <span key={l.azureId} style={{ fontSize: 11, fontWeight: 600, color: AZ_TYPE_COLOR[l.type], background: `${AZ_TYPE_COLOR[l.type]}18`, border: `1px solid ${AZ_TYPE_COLOR[l.type]}40`, borderRadius: 5, padding: '2px 8px' }}>
                {AZ_TYPE_LABEL[l.type]} #{l.azureId} — {l.title}
              </span>
            ))}
          </div>
        )}
        <span style={{ flex: 1 }} />
        {!isClosed && onCloseItem && (
          <button className="btn btn-sm" onClick={() => void handleClose()} disabled={closing}
            style={{ background: '#10b981', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconCheck width={13} height={13} />
            {closing ? 'Fechando…' : 'Fechar item'}
          </button>
        )}
        {isClosed && <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ Fechado</span>}
        <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
      </div>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Comentários */}
        <div onClick={onImgClick} style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16, maxHeight: 420, overflowY: 'auto' }}>
          {loadingComments ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando comentários…</p>
          ) : comments.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum comentário ainda.</p>
          ) : comments.map(cm => {
            const isMe = !!myAzureId && cm.createdBy?.id === myAzureId;
            const name = cm.createdBy?.displayName ?? 'Azure';
            const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
            return (
              <div key={cm.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '85%' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'var(--accent)' : '#6c757d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ background: isMe ? 'var(--accent)' : 'var(--bg-secondary)', color: isMe ? '#fff' : 'var(--text-primary)', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                    {!isMe && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>{name}</div>}
                    <div className="azure-comment-text" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: cm.text }} />
                    <div style={{ fontSize: 11, marginTop: 5, opacity: 0.6, textAlign: isMe ? 'right' : 'left' }}>
                      {name} · {formatDate(cm.createdDate)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        {!isClosed ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)}
              placeholder="Adicionar comentário…"
              onKeyDown={e => { if (e.key === 'Enter' && !sending) void sendComment(); }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
            />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Enviar arquivo"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
              {uploading ? '…' : '📎'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => void sendComment()} disabled={sending || !newComment.trim()}>
              {sending ? '…' : 'Enviar'}
            </button>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.zip,.txt" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void sendFile(f); e.target.value = ''; }} />
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: 8 }}>
            Item fechado — comentários desabilitados.
          </p>
        )}
      </div>
      {lightbox && (
        <div className="img-lightbox" onClick={() => setLightbox(null)}>
          <button className="img-lightbox-close" onClick={() => setLightbox(null)} aria-label="Fechar">✕</button>
          <img src={lightbox} alt="Imagem ampliada" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </Modal>
  );
}
