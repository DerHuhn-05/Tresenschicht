import { useEffect, useState } from 'react';
import tokens from '../../design/tokens.json';

export type Theme = 'light' | 'dark' | 'contrast';

const byName = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value as string | Record<string, string>]));

/** Farbwert eines Tokens im gewählten Modus, Aliase aufgelöst. */
export function tokenColor(name: string, theme: Theme): string {
  const v = byName[name];
  const raw = typeof v === 'string' ? v : v[theme] ?? v.light;
  const m = /^\{(.+)\}$/.exec(raw);
  return m ? tokenColor(m[1], theme) : raw;
}

function current(): Theme {
  const forced = document.documentElement.dataset.theme as Theme | undefined;
  if (forced) return forced;
  if (matchMedia('(prefers-contrast: more)').matches) return 'contrast';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    const qs = [matchMedia('(prefers-color-scheme: dark)'), matchMedia('(prefers-contrast: more)')];
    const on = () => setTheme(current());
    qs.forEach((q) => q.addEventListener('change', on));
    return () => qs.forEach((q) => q.removeEventListener('change', on));
  }, []);
  return theme;
}
