/* ═══════════════════════════════════════════════════════════
   utils.ts — Utilitários compartilhados (porta de app.js/storage.js)
   ═══════════════════════════════════════════════════════════ */
import type { Report } from '../types';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(str: unknown): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nl2br(str: unknown): string {
  return escapeHtml(str).replace(/\n/g, '<br>');
}
/** Remove os marcadores de negrito (**) — para títulos/nomes que não devem ter formatação. */
export function stripBold(str: unknown): string {
  return String(str ?? '').replace(/\*\*/g, '');
}
/** Como nl2br, mas converte **texto** em negrito (<strong>). Seguro: escapa antes. */
export function nl2brBold(str: unknown): string {
  return escapeHtml(str)
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

export function formatDateForFilename(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatDateOnly(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

export const DEFAULT_COMPANY_LOGO = `${import.meta.env.BASE_URL}logomikete.webp`;

export function getCompanyLogoUrl(report: Report): string {
  return report?.company?.logoUrl || DEFAULT_COMPANY_LOGO;
}

export function createEmptyReport(): Report {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    company: {
      name: 'Miketec',
      logoUrl: '',
    },
    story: {
      id: '',
      title: '',
      description: '',
      system: '',
      module: '',
      sprint: '',
      environment: '',
    },
    criteria: [],
    additionalData: {
      responsible: '',
      testDate: new Date().toISOString().split('T')[0],
      versionBko: '',
      versionPortal: '',
      notes: '',
    },
    finalStatus: 'pending',
  };
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    approved: 'var(--success)',
    rejected: 'var(--error)',
    partial: 'var(--warning)',
    pending: 'var(--text-muted)',
  };
  return map[status] || map.pending;
}
