import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Badge, EmptyState, Loading, Modal, Pagination } from '../../components/ui';
import { formatDate } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Mail = {
  id: number;
  to_email: string;
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

export default function Outbox() {
  const [data, setData] = useState<{ rows: Mail[]; total: number; page: number; pageCount: number } | null>(null);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Mail | null>(null);

  useEffect(() => {
    api
      .get<{ rows: Mail[]; total: number; page: number; pageCount: number }>(`/admin/stats/outbox?page=${page}`)
      .then(setData)
      .catch(() => undefined);
  }, [page]);

  return (
    <>
      <TopBar
        title="E-posta Kutusu"
        subtitle="Sistemin gönderdiği tüm bildirimler — SMTP tanımlı değilse burada saklanır"
      />
      <div className="admin-content">
        <div className="table-wrap">
          {!data ? (
            <Loading />
          ) : data.rows.length === 0 ? (
            <EmptyState title="Bildirim yok" />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Alıcı</th>
                      <th>Konu</th>
                      <th>Şablon</th>
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
                        <td className="small muted mono">{m.template ?? '—'}</td>
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
                            Görüntüle
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
          <iframe
            title="E-posta önizleme"
            srcDoc={preview.body_html}
            sandbox=""
            style={{ width: '100%', height: 520, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}
          />
        </Modal>
      )}
    </>
  );
}
