/* CopyButton — copia texto para a área de transferência com
   feedback visual temporário. Usado pelas ferramentas. */
import { useState } from 'react';

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Fallback para contextos sem Clipboard API (ex.: http).
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
  onCopied?: () => void;
  persistent?: boolean;
}

export function CopyButton({ value, className = 'btn btn-ghost btn-xs', label = 'Copiar', onCopied, persistent = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await copyText(value);
        setCopied(true);
        onCopied?.();
        if (!persistent) setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Copiado!' : label}
    </button>
  );
}
