import { createContext, useContext } from 'react';

export type VisionTheme = 'day' | 'night';

export interface ThemeContextValue {
  theme: VisionTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: VisionTheme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
