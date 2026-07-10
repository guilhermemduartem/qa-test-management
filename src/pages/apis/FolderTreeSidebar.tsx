import { useState } from 'react';
import type { FolderNode } from './folderTree';

function IconFolder() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

interface Props {
  roots: FolderNode[];
  totalCount: number;
  noFolderCnt: number;
  selected: 'all' | 'none' | string;
  onSelect: (sel: 'all' | 'none' | string) => void;
  dragOver?: string | null;
  onFolderDragOver?: (e: React.DragEvent, folderPath: 'none' | string) => void;
  onFolderDrop?: (folderPath: 'none' | string) => void;
  onFolderDragLeave?: () => void;
  onCreateFolder?: () => void;
  onDeleteFolder?: (folderPath: string) => void;
}

function FolderNodeItem({
  node, depth, selected, onSelect,
  dragOver, onFolderDragOver, onFolderDrop, onFolderDragLeave, onDeleteFolder,
}: {
  node: FolderNode;
  depth: number;
  selected: string;
  onSelect: (sel: string) => void;
  dragOver?: string | null;
  onFolderDragOver?: (e: React.DragEvent, path: string) => void;
  onFolderDrop?: (path: string) => void;
  onFolderDragLeave?: () => void;
  onDeleteFolder?: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isActive = selected === node.fullPath || selected.startsWith(node.fullPath + '/');
  const isDragTarget = dragOver === node.fullPath;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`casos-tree-item${isActive ? ' active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14, outline: isDragTarget ? '2px solid var(--accent)' : undefined, borderRadius: isDragTarget ? 6 : undefined }}
        onDragOver={onFolderDragOver ? (e) => onFolderDragOver(e, node.fullPath) : undefined}
        onDrop={onFolderDrop ? () => onFolderDrop(node.fullPath) : undefined}
        onDragLeave={onFolderDragLeave}
      >
        {hasChildren ? (
          <button
            className={`casos-tree-toggle${open ? ' open' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            aria-label={open ? 'Recolher' : 'Expandir'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ) : (
          <span className="casos-tree-toggle-spacer" />
        )}
        <button className="casos-tree-label" onClick={() => onSelect(node.fullPath)}>
          <span style={{ flexShrink: 0, marginRight: 4, color: 'var(--text-muted)', display: 'flex' }}><IconFolder /></span>
          <span className="casos-tree-label-text">{node.segment}</span>
          <span className="casos-count">{node.totalCount}</span>
        </button>
        {onDeleteFolder && (
          <button
            className="casos-tree-del"
            onClick={(e) => { e.stopPropagation(); onDeleteFolder(node.fullPath); }}
            title="Excluir pasta"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}
      </div>
      {open && hasChildren && node.children.map((child) => (
        <FolderNodeItem
          key={child.fullPath}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          dragOver={dragOver}
          onFolderDragOver={onFolderDragOver}
          onFolderDrop={onFolderDrop}
          onFolderDragLeave={onFolderDragLeave}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </div>
  );
}

export function FolderTreeSidebar({
  roots, totalCount, noFolderCnt, selected, onSelect,
  dragOver, onFolderDragOver, onFolderDrop, onFolderDragLeave,
  onCreateFolder, onDeleteFolder,
}: Props) {
  return (
    <>
      <div className="casos-tree-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Pastas
        {onCreateFolder && (
          <button
            onClick={onCreateFolder}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1, fontSize: 16, fontWeight: 300 }}
            title="Nova pasta"
          >
            +
          </button>
        )}
      </div>
      <button
        className={`casos-tree-item${selected === 'all' ? ' active' : ''}`}
        onClick={() => onSelect('all')}
      >
        <span className="casos-tree-toggle-spacer" />
        <span className="casos-tree-label-text">Todas</span>
        <span className="casos-count">{totalCount}</span>
      </button>
      {noFolderCnt > 0 && (
        <button
          className={`casos-tree-item${selected === 'none' ? ' active' : ''}`}
          onClick={() => onSelect('none')}
          style={{ outline: dragOver === 'none' ? '2px solid var(--accent)' : undefined, borderRadius: dragOver === 'none' ? 6 : undefined }}
          onDragOver={onFolderDragOver ? (e) => onFolderDragOver(e, 'none') : undefined}
          onDrop={onFolderDrop ? () => onFolderDrop('none') : undefined}
          onDragLeave={onFolderDragLeave}
        >
          <span className="casos-tree-toggle-spacer" />
          <span className="casos-tree-label-text" style={{ fontStyle: 'italic' }}>Sem pasta</span>
          <span className="casos-count">{noFolderCnt}</span>
        </button>
      )}
      {roots.length > 0 && <div className="casos-tree-divider" />}
      {roots.map((node) => (
        <FolderNodeItem
          key={node.fullPath}
          node={node}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          dragOver={dragOver}
          onFolderDragOver={onFolderDragOver}
          onFolderDrop={onFolderDrop}
          onFolderDragLeave={onFolderDragLeave}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </>
  );
}
