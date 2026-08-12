import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n';
import { type BadgeTone, formatBytes } from '../lib/labels';

/* ------------------------------- Bildirimler ------------------------------ */

type Toast = { id: number; message: string; kind: 'ok' | 'error' | 'info' };
type ToastValue = { push: (message: string, kind?: Toast['kind']) => void };

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* --------------------------------- Rozet ---------------------------------- */

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Grade({ grade }: { grade?: string | null }) {
  if (!grade) return <span className="muted">—</span>;
  return <span className={`grade grade-${grade}`}>{grade}</span>;
}

/* --------------------------------- Modal ---------------------------------- */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
  headerExtra?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'sm' ? 'modal-sm' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <div className="row">
            {headerExtra}
            <button className="close-btn" onClick={onClose} aria-label="Kapat" type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------- Onay kutusu ------------------------------ */

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Onayla',
  danger,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <span />
          <div className="row">
            <button className="btn" onClick={onCancel} type="button">
              {t('btn.give.up')}
            </button>
            <button
              className={danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={onConfirm}
              disabled={busy}
              type="button"
            >
              {busy && <span className="spinner" />} {confirmLabel}
            </button>
          </div>
        </>
      }
    >
      <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{message}</div>
    </Modal>
  );
}

/* --------------------------------- Alanlar -------------------------------- */

export function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      {label && (
        <label>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error && <span className="err">{error}</span>}
      {hint && !error && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ------------------------------ Dosya seçici ------------------------------ */

export function FileSlot({
  title,
  meta,
  required,
  accept,
  multiple,
  file,
  onSelect,
  labels,
}: {
  title: string;
  meta: string;
  required?: boolean;
  accept?: string;
  multiple?: boolean;
  file: File[] | null;
  onSelect: (files: File[] | null) => void;
  labels: { required: string; optional: string; remove: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const has = !!file?.length;

  return (
    <div
      className={`upload-slot ${has ? 'uploaded' : ''} ${dragging ? 'dragging' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = Array.from(e.dataTransfer.files);
        if (dropped.length) onSelect(multiple ? dropped : [dropped[0]]);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <div className="upload-icon">
        {has ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </div>
      <div className="upload-info">
        <div className="upload-title">
          {title}
          <span className={required ? 'req-badge' : 'opt-badge'}>{required ? labels.required : labels.optional}</span>
        </div>
        <div className="upload-meta">
          {has
            ? file!.map((f) => `${f.name} · ${formatBytes(f.size)}`).join(', ')
            : meta}
        </div>
      </div>
      {has && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          {labels.remove}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          onSelect(list.length ? list : null);
        }}
      />
    </div>
  );
}

/* -------------------------------- Sayfalama ------------------------------- */

export function Pagination({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  if (total === 0) return null;
  return (
    <div className="row-between pagination">
      <span className="small muted">{t('ui.pagination', { total, page, pageCount })}</span>
      <div className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} type="button">
          {t('ui.prev')}
        </button>
        <button className="btn btn-sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)} type="button">
          {t('ui.next')}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- Yardımcı -------------------------------- */

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="empty">
      <span className="spinner" /> <span style={{ marginLeft: 8 }}>{label ?? t('ui.loading')}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div style={{ fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>{title}</div>
      {hint && <div className="small">{hint}</div>}
    </div>
  );
}

/** Basit yatay bar grafiği — harici grafik kütüphanesi gerektirmez. */
export function BarChart({
  data,
  max,
  color = 'var(--brand)',
}: {
  data: Array<{ label: string; value: number; extra?: string }>;
  max?: number;
  color?: string;
}) {
  const peak = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div key={d.label} className="bar-row">
          <span className="bar-label" title={d.label}>
            {d.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(d.value / peak) * 100}%`, background: color }} />
          </span>
          <span className="bar-value">
            {d.value}
            {d.extra && <span className="muted"> {d.extra}</span>}
          </span>
        </div>
      ))}
      {data.length === 0 && <div className="small muted">Veri yok</div>}
    </div>
  );
}

/** Aylık trend için minimal SVG sütun grafiği. */
export function TrendChart({ data }: { data: Array<{ month: string; count: number; approved: number }> }) {
  if (data.length === 0) return <div className="small muted">Veri yok</div>;
  const peak = Math.max(1, ...data.map((d) => d.count));
  const width = Math.max(data.length * 46, 200);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height="150" role="img" aria-label="Aylık başvuru trendi">
        {data.map((d, i) => {
          const h = (d.count / peak) * 100;
          const ah = (d.approved / peak) * 100;
          const x = i * 46 + 8;
          return (
            <g key={d.month}>
              <rect x={x} y={110 - h} width="26" height={h} rx="3" fill="var(--brand)" opacity="0.22" />
              <rect x={x} y={110 - ah} width="26" height={ah} rx="3" fill="var(--brand)" />
              <text x={x + 13} y={108 - h} textAnchor="middle" fontSize="10" fill="var(--ink-3)">
                {d.count}
              </text>
              <text x={x + 13} y="126" textAnchor="middle" fontSize="9.5" fill="var(--ink-4)">
                {d.month.slice(5)}
              </text>
              <text x={x + 13} y="140" textAnchor="middle" fontSize="9" fill="var(--ink-4)">
                {d.month.slice(2, 4)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
