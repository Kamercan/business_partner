import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, EmptyState, Grade, Loading, Pagination, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { categoryNames, useMeta } from '../../hooks/useMeta';
import { APPLICATION_STATUS, SOURCE, formatDate, label, relativeDays, tone } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Row = {
  id: number;
  ref_no: string;
  company_name: string;
  tax_id: string;
  sector: string;
  country: string;
  city: string;
  contact_name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  completeness: number;
  duplicate_of: number | null;
  assignee_name: string | null;
  created_at: string;
  categories: string;
  certifications: string;
  document_count: number;
  grade: string | null;
};

type ListResponse = { rows: Row[]; total: number; page: number; pageCount: number };

const STATUS_GROUPS = [
  { key: 'NEW,IN_REVIEW,NEEDS_INFO', label: 'Değerlendirme bekleyen' },
  { key: 'AUDIT_PENDING,AUDIT_PLANNED,AUDIT_IN_PROGRESS,AUDIT_DONE', label: 'Denetim sürecinde' },
  { key: 'APPROVED', label: 'Onaylı' },
  { key: 'ON_HOLD', label: 'Beklemede' },
  { key: 'REJECTED,DISQUALIFIED', label: 'Olumsuz' },
];

export default function Applications() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const meta = useMeta();
  const { lang } = useI18n();
  const { can } = useAuth();

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const catNames = useMemo(() => categoryNames(meta, lang), [meta, lang]);

  /** URL parametreleri tek doğruluk kaynağı — filtre paylaşılabilir/yer imlenebilir. */
  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => {
        if (!v) next.delete(k);
        else next.set(k, v);
      });
      if (!('page' in patch)) next.delete('page');
      setParams(next);
    },
    [params, setParams],
  );

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    api
      .get<ListResponse>(`/admin/applications${qs({ ...query, pageSize: 25 })}`, controller.signal)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError) toast.push(err.message, 'error');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, toast]);

  // Arama kutusu için gecikmeli güncelleme
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (params.get('q') ?? '')) update({ q: search || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleCsv = (key: string, value: string) => {
    const current = (params.get(key) ?? '').split(',').filter(Boolean);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    update({ [key]: next.length ? next.join(',') : undefined });
  };

  const isOn = (key: string, value: string) => (params.get(key) ?? '').split(',').includes(value);

  async function exportExcel() {
    setExporting(true);
    try {
      await api.download(`/admin/applications/export${qs(query)}`, 'tedarikci-basvurulari.xlsx');
      toast.push('Excel dosyası indirildi.', 'ok');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Dışa aktarım başarısız.', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function bulkStatus(status: string) {
    if (selected.length === 0) return;
    try {
      const res = await api.post<{ updated: number; results: Array<{ ok: boolean; error?: string }> }>(
        '/admin/applications/bulk-status',
        { ids: selected, status },
      );
      const failed = res.results.filter((r) => !r.ok).length;
      toast.push(`${res.updated} başvuru güncellendi${failed ? `, ${failed} atlandı` : ''}.`, failed ? 'info' : 'ok');
      setSelected([]);
      update({});
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Toplu işlem başarısız.', 'error');
    }
  }

  const activeFilters: Array<{ key: string; text: string }> = [];
  if (params.get('q')) activeFilters.push({ key: 'q', text: `Arama: ${params.get('q')}` });
  (params.get('category') ?? '').split(',').filter(Boolean).forEach((c) =>
    activeFilters.push({ key: `category:${c}`, text: catNames[c] ?? c }),
  );
  (params.get('cert') ?? '').split(',').filter(Boolean).forEach((c) =>
    activeFilters.push({ key: `cert:${c}`, text: meta?.certifications.find((x) => x.code === c)?.name ?? c }),
  );
  (params.get('status') ?? '').split(',').filter(Boolean).forEach((s) =>
    activeFilters.push({ key: `status:${s}`, text: label(APPLICATION_STATUS, s) }),
  );
  if (params.get('country')) activeFilters.push({ key: 'country', text: `Ülke: ${params.get('country')!.toUpperCase()}` });
  if (params.get('source')) activeFilters.push({ key: 'source', text: `Kaynak: ${label(SOURCE, params.get('source')!)}` });

  const removeFilter = (key: string) => {
    if (key.includes(':')) {
      const [group, value] = key.split(':');
      toggleCsv(group, value);
    } else {
      if (key === 'q') setSearch('');
      update({ [key]: undefined });
    }
  };

  return (
    <>
      <TopBar
        title="Başvuru Havuzu"
        subtitle="Tüm kanallardan gelen tedarikçi başvuruları"
        actions={
          <>
            <button className="btn" onClick={exportExcel} disabled={exporting} type="button">
              {exporting ? <span className="spinner" /> : '⤓'} Excel'e aktar
            </button>
            {can('MODERATOR') && (
              <Link className="btn" to="/yonetim/ice-aktar">
                Liste içe aktar
              </Link>
            )}
          </>
        }
      />

      <div className="admin-content">
        {/* ------------------------------ Filtreler ------------------------------ */}
        <div className="filters">
          <div className="filter-row">
            <div className="field grow">
              <label>Arama</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Firma adı, referans no, e-posta, vergi no, şehir, referanslar..."
              />
            </div>
            <div className="field">
              <label>Ülke</label>
              <select value={params.get('country') ?? ''} onChange={(e) => update({ country: e.target.value || undefined })}>
                <option value="">Tümü</option>
                {meta?.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {lang === 'tr' ? c.tr : c.en}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Kaynak</label>
              <select value={params.get('source') ?? ''} onChange={(e) => update({ source: e.target.value || undefined })}>
                <option value="">Tümü</option>
                {meta?.sources.map((s) => (
                  <option key={s} value={s}>
                    {label(SOURCE, s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Sıralama</label>
              <select
                value={`${params.get('sort') ?? 'created_at'}:${params.get('dir') ?? 'desc'}`}
                onChange={(e) => {
                  const [sort, dir] = e.target.value.split(':');
                  update({ sort, dir });
                }}
              >
                <option value="created_at:desc">En yeni</option>
                <option value="created_at:asc">En eski</option>
                <option value="company_name:asc">Firma adı (A-Z)</option>
                <option value="completeness:desc">Doluluk (yüksek)</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small muted" style={{ marginBottom: 5 }}>
              Ürün grubu
            </div>
            <div className="filter-chips">
              {meta?.categories.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`filter-chip ${isOn('category', c.code) ? 'on' : ''}`}
                  onClick={() => toggleCsv('category', c.code)}
                >
                  {lang === 'tr' ? c.name_tr : c.name_en}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div className="small muted" style={{ marginBottom: 5 }}>
              Kalite sertifikası (seçilenlerin tümüne sahip olanlar)
            </div>
            <div className="filter-chips">
              {meta?.certifications.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`filter-chip ${isOn('cert', c.code) ? 'on' : ''}`}
                  onClick={() => toggleCsv('cert', c.code)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div className="small muted" style={{ marginBottom: 5 }}>
              Durum
            </div>
            <div className="filter-chips">
              {STATUS_GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`filter-chip ${params.get('status') === g.key ? 'on' : ''}`}
                  onClick={() => update({ status: params.get('status') === g.key ? undefined : g.key })}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="active-filters">
              <span className="small muted">Aktif filtreler:</span>
              {activeFilters.map((f) => (
                <span className="active-filter" key={f.key}>
                  {f.text}
                  <button type="button" onClick={() => removeFilter(f.key)} aria-label="Filtreyi kaldır">
                    ×
                  </button>
                </span>
              ))}
              <button
                className="small"
                type="button"
                style={{ border: 'none', background: 'none', color: 'var(--brand)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => {
                  setSearch('');
                  setParams(new URLSearchParams());
                }}
              >
                tümünü temizle
              </button>
            </div>
          )}
        </div>

        {/* ---------------------------- Toplu işlemler --------------------------- */}
        {selected.length > 0 && can('MODERATOR') && (
          <div className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
            <div className="row-between wrap">
              <strong className="small">{selected.length} başvuru seçildi</strong>
              <div className="row wrap">
                <button className="btn btn-sm" onClick={() => bulkStatus('IN_REVIEW')} type="button">
                  İncelemeye al
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => bulkStatus('AUDIT_PENDING')} type="button">
                  Kaliteye gönder
                </button>
                <button className="btn btn-sm" onClick={() => bulkStatus('ON_HOLD')} type="button">
                  Beklemeye al
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => bulkStatus('REJECTED')} type="button">
                  Reddet
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setSelected([])} type="button">
                  Seçimi temizle
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------- Tablo -------------------------------- */}
        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title="Kayıt bulunamadı" hint="Filtreleri gevşetmeyi deneyin." />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      {can('MODERATOR') && (
                        <th style={{ width: 34 }}>
                          <input
                            type="checkbox"
                            checked={!!data && selected.length === data.rows.length && data.rows.length > 0}
                            onChange={(e) => setSelected(e.target.checked ? (data?.rows ?? []).map((r) => r.id) : [])}
                            aria-label="Tümünü seç"
                          />
                        </th>
                      )}
                      <th>Firma</th>
                      <th>Ürün grupları</th>
                      <th>Sertifikalar</th>
                      <th>Konum</th>
                      <th>Durum</th>
                      <th>Not</th>
                      <th>Doluluk</th>
                      <th>Kaynak</th>
                      <th>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((row) => (
                      <tr key={row.id}>
                        {can('MODERATOR') && (
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.includes(row.id)}
                              onChange={(e) =>
                                setSelected((prev) => (e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)))
                              }
                              aria-label={`${row.company_name} seç`}
                            />
                          </td>
                        )}
                        <td>
                          <Link to={`/yonetim/basvurular/${row.id}`} className="company">
                            {row.company_name}
                          </Link>
                          {row.duplicate_of && (
                            <span className="badge badge-warn" style={{ marginLeft: 6 }} title="Olası mükerrer kayıt">
                              mükerrer?
                            </span>
                          )}
                          <div className="ref">
                            {row.ref_no} · {row.contact_name}
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
                          <div className="cat-tags">
                            {row.certifications
                              .split(',')
                              .filter(Boolean)
                              .map((c) => (
                                <span className="cat-tag" key={c}>
                                  {meta?.certifications.find((x) => x.code === c)?.name ?? c}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td className="tight">
                          {row.city}
                          <div className="small muted">{row.country.toUpperCase()}</div>
                        </td>
                        <td className="tight">
                          <Badge tone={tone(APPLICATION_STATUS, row.status)}>{label(APPLICATION_STATUS, row.status)}</Badge>
                        </td>
                        <td>
                          <Grade grade={row.grade} />
                        </td>
                        <td className="tight">
                          <div className="row" style={{ gap: 7 }}>
                            <span className="progress-bar">
                              <span style={{ width: `${row.completeness}%` }} />
                            </span>
                            <span className="small muted">{row.completeness}</span>
                          </div>
                          <div className="small muted">{row.document_count} belge</div>
                        </td>
                        <td className="tight small">{label(SOURCE, row.source)}</td>
                        <td className="tight small">
                          {formatDate(row.created_at)}
                          <div className="muted">{relativeDays(row.created_at)}</div>
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
                  onChange={(p) => update({ page: String(p) })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
