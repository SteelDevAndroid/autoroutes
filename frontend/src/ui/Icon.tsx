import type { CSSProperties } from 'react';

const paths = {
  warning: 'M10.3 3.8 1.8 18.5A1.7 1.7 0 0 0 3.3 21h17.4a1.7 1.7 0 0 0 1.5-2.5L13.7 3.8a2 2 0 0 0-3.4 0M12 9v4m0 4h.01',
  route: 'M5 20 9 4m6 16 4-16M12 5l-.5 3m-1 5-.5 3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  chevron: 'm9 5 7 7-7 7',
  help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  rewind: 'M11 5 2 12l9 7V5Zm11 0-9 7 9 7V5Z',
  pause: 'M8 5v14M16 5v14',
  play: 'm7 4 14 8-14 8V4Z',
} as const;

/** Icônes de navigation : un seul langage de traits, toujours accompagnées d'un nom accessible. */
export function Icon({ name, className, style }: { readonly name: keyof typeof paths; readonly className?: string; readonly style?: CSSProperties }) {
  return <svg className={className} style={style} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
