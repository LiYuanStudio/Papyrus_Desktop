import { useState, useEffect } from 'react';

const KEY = 'papyrus_icon_color_mode';
type IconColorMode = 'mono' | 'color';

const loadMode = (): IconColorMode => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'color' || raw === 'mono') return raw;
  } catch {}
  return 'mono';
};

export const useIconColorMode = () => {
  const [mode, setModeState] = useState<IconColorMode>(loadMode);

  useEffect(() => {
    const handler = () => setModeState(loadMode());
    window.addEventListener('papyrus_icon_color_mode_changed', handler);
    return () => window.removeEventListener('papyrus_icon_color_mode_changed', handler);
  }, []);

  const setMode = (next: IconColorMode) => {
    try {
      localStorage.setItem(KEY, next);
      window.dispatchEvent(new CustomEvent('papyrus_icon_color_mode_changed', { detail: next }));
    } catch {}
    setModeState(next);
  };

  return { mode, setMode };
};
