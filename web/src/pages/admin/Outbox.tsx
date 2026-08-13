import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Badge, EmptyState, Loading, Modal, Pagination } from '../../components/ui';
import { formatDate } from '../../lib/labels';
import { extractLinks } from '../../lib/mailLinks';
import { useI18n } from '../../i18n';
import { TopBar } from './AdminLayout';

type Mail = {
  id: number;
  to_email: string;
  audience: 'INTERNAL' | 'SUPPLIER';
  subject: string;
  template: string | null;
  entity_type: string | null;
  entity_id: number | null;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  body_html?: string;
};

type Response = {
  rows: Mail[];
  total: number;
  page: number;
  pageCount: number;
  counts: { internal: number; supplier: number };
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  SENT: 'ok',
  QUEUED: 'warn',
  FAILED: 'danger',
  LOGGED: 'neutral',
};

const STATUS_KEY = {
  SENT: 'ob.status.SENT',
  QUEUED: 'ob.status.QUEUED',
  FAILED: 'ob.status.FAILED',
  LOGGED: 'ob.status.LOGGED',
} as const;

const TABS = [
  { key: 'INTERNAL', label: 'ob.internal', hint: 'ob.internal.hint' },
  { key: 'SUPPLIER', label: 'ob.supplier', hint: 'ob.supplier.hint' },
] as const;

export default function Outbox() {
  const { t, lang } = useI18n();
  const [audience, setAudience] = useState<'INTERNAL' | 'SUPPLIER'>('SUPPLIER');
  const [data, setData] = useState<Response | null>(null);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Mail | null>(null);

  useEffect(() => {
    setData(null);
    api
      .get<Response>(`/admin/stats/outbox?page=${page}&audience=${audience}`)
      .then(setData)
      .catch(() => undefined);
  }, [page, audience]);

  const active = TABS.find((t) => t.key === audience)!;
  const links = preview?.body_html ? extractLinks(preview.body_html) : [];

  return (
    <>
      <TopBar title={t('ob.title')} subtitle={t('ob.subtitle')} />
      <div className="admin-content">
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab ${audience === tab.key ? 'active' : ''}`}
              onClick={() => {
                setAudience(tab.key);
                setPage(1);
              }}
            >
              {t(tab.label)}
              {data && <span className="muted"> ({tab.key === 'INTERNAL' ? data.counts.internal : data.counts.supplier})</span>}
            </button>
          ))}
        </div>

        <p className="small muted" style={{ marginBottom: 14 }}>
          {t(active.hint)}
        </p>

        <div className="table-wrap">
          {!data ? (
            <Loading />
          ) : data.rows.length === 0 ? (
            <EmptyState title={t('ob.empty')} />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{audience === 'INTERNAL' ? t('ob.to.team') : t('ob.to.supplier')}</th>
                      <th>{t('a.subject')}</th>
                      <th>{t('a.status')}</th>
                      <th>{t('a.date')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((m) => (
                      <tr key={m.id}>
                        <td className="small">{m.to_email}</td>
                        <td>{m.subject}</td>
                        <td className="tight">
                          <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>
                            {m.status in STATUS_KEY ? t(STATUS_KEY[m.status as keyof typeof STATUS_KEY]) : m.status}
                          </Badge>
                          {m.error && <div className="small" style={{ color: 'var(--brand)' }}>{m.error}</div>}
                        </td>
                        <td className="tight small">{formatDate(m.created_at, true, lang)}</td>
                        <td className="tight">
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => api.get<Mail>(`/admin/stats/outbox/${m.id}`).then(setPreview).catch(() => undefined)}
                          >
                            {t('a.open')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageCount={data.pageCount} total={data.total} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      {preview && (
        <Modal title={preview.subject} subtitle={`${t('ob.recipient')}: ${preview.to_email}`} onClose={() => setPreview(null)}>
          {links.length > 0 && (
            <div className="mail-links">
              <div className="section-label" style={{ marginBottom: 8 }}>
                {t('mail.links.title')}
              </div>
              {links.map((l) => (
                <a key={l.href} className="btn btn-sm" href={l.href} target="_blank" rel="noreferrer noopener">
                  {l.text} ↗
                </a>
              ))}
              <div className="small muted" style={{ marginTop: 8, width: '100%' }}>
                {t('mail.links.note')}
              </div>
            </div>
          )}

          <iframe
            title={t('mail.preview')}
            srcDoc={preview.body_html}
            sandbox=""
            style={{ width: '100%', height: 460, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}
          />
        </Modal>
      )}
    </>
  );
}
