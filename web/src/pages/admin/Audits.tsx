import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { Badge, EmptyState, Grade, Loading, Pagination } from '../../components/ui';
import { AUDIT_METHOD, AUDIT_STATUS, formatDate, label, tone } from '../../lib/labels';
import { useI18n } from '../../i18n';
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

const TYPE_KEY = {
  INITIAL: 'au.type.INITIAL',
  PERIODIC: 'au.type.PERIODIC',
  FOLLOW_UP: 'au.type.FOLLOW_UP',
  SPECIAL: 'au.type.SPECIAL',
} as const;

const TABS = [
  { key: 'PENDING,PLANNED,IN_PROGRESS', label: 'au.tab.open' },
  { key: 'PENDING', label: 'au.tab.pending' },
  { key: 'COMPLETED', label: 'au.tab.done' },
  { key: '', label: 'a.all' },
] as const;

export default function Audits() {
  const { t, lang } = useI18n();
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
      <TopBar title={t('au.title')} subtitle={t('au.subtitle')} />
      <div className="admin-content">
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
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
              {t(tab.label)}
            </button>
          ))}
        </div>

        <div className="filters">
          <div className="filter-row">
            <div className="field grow">
              <label>{t('a.search')}</label>
              <input
                defaultValue={params.get('q') ?? ''}
                placeholder={t('au.search.ph')}
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
              <span className="hint">{t('a.search.enter')}</span>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title={t('au.empty')} hint={t('au.empty.hint')} />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t('au.detail')}</th>
                      <th>{t('a.company')}</th>
                      <th>{t('a.type')}</th>
                      <th>{t('au.auditor')}</th>
                      <th>{t('au.planned.col')}</th>
                      <th>{t('a.status')}</th>
                      <th>{t('a.score')}</th>
                      <th>{t('a.note')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/yonetim/denetimler/${row.id}`} className="mono" style={{ fontWeight: 600 }}>
                            {row.audit_no}
                          </Link>
                          {row.method && <div className="small muted">{label(AUDIT_METHOD, row.method, lang)}</div>}
                        </td>
                        <td>
                          <Link to={`/yonetim/denetimler/${row.id}`} className="company">
                            {row.company_name ?? '—'}
                          </Link>
                          <div className="ref">{row.supplier_code ?? row.ref_no ?? ''}</div>
                        </td>
                        <td className="small">{row.type in TYPE_KEY ? t(TYPE_KEY[row.type as keyof typeof TYPE_KEY]) : row.type}</td>
                        <td className="small">{row.auditor_name ?? <span className="muted">{t('au.not.assigned')}</span>}</td>
                        <td className="tight small">{formatDate(row.planned_date, false, lang)}</td>
                        <td className="tight">
                          <Badge tone={tone(AUDIT_STATUS, row.status)}>{label(AUDIT_STATUS, row.status, lang)}</Badge>
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
