import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { shrinkPhoto } from '../lib/image';
import { Icon, type IconName } from './Icon';

export function TopBar({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Zurück">
          <Icon name="chevron-left" />
        </button>
      )}
      <div className="title" style={onBack ? undefined : { paddingLeft: 12 }}>
        {title}
      </div>
      {right}
    </header>
  );
}

export function Page({ title, onBack, right, children, subtle }: { title?: string; onBack: () => void; right?: ReactNode; children: ReactNode; subtle?: boolean }) {
  return (
    <div className="page" role="dialog" aria-modal="true" aria-label={title}>
      <TopBar title={title} onBack={onBack} right={right} />
      <div className={`screen${subtle ? ' subtle' : ''}`}>{children}</div>
    </div>
  );
}

/** Sheet von unten. Fängt den Fokus, bis es geschlossen ist; Escape schließt. */
export function Sheet({ children, onClose, label, closable = true }: { children: ReactNode; onClose?: () => void; label: string; closable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const prev = document.activeElement as HTMLElement | null;
    const first = el.querySelector<HTMLElement>('h1,h2,h3,[data-autofocus]');
    (first ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable && onClose) onClose();
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) (e.preventDefault(), z.focus());
      else if (!e.shiftKey && document.activeElement === z) (e.preventDefault(), a.focus());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [closable, onClose]);
  return (
    <div className="scrim">
      <div className="scrim-bg" onClick={closable ? onClose : undefined} />
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="grip" aria-hidden="true" />
        {closable && onClose && (
          <button className="icon-btn sheet-close" onClick={onClose} aria-label="Schließen">
            <Icon name="close" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Field({
  label, hint, error, ok, children,
}: { label: string; hint?: string; error?: string | null; ok?: string | null; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const msg = error || ok || hint;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id, msg ? hintId : undefined)}
      {msg && (
        <div id={hintId} className={`field-hint${error ? ' error' : ok ? ' ok' : ''}`} aria-live={error ? 'polite' : undefined}>
          {error && <Icon name="error" size={16} />}
          {!error && ok && <Icon name="success" size={16} />}
          <span>{msg}</span>
        </div>
      )}
    </div>
  );
}

export function Avatar({ url, name, size = 'md' }: { url?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = `avatar${size === 'md' ? '' : ` ${size}`}`;
  if (url) return <img className={cls} src={url} alt={`Profilbild von ${name}`} />;
  return (
    <span className={cls} role="img" aria-label={`Profilbild von ${name}`}>
      <Icon name="profile" size={size === 'lg' ? 48 : 24} />
    </span>
  );
}

export function Spinner({ label = 'Lädt' }: { label?: string }) {
  return (
    <div className="center" role="status">
      <div className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <h2 className="t-h3">{title}</h2>
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}

export function Notice({ icon = 'info', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="notice" role="note">
      <Icon name={icon} size={20} />
      <div>{children}</div>
    </div>
  );
}

/** Foto wählen oder aufnehmen; verkleinert auf dem Gerät (G3) und entfernt dabei die GPS-Daten. */
export function PhotoPicker({
  value, onChange, label = 'Foto hinzufügen', round = false,
}: { value?: string; onChange: (blob: Blob | null, preview: string | null) => void; label?: string; round?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await shrinkPhoto(file, round ? 600 : undefined);
      onChange(blob, URL.createObjectURL(blob));
    } catch {
      setError('Dieses Foto lässt sich nicht öffnen. Wähle ein anderes.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" className={`photo-pick${round ? ' avatar-pick' : ''}`} onClick={() => input.current?.click()} aria-label={value ? `${label}: Foto ändern` : label}>
        {busy ? <div className="spinner" /> : value ? <img src={value} alt="" /> : (
          <>
            <Icon name={round ? 'profile' : 'camera'} size={32} />
            {!round && <span>{label}</span>}
          </>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {value && (
        <button type="button" className="btn btn-text" onClick={() => onChange(null, null)}>
          Foto entfernen
        </button>
      )}
      {error && (
        <div className="field-hint error">
          <Icon name="error" size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export function Toast({ text, kind, onDone }: { text: string; kind: 'info' | 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <div className="toast" role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info'} size={20} />
      <span>{text}</span>
    </div>
  );
}

export function Confirm({
  title, text, confirm, danger, onConfirm, onCancel,
}: { title: string; text: string; confirm: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Sheet label={title} onClose={onCancel}>
      <h2 className="t-h2" tabIndex={-1}>
        {title}
      </h2>
      <p className="muted" style={{ marginTop: 8 }}>
        {text}
      </p>
      <div className="btn-stack" style={{ marginTop: 20 }}>
        <button className={`btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
          {confirm}
        </button>
        <button className="btn btn-block btn-text" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </Sheet>
  );
}
