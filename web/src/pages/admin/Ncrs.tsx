import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, EmptyState, Loading, Modal, Pagination, useToast } from '../../components/ui';
import { NCR_CATEGORY, NCR_SEVERITY, NCR_STATUS, formatDate, label, tone } from '../../lib/labels';
import { useI18n } from '../../i18n';
import { TopBar } from './AdminLayout';

type Row = {
  id: number;
  ncr_no: string;
  supplier_id: number;
  company_name: string;
  supplier_code: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  part_no: string | null;
  due_date: string | null;
  detected_at: string | null;
  is_overdue: number;
  document_count: number;
};

const EMPTY = {
  supplier_id: '',
  title: '',
  category: 'PRODUCT',
  severity: 'MAJOR',
  description: '',
  part_no: '',
  qty_affected: '',
  detected_at: new Date().toISOString().slice(0, 10),
  due_date: '',
  notify: true,
};

export default function Ncrs() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { can, readOnly } = useAuth();

  const [data, setData] = useState<{ rows: Row[]; total: number; page: number; pageCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; company_name: string; supplier_code: string }>>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);

  const load = () => {
    setLoading(true);
    api
      .get<{ rows: Row[]; total: number; page: number; pageCount: number }>(`/admin/ncrs${qs(query)}`)
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(load, [params]);

  useEffect(() => {
    api
      .get<{ rows: Array<{ id: number; company_name: string; supplier_code: string }> }>('/admin/suppliers?pageSize=200')
      .then((d) => setSuppliers(d.rows))
      .catch(() => undefined);
  }, []);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  async function create() {
    setBusy(true);
    try {
      await api.post('/admin/ncrs', {
        supplier_id: Number(form.supplier_id),
        title: form.title,
        category: form.category,
        severity: form.severity,
        description: form.description,
        part_no: form.part_no || undefined,
        qty_affected: form.qty_affected === '' ? undefined : Number(form.qty_affected),
        detected_at: form.detected_at || undefined,
        due_date: form.due_date || undefined,
        notify: form.notify,
      });
      toast.push(t('nc.created'), 'ok');
      setModal(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.create.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title={t('nc.title')}
        subtitle={t('nc.subtitle')}
        actions={
          !readOnly &&
          // Uygunsuzluk kalite biriminin alanıdır; satınalma yalnızca görür.
          can('QUALITY') && (
            <button className="btn btn-primary" onClick={() => setModal(true)} type="button">
              {t('nc.new')}
            </button>
          )
        }
      />

      <div className="admin-content">
        <div className="filters">
          <div className="filter-row">
            <div className="field grow">
              <label>{t('a.search')}</label>
              <input
                defaultValue={params.get('q') ?? ''}
                placeholder={t('nc.search.ph')}
                onKeyDown={(e) => e.key === 'Enter' && update({ q: (e.target as HTMLInputElement).value || undefined })}
              />
            </div>
            <div className="field">
              <label>{t('a.status')}</label>
              <select value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
                <option value="">{t('a.all')}</option>
                {Object.keys(NCR_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {label(NCR_STATUS, s, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('nc.severity')}</label>
              <select value={params.get('severity') ?? ''} onChange={(e) => update({ severity: e.target.value || undefined })}>
                <option value="">{t('a.all')}</option>
                {Object.keys(NCR_SEVERITY).map((s) => (
                  <option key={s} value={s}>
                    {label(NCR_SEVERITY, s, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button
                type="button"
                className={`filter-chip ${params.get('overdue') ? 'on' : ''}`}
                style={{ padding: '9px 14px' }}
                onClick={() => update({ overdue: params.get('overdue') ? undefined : 'true' })}
              >
                {t('nc.overdue.only')}
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title={t('nc.empty')} />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t('nc.report')}</th>
                      <th>{t('a.supplier')}</th>
                      <th>{t('nc.category')}</th>
                      <th>{t('nc.severity')}</th>
                      <th>{t('a.status')}</th>
                      <th>{t('nc.detected')}</th>
                      <th>{t('nc.due.col')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/yonetim/uygunsuzluklar/${row.id}`} className="company">
                            {row.title}
                          </Link>
                          <div className="ref">
                            {row.ncr_no}
                            {row.part_no && ` · ${row.part_no}`}
                          </div>
                        </td>
                        <td>
                          <Link to={`/yonetim/tedarikciler/${row.supplier_id}`}>{row.company_name}</Link>
                        </td>
                        <td className="small">{label(NCR_CATEGORY, row.category, lang)}</td>
                        <td className="tight">
                          <Badge tone={tone(NCR_SEVERITY, row.severity)}>{label(NCR_SEVERITY, row.severity, lang)}</Badge>
                        </td>
                        <td className="tight">
                          <Badge tone={tone(NCR_STATUS, row.status)}>{label(NCR_STATUS, row.status, lang)}</Badge>
                        </td>
                        <td className="tight small">{formatDate(row.detected_at, false, lang)}</td>
                        <td className="tight small">
                          {formatDate(row.due_date, false, lang)}
                          {row.is_overdue === 1 && (
                            <div className="badge badge-danger" style={{ marginTop: 3 }}>
                              {t('a.overdue')}
                            </div>
                          )}
                        </td>
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

      {modal && (
        <Modal
          title={t('nc.new.title')}
          subtitle={t('nc.new.hint')}
          onClose={() => setModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={create}
                  disabled={busy || !form.supplier_id || form.title.length < 3 || form.description.length < 10}
                  type="button"
                >
                  {busy && <span className="spinner" />} {t('nc.create.send')}
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>
                {t('a.supplier')} <span className="req">*</span>
              </label>
              <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">{t('a.choose')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name} ({s.supplier_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Konu <span className="req">*</span>
              </label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('nc.title.ph')} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>{t('nc.category')}</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {Object.keys(NCR_CATEGORY).map((c) => (
                    <option key={c} value={c}>
                      {label(NCR_CATEGORY, c, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('nc.severity.label')}</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {Object.keys(NCR_SEVERITY).map((s) => (
                    <option key={s} value={s}>
                      {label(NCR_SEVERITY, s, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('nc.part')}</label>
                <input value={form.part_no} onChange={(e) => setForm({ ...form, part_no: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('nc.affected')}</label>
                <input type="number" min="0" value={form.qty_affected} onChange={(e) => setForm({ ...form, qty_affected: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('nc.detected.date')}</label>
                <input type="date" value={form.detected_at} onChange={(e) => setForm({ ...form, detected_at: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('nc.due.label')}</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                <span className="hint">{t('nc.due.hint')}</span>
              </div>
            </div>
            <div className="field">
              <label>
                {t('nc.description')} <span className="req">*</span>
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('nc.description.ph')}
              />
            </div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
              {t('nc.notify')}
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
