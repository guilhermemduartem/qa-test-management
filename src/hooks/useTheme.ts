/* ═══════════════════════════════════════════════════════════
   useTheme — tema dark/light persistido em qar_settings (1:1 com app.js).
   ═══════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings } from '../lib/storage';

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadSettings().theme || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveSettings({ theme: next });
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
