import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, EmptyState, Loading, Modal, Pagination, useToast } from '../../components/ui';
import { NCR_CATEGORY, NCR_SEVERITY, NCR_STATUS, formatDate, label, tone } from '../../lib/labels';
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
      toast.push('Uygunsuzluk raporu açıldı ve tedarikçiye iletildi.', 'ok');
      setModal(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Oluşturulamadı.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title="Uygunsuzluk Raporları (NCR)"
        subtitle="Tedarikçi kaynaklı uygunsuzlukların 8D takibi"
        actions={
          !readOnly &&
          can('QUALITY', 'MODERATOR') && (
            <button className="btn btn-primary" onClick={() => setModal(true)} type="button">
              + Yeni uygunsuzluk
            </button>
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
                placeholder="Konu, rapor no, firma veya parça no"
                onKeyDown={(e) => e.key === 'Enter' && update({ q: (e.target as HTMLInputElement).value || undefined })}
              />
            </div>
            <div className="field">
              <label>Durum</label>
              <select value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
                <option value="">Tümü</option>
                {Object.keys(NCR_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {label(NCR_STATUS, s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Önem</label>
              <select value={params.get('severity') ?? ''} onChange={(e) => update({ severity: e.target.value || undefined })}>
                <option value="">Tümü</option>
                {Object.keys(NCR_SEVERITY).map((s) => (
                  <option key={s} value={s}>
                    {label(NCR_SEVERITY, s)}
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
                Yalnızca gecikmişler
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          {loading && !data ? (
            <Loading />
          ) : data && data.rows.length === 0 ? (
            <EmptyState title="Uygunsuzluk kaydı yok" />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Rapor</th>
                      <th>Tedarikçi</th>
                      <th>Kategori</th>
                      <th>Önem</th>
                      <th>Durum</th>
                      <th>Tespit</th>
                      <th>Termin</th>
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
                        <td className="small">{label(NCR_CATEGORY, row.category)}</td>
                        <td className="tight">
                          <Badge tone={tone(NCR_SEVERITY, row.severity)}>{label(NCR_SEVERITY, row.severity)}</Badge>
                        </td>
                        <td className="tight">
                          <Badge tone={tone(NCR_STATUS, row.status)}>{label(NCR_STATUS, row.status)}</Badge>
                        </td>
                        <td className="tight small">{formatDate(row.detected_at)}</td>
                        <td className="tight small">
                          {formatDate(row.due_date)}
                          {row.is_overdue === 1 && (
                            <div className="badge badge-danger" style={{ marginTop: 3 }}>
                              gecikmiş
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
          title="Yeni uygunsuzluk raporu"
          subtitle="Tedarikçiye 8D formatında düzeltici faaliyet talebi gönderilir."
          onClose={() => setModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setModal(false)} type="button">
                  Vazgeç
                </button>
                <button
                  className="btn btn-primary"
                  onClick={create}
                  disabled={busy || !form.supplier_id || form.title.length < 3 || form.description.length < 10}
                  type="button"
                >
                  {busy && <span className="spinner" />} Oluştur ve gönder
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
                Konu <span className="req">*</span>
              </label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Hidrolik silindir mil yüzeyinde çizik" />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Kategori</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {Object.keys(NCR_CATEGORY).map((c) => (
                    <option key={c} value={c}>
                      {label(NCR_CATEGORY, c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Önem derecesi</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {Object.keys(NCR_SEVERITY).map((s) => (
                    <option key={s} value={s}>
                      {label(NCR_SEVERITY, s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Parça no</label>
                <input value={form.part_no} onChange={(e) => setForm({ ...form, part_no: e.target.value })} />
              </div>
              <div className="field">
                <label>Etkilenen adet</label>
                <input type="number" min="0" value={form.qty_affected} onChange={(e) => setForm({ ...form, qty_affected: e.target.value })} />
              </div>
              <div className="field">
                <label>Tespit tarihi</label>
                <input type="date" value={form.detected_at} onChange={(e) => setForm({ ...form, detected_at: e.target.value })} />
              </div>
              <div className="field">
                <label>Cevap termini</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                <span className="hint">Boş bırakılırsa varsayılan SLA uygulanır.</span>
              </div>
            </div>
            <div className="field">
              <label>
                Uygunsuzluk tanımı <span className="req">*</span>
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Tespit edilen uygunsuzluğun detayı, hangi kontrolde bulunduğu, etkisi..."
              />
            </div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
              Tedarikçiye cevap bağlantısı içeren e-posta gönder
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
