import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { Badge, EmptyState, Grade, Loading, Pagination } from '../../components/ui';
import { AUDIT_METHOD, AUDIT_STATUS, formatDate, label, tone } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Row = {
  id: number;
  audit_no: string;
  type: string;
  status: string;
  planned_date: string | null;
  completed_at: string | null;
  method: string | null;
  score: number | null;
  grade: string | null;
  company_name: string | null;
  ref_no: string | null;
  supplier_code: string | null;
  auditor_name: string | null;
  scored_count: number;
};

const TYPE_LABELS: Record<string, string> = {
  INITIAL: 'İlk denetim',
  PERIODIC: 'Periyodik',
  FOLLOW_UP: 'Takip denetimi',
  SPECIAL: 'Özel denetim',
};

const TABS = [
  { key: 'PENDING,PLANNED,IN_PROGRESS', label: 'Açık denetimler' },
  { key: 'PENDING', label: 'Denetim bekliyor' },
  { key: 'COMPLETED', label: 'Tamamlanan' },
  { key: '', label: 'Tümü' },
];

export default function Audits() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ rows: Row[]; total: number; page: number; pageCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const status = params.get('status') ?? 'PENDING,PLANNED,IN_PROGRESS';

  useEffect(() => {
    setLoading(true);
    api
      .get<{ rows: Row[]; total: number; page: number; pageCount: number }>(
        `/admin/audits${qs({ status, q: params.get('q'), page: params.get('page') })}`,
      )
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [status, params]);

  return (
    <>
      <TopBar title="Kalite Denetimleri" subtitle="Satınalma onayından geçen adayların denetim kuyruğu" />
      <div className="admin-content">
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`tab ${status === tab.key ? 'active' : ''}`}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (tab.key) next.set('status', tab.key);
                else next.set('status', '');
                next.delete('page');
                setParams(next);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="filters">
          <div className="filter-row">
            <div className="field grow">
              <label>Arama</label>
              <input
                defaultValue={params.get('q') ?? ''}
                placeholder="Firma adı veya denetim no"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const next = new URLSearchParams(params);
                  const value = (e.target as HTMLInputElement).value;
                  if (value) next.set('q', value);
                  else next.delete('q');
                  next.delete('page');
                  setParams(next);
                }}
              />
              <span className="hint">Aramak için Enter'a basın</span>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title="Denetim kaydı yok" hint="Satınalma bir başvuruyu onayladığında burada görünür." />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Denetim</th>
                      <th>Firma</th>
                      <th>Tür</th>
                      <th>Denetçi</th>
                      <th>Planlanan</th>
                      <th>Durum</th>
                      <th>Puan</th>
                      <th>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/yonetim/denetimler/${row.id}`} className="mono" style={{ fontWeight: 600 }}>
                            {row.audit_no}
                          </Link>
                          {row.method && <div className="small muted">{label(AUDIT_METHOD, row.method)}</div>}
                        </td>
                        <td>
                          <Link to={`/yonetim/denetimler/${row.id}`} className="company">
                            {row.company_name ?? '—'}
                          </Link>
                          <div className="ref">{row.supplier_code ?? row.ref_no ?? ''}</div>
                        </td>
                        <td className="small">{TYPE_LABELS[row.type] ?? row.type}</td>
                        <td className="small">{row.auditor_name ?? <span className="muted">atanmadı</span>}</td>
                        <td className="tight small">{formatDate(row.planned_date)}</td>
                        <td className="tight">
                          <Badge tone={tone(AUDIT_STATUS, row.status)}>{label(AUDIT_STATUS, row.status)}</Badge>
                        </td>
                        <td className="tight">{row.score !== null ? row.score : <span className="muted small">—</span>}</td>
                        <td>
                          <Grade grade={row.grade} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && (
                <Pagination
                  page={data.page}
                  pageCount={data.pageCount}
                  total={data.total}
                  onChange={(p) => {
                    const next = new URLSearchParams(params);
                    next.set('page', String(p));
                    setParams(next);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
