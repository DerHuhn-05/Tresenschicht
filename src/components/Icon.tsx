import icons from '../lib/icons.json';

export type IconName = keyof typeof icons.icons;

interface El {
  k: string;
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
}

/**
 * Icon aus dem IconSet: Linie 2 pt im 24-pt-Raster in `text`, Akzent in `accent`.
 * `muted` setzt die Linie auf `text-muted` und lässt den Akzent weg (nicht gewählter Tab).
 */
export function Icon({ name, size = 24, muted = false, label, className }: { name: IconName; size?: number; muted?: boolean; label?: string; className?: string }) {
  const def = icons.icons[name] as { els: El[] };
  const line = muted ? 'var(--text-muted)' : 'currentColor';
  const accent = muted ? 'none' : 'var(--accent)';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={line}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {def.els.map((e, i) => {
        switch (e.k) {
          case 'p':
            return <path key={i} d={e.d} />;
          case 'f':
            return <path key={i} d={e.d} fill={accent} />;
          case 'af':
            return <path key={i} d={e.d} fill={accent} stroke="none" />;
          case 'as':
            return <path key={i} d={e.d} stroke={muted ? line : 'var(--accent)'} />;
          case 'c':
            return <circle key={i} cx={e.cx} cy={e.cy} r={e.r} fill={muted ? line : 'var(--accent)'} stroke="none" />;
          default:
            return <circle key={i} cx={e.cx} cy={e.cy} r={e.r} fill={line} stroke="none" />;
        }
      })}
    </svg>
  );
}
