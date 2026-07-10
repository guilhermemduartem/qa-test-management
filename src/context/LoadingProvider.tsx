/* ═══════════════════════════════════════════════════════════
   LoadingProvider — porta do overlay showLoading/hideLoading (export.js).
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useState, type ReactNode } from 'react';
import { registerLoadingHandlers } from '../lib/loading';

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('Gerando arquivo...');

  useEffect(() => {
    registerLoadingHandlers(
      (t) => {
        if (t) setText(t);
        setVisible(true);
      },
      () => setVisible(false),
    );
  }, []);

  return (
    <>
      {children}
      <div id="loading-overlay" className={`loading-overlay${visible ? '' : ' hidden'}`}>
        <div className="spinner" />
        <p className="loading-text">{text}</p>
      </div>
    </>
  );
}
