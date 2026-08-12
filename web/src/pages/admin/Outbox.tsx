import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Badge, EmptyState, Loading, Modal, Pagination } from '../../components/ui';
import { formatDate } from '../../lib/labels';
import { MAIL_LINK_NOTE, extractLinks } from '../../lib/mailLinks';
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

const STATUS_LABEL: Record<string, string> = {
  SENT: 'Gönderildi',
  QUEUED: 'Kuyrukta',
  FAILED: 'Başarısız',
  LOGGED: 'Kaydedildi',
};

const TABS = [
  { key: 'INTERNAL', label: 'Ekibe gelen bildirimler', hint: 'Yanmar kullanıcılarına düşen sistem bildirimleri' },
  { key: 'SUPPLIER', label: 'Tedarikçilere gönderilen', hint: 'Tedarikçilere giden yazışmalar' },
] as const;

export default function Outbox() {
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
      <TopBar title="E-posta Kutusu" subtitle="Sistemin ürettiği bildirimler — gelen ve giden ayrı ayrı" />
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
              {tab.label}
              {data && <span className="muted"> ({tab.key === 'INTERNAL' ? data.counts.internal : data.counts.supplier})</span>}
            </button>
          ))}
        </div>

        <p className="small muted" style={{ marginBottom: 14 }}>
          {active.hint}
        </p>

        <div className="table-wrap">
          {!data ? (
            <Loading />
          ) : data.rows.length === 0 ? (
            <EmptyState title="Bu kutuda bildirim yok" />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{audience === 'INTERNAL' ? 'Alıcı (ekip)' : 'Alıcı (tedarikçi)'}</th>
                      <th>Konu</th>
                      <th>Durum</th>
                      <th>Tarih</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((m) => (
                      <tr key={m.id}>
                        <td className="small">{m.to_email}</td>
                        <td>{m.subject}</td>
                        <td className="tight">
                          <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{STATUS_LABEL[m.status] ?? m.status}</Badge>
                          {m.error && <div className="small" style={{ color: 'var(--brand)' }}>{m.error}</div>}
                        </td>
                        <td className="tight small">{formatDate(m.created_at, true)}</td>
                        <td className="tight">
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => api.get<Mail>(`/admin/stats/outbox/${m.id}`).then(setPreview).catch(() => undefined)}
                          >
                            Aç
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
        <Modal title={preview.subject} subtitle={`Alıcı: ${preview.to_email}`} onClose={() => setPreview(null)}>
          {links.length > 0 && (
            <div className="mail-links">
              <div className="section-label" style={{ marginBottom: 8 }}>
                E-postadaki bağlantılar
              </div>
              {links.map((l) => (
                <a key={l.href} className="btn btn-sm" href={l.href} target="_blank" rel="noreferrer noopener">
                  {l.text} ↗
                </a>
              ))}
              <div className="small muted" style={{ marginTop: 8, width: '100%' }}>
                {MAIL_LINK_NOTE}
              </div>
            </div>
          )}

          <iframe
            title="E-posta önizleme"
            srcDoc={preview.body_html}
            sandbox=""
            style={{ width: '100%', height: 460, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}
          />
        </Modal>
      )}
    </>
  );
}
