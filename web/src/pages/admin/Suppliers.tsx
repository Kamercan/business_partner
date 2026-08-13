import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { Badge, EmptyState, Grade, Loading, Pagination, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { categoryNames, useMeta } from '../../hooks/useMeta';
import { SUPPLIER_STATUS, formatDate, label, tone } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Row = {
  id: number;
  supplier_code: string;
  company_name: string;
  tax_id: string;
  country: string;
  city: string | null;
  email: string;
  grade: string | null;
  status: string;
  categories: string;
  open_ncrs: number;
  active_contracts: number;
  next_audit_due: string | null;
  otd_percent: number | null;
  ppm: number | null;
};

export default function Suppliers() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const meta = useMeta();
  const { t, lang, pick } = useI18n();
  const [data, setData] = useState<{ rows: Row[]; total: number; page: number; pageCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const catNames = useMemo(() => categoryNames(meta, lang), [meta, lang]);
  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ rows: Row[]; total: number; page: number; pageCount: number }>(`/admin/suppliers${qs(query)}`)
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [query]);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const toggleCat = (code: string) => {
    const current = (params.get('category') ?? '').split(',').filter(Boolean);
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    update({ category: next.length ? next.join(',') : undefined });
  };

  return (
    <>
      <TopBar
        title={t('su.title')}
        subtitle={t('su.subtitle')}
        actions={
          <button
            className="btn"
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await api.download(`/admin/suppliers/export${qs(query)}`, 'onayli-tedarikciler.xlsx');
                toast.push(t('a.excel.ok'), 'ok');
              } catch (err) {
                toast.push(err instanceof ApiError ? err.message : t('a.excel.failed'), 'error');
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? <span className="spinner" /> : '⤓'} Excel'e aktar
          </button>
        }
      />

      <div className="admin-content">
        <div className="filters">
          <div className="filter-row">
            <div className="field grow">
              <label>{t('a.search')}</label>
              <input
                defaultValue={params.get('q') ?? ''}
                placeholder={t('su.search.ph')}
                onKeyDown={(e) => e.key === 'Enter' && update({ q: (e.target as HTMLInputElement).value || undefined })}
              />
            </div>
            <div className="field">
              <label>{t('a.grade')}</label>
              <select value={params.get('grade') ?? ''} onChange={(e) => update({ grade: e.target.value || undefined })}>
                <option value="">{t('a.all')}</option>
                {['A', 'B', 'C', 'D'].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('a.status')}</label>
              <select value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
                <option value="">{t('a.all')}</option>
                {Object.keys(SUPPLIER_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {label(SUPPLIER_STATUS, s, lang)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small muted" style={{ marginBottom: 5 }}>
              {t('a.category')}
            </div>
            <div className="filter-chips">
              {meta?.categories.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`filter-chip ${(params.get('category') ?? '').split(',').includes(c.code) ? 'on' : ''}`}
                  onClick={() => toggleCat(c.code)}
                >
                  {pick(c)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title={t('su.empty')} hint={t('su.empty.hint')} />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t('a.supplier')}</th>
                      <th>{t('a.categories')}</th>
                      <th>{t('a.note')}</th>
                      <th>{t('a.status')}</th>
                      <th>{t('su.otd.col')}</th>
                      <th>{t('su.ppm.col')}</th>
                      <th>{t('su.contract')}</th>
                      <th>{t('su.open.ncr')}</th>
                      <th>{t('su.next.audit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/yonetim/tedarikciler/${row.id}`} className="company">
                            {row.company_name}
                          </Link>
                          <div className="ref">
                            {row.supplier_code} · {row.city ?? ''} {row.country.toUpperCase()}
                          </div>
                        </td>
                        <td>
                          <div className="cat-tags">
                            {row.categories
                              .split(',')
                              .filter(Boolean)
                              .map((c) => (
                                <span className="cat-tag" key={c}>
                                  {catNames[c] ?? c}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td>
                          <Grade grade={row.grade} />
                        </td>
                        <td className="tight">
                          <Badge tone={tone(SUPPLIER_STATUS, row.status)}>{label(SUPPLIER_STATUS, row.status, lang)}</Badge>
                        </td>
                        <td className="tight small">{row.otd_percent !== null ? `%${row.otd_percent}` : '—'}</td>
                        <td className="tight small">{row.ppm !== null ? row.ppm : '—'}</td>
                        <td className="tight small">{row.active_contracts}</td>
                        <td className="tight">
                          {row.open_ncrs > 0 ? (
                            <span className="badge badge-danger">{row.open_ncrs}</span>
                          ) : (
                            <span className="small muted">—</span>
                          )}
                        </td>
                        <td className="tight small">{formatDate(row.next_audit_due, false, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && (
                <Pagination page={data.page} pageCount={data.pageCount} total={data.total} onChange={(p) => update({ page: String(p) })} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
