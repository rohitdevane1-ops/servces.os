import React, { useEffect, useState } from 'react';
import { ThemeContext, VisionTheme } from './themeContextCore';

const STORAGE_KEY = 'serviceos_vision_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<VisionTheme>(() => {
    if (typeof window === 'undefined') return 'day';
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'night' ? 'night' : 'day';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'night');
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors in restricted embeds
    }
  }, [theme]);

  const setTheme = (next: VisionTheme) => setThemeState(next);
  const toggleTheme = () => setThemeState((prev) => (prev === 'day' ? 'night' : 'day'));

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'night',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
