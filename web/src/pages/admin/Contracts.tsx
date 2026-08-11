import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, EmptyState, Loading, Modal, Pagination, useToast } from '../../components/ui';
import { CONTRACT_STATUS, CONTRACT_TYPE, formatDate, formatMoney, label, tone } from '../../lib/labels';
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
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { can, readOnly } = useAuth();

  const [data, setData] = useState<{ rows: Row[]; total: number; page: number; pageCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; company_name: string; supplier_code: string }>>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
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
      await api.post('/admin/contracts', {
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
      toast.push('Sözleşme oluşturuldu.', 'ok');
      setModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Oluşturulamadı.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function scanExpiring() {
    try {
      const res = await api.post<{ scanned: number; tasks: number; expired: number }>('/admin/contracts/scan-expiring');
      toast.push(`${res.scanned} sözleşme tarandı, ${res.tasks} yenileme görevi açıldı, ${res.expired} kayıt süresi doldu olarak işaretlendi.`, 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Tarama başarısız.', 'error');
    }
  }

  return (
    <>
      <TopBar
        title="Sözleşmeler"
        subtitle="Gizlilik, çerçeve ve kalite anlaşmalarının takibi"
        actions={
          !readOnly && (
            <>
              <button className="btn" onClick={scanExpiring} type="button">
                Süresi yaklaşanları tara
              </button>
              {can('MODERATOR') && (
                <button className="btn btn-primary" onClick={() => setModal(true)} type="button">
                  + Yeni sözleşme
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
              <label>Arama</label>
              <input
                defaultValue={params.get('q') ?? ''}
                placeholder="Sözleşme başlığı, no veya firma"
                onKeyDown={(e) => e.key === 'Enter' && update({ q: (e.target as HTMLInputElement).value || undefined })}
              />
            </div>
            <div className="field">
              <label>Tür</label>
              <select value={params.get('type') ?? ''} onChange={(e) => update({ type: e.target.value || undefined })}>
                <option value="">Tümü</option>
                {Object.keys(CONTRACT_TYPE).map((t) => (
                  <option key={t} value={t}>
                    {label(CONTRACT_TYPE, t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Durum</label>
              <select value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
                <option value="">Tümü</option>
                {Object.keys(CONTRACT_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {label(CONTRACT_STATUS, s)}
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
                Yalnızca süresi yaklaşanlar
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title="Sözleşme yok" hint="Onaylı bir tedarikçi için yeni sözleşme oluşturabilirsiniz." />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Sözleşme</th>
                      <th>Tedarikçi</th>
                      <th>Tür</th>
                      <th>Durum</th>
                      <th>Başlangıç</th>
                      <th>Bitiş</th>
                      <th>Tutar</th>
                      <th>Sorumlu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="company">{row.title}</span>
                          <div className="ref">{row.contract_no}</div>
                        </td>
                        <td>
                          <Link to={`/yonetim/tedarikciler/${row.supplier_id}`}>{row.company_name}</Link>
                          <div className="ref">{row.supplier_code}</div>
                        </td>
                        <td className="small">{label(CONTRACT_TYPE, row.type)}</td>
                        <td className="tight">
                          <Badge tone={tone(CONTRACT_STATUS, row.status)}>{label(CONTRACT_STATUS, row.status)}</Badge>
                        </td>
                        <td className="tight small">{formatDate(row.start_date)}</td>
                        <td className="tight small">
                          {formatDate(row.end_date)}
                          {row.expiry_flag === 1 && (
                            <div className="badge badge-warn" style={{ marginTop: 3 }}>
                              {row.days_remaining} gün kaldı
                            </div>
                          )}
                          {row.expiry_flag === 2 && (
                            <div className="badge badge-danger" style={{ marginTop: 3 }}>
                              süresi doldu
                            </div>
                          )}
                        </td>
                        <td className="tight small">{formatMoney(row.value, row.currency)}</td>
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
          title="Yeni sözleşme"
          onClose={() => setModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setModal(false)} type="button">
                  Vazgeç
                </button>
                <button className="btn btn-primary" onClick={create} disabled={busy || !form.supplier_id || form.title.length < 3} type="button">
                  {busy && <span className="spinner" />} Oluştur
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>
                Tedarikçi <span className="req">*</span>
              </label>
              <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">Seçiniz...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name} ({s.supplier_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Başlık <span className="req">*</span>
              </label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Çerçeve Tedarik Sözleşmesi" />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Tür</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.keys(CONTRACT_TYPE).map((t) => (
                    <option key={t} value={t}>
                      {label(CONTRACT_TYPE, t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Durum</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.keys(CONTRACT_STATUS).map((s) => (
                    <option key={s} value={s}>
                      {label(CONTRACT_STATUS, s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Başlangıç</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>Bitiş</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div className="field">
                <label>Tutar</label>
                <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="field">
                <label>Para birimi</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="TRY">TRY</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Yenileme hatırlatma süresi (gün)</label>
              <input
                type="number"
                value={form.renewal_notice_days}
                onChange={(e) => setForm({ ...form, renewal_notice_days: e.target.value })}
              />
              <span className="hint">Bitişe bu kadar gün kaldığında yenileme görevi oluşturulur.</span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
