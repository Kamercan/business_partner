import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, EmptyState, FileSlot, Loading, Modal, Pagination, useToast } from '../../components/ui';
import { CONTRACT_STATUS, CONTRACT_TYPE, formatDate, formatMoney, label, tone } from '../../lib/labels';
import { useI18n } from '../../i18n';
import { TopBar } from './AdminLayout';

type Row = {
  id: number;
  contract_no: string;
  supplier_id: number;
  company_name: string;
  supplier_code: string;
  title: string;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  value: number | null;
  owner_name: string | null;
  document_count: number;
  expiry_flag: number;
  days_remaining: number | null;
};

const EMPTY_FORM = {
  supplier_id: '',
  title: '',
  type: 'FRAMEWORK',
  status: 'DRAFT',
  start_date: '',
  end_date: '',
  currency: 'EUR',
  value: '',
  renewal_notice_days: '60',
  notes: '',
};

export default function ContractsPage() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can, readOnly } = useAuth();

  const [data, setData] = useState<{ rows: Row[]; total: number; page: number; pageCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; company_name: string; supplier_code: string }>>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  /** Sözleşme dosyası oluşturma anında eklenebilir. */
  const [files, setFiles] = useState<File[] | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);

  const load = () => {
    setLoading(true);
    api
      .get<{ rows: Row[]; total: number; page: number; pageCount: number }>(`/admin/contracts${qs(query)}`)
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
      const created = await api.post<{ id: number }>('/admin/contracts', {
        supplier_id: Number(form.supplier_id),
        title: form.title,
        type: form.type,
        status: form.status,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        currency: form.currency,
        value: form.value === '' ? null : Number(form.value),
        renewal_notice_days: Number(form.renewal_notice_days),
        notes: form.notes || undefined,
      });

      /**
       * Sözleşme dosyası formda seçildiyse kayıt açılır açılmaz yüklenir.
       * Belge yükleme sözleşmenin id'sini gerektirdiği için iki adımdır;
       * kullanıcı açısından tek işlemdir. Yükleme başarısız olursa sözleşme
       * yine de oluşmuştur — dosya detay sayfasından eklenebilir.
       */
      if (files?.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        fd.append('owner_type', 'CONTRACT');
        fd.append('owner_id', String(created.id));
        fd.append('kind', 'CONTRACT_FILE');
        fd.append('visibility', 'INTERNAL');
        try {
          await api.upload('/admin/documents', fd);
        } catch (err) {
          toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error');
        }
      }

      toast.push(t('co.created'), 'ok');
      setModal(false);
      setForm(EMPTY_FORM);
      setFiles(null);
      // Yeni sözleşmenin sayfasına geç: belge ekleme ve düzenleme oradadır.
      navigate(`/yonetim/sozlesmeler/${created.id}`);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.create.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function scanExpiring() {
    try {
      const res = await api.post<{ scanned: number; tasks: number; expired: number }>('/admin/contracts/scan-expiring');
      toast.push(t('co.scan.result', { scanned: res.scanned, tasks: res.tasks, expired: res.expired }), 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('co.scan.failed'), 'error');
    }
  }

  return (
    <>
      <TopBar
        title={t('co.title')}
        subtitle={t('co.subtitle')}
        actions={
          !readOnly && (
            <>
              <button className="btn" onClick={scanExpiring} type="button">
                {t('co.scan')}
              </button>
              {can('MODERATOR') && (
                <button className="btn btn-primary" onClick={() => setModal(true)} type="button">
                  {t('co.new')}
                </button>
              )}
            </>
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
                placeholder={t('co.search.ph')}
                onKeyDown={(e) => e.key === 'Enter' && update({ q: (e.target as HTMLInputElement).value || undefined })}
              />
            </div>
            <div className="field">
              <label>{t('a.type')}</label>
              <select value={params.get('type') ?? ''} onChange={(e) => update({ type: e.target.value || undefined })}>
                <option value="">{t('a.all')}</option>
                {Object.keys(CONTRACT_TYPE).map((t) => (
                  <option key={t} value={t}>
                    {label(CONTRACT_TYPE, t, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('a.status')}</label>
              <select value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
                <option value="">{t('a.all')}</option>
                {Object.keys(CONTRACT_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {label(CONTRACT_STATUS, s, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button
                type="button"
                className={`filter-chip ${params.get('expiring') ? 'on' : ''}`}
                style={{ padding: '9px 14px' }}
                onClick={() => update({ expiring: params.get('expiring') ? undefined : 'true' })}
              >
                {t('co.expiring.only')}
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title={t('co.empty')} hint={t('co.empty.hint')} />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t('su.contract')}</th>
                      <th>{t('a.supplier')}</th>
                      <th>{t('a.type')}</th>
                      <th>{t('a.status')}</th>
                      <th>{t('co.start')}</th>
                      <th>{t('co.end')}</th>
                      <th>{t('co.value')}</th>
                      <th>{t('a.owner')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link className="company" to={`/yonetim/sozlesmeler/${row.id}`}>
                            {row.title}
                          </Link>
                          <div className="ref">
                            {row.contract_no}
                            {row.document_count > 0 && ` · ${row.document_count} ${t('co.doc.count')}`}
                          </div>
                        </td>
                        <td>
                          <Link to={`/yonetim/tedarikciler/${row.supplier_id}`}>{row.company_name}</Link>
                          <div className="ref">{row.supplier_code}</div>
                        </td>
                        <td className="small">{label(CONTRACT_TYPE, row.type, lang)}</td>
                        <td className="tight">
                          <Badge tone={tone(CONTRACT_STATUS, row.status)}>{label(CONTRACT_STATUS, row.status, lang)}</Badge>
                        </td>
                        <td className="tight small">{formatDate(row.start_date, false, lang)}</td>
                        <td className="tight small">
                          {formatDate(row.end_date, false, lang)}
                          {row.expiry_flag === 1 && (
                            <div className="badge badge-warn" style={{ marginTop: 3 }}>
                              {t('co.days.left', { n: row.days_remaining ?? 0 })}
                            </div>
                          )}
                          {row.expiry_flag === 2 && (
                            <div className="badge badge-danger" style={{ marginTop: 3 }}>
                              {t('co.expired')}
                            </div>
                          )}
                        </td>
                        <td className="tight small">{formatMoney(row.value, row.currency, lang)}</td>
                        <td className="small">{row.owner_name ?? '—'}</td>
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
          title={t('co.new.title')}
          onClose={() => setModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button className="btn btn-primary" onClick={create} disabled={busy || !form.supplier_id || form.title.length < 3} type="button">
                  {busy && <span className="spinner" />} {t('co.create')}
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
                {t('co.title.field')} <span className="req">*</span>
              </label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('co.title.ph')} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>{t('a.type')}</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.keys(CONTRACT_TYPE).map((t) => (
                    <option key={t} value={t}>
                      {label(CONTRACT_TYPE, t, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('a.status')}</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.keys(CONTRACT_STATUS).map((s) => (
                    <option key={s} value={s}>
                      {label(CONTRACT_STATUS, s, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('co.start')}</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('co.end')}</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('co.value')}</label>
                <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('co.currency')}</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="TRY">TRY</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>{t('co.reminder')}</label>
              <input
                type="number"
                value={form.renewal_notice_days}
                onChange={(e) => setForm({ ...form, renewal_notice_days: e.target.value })}
              />
              <span className="hint">{t('co.reminder.hint')}</span>
            </div>
            <div className="field">
              <label>{t('co.notes')}</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {/* İmzalı sözleşme ve ekleri kayıt açılırken eklenebilir. */}
            <FileSlot
              title={t('co.upload.now')}
              meta={t('co.upload.now.meta')}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
              multiple
              file={files}
              onSelect={setFiles}
              labels={{ required: t('up.required'), optional: t('up.optional'), remove: t('up.remove') }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
