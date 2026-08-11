import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Grade, Loading, Modal, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { categoryNames, useMeta } from '../../hooks/useMeta';
import {
  APPLICATION_STATUS,
  AUDIT_STATUS,
  DOCUMENT_KIND,
  PRIORITY,
  SOURCE,
  formatBytes,
  formatDate,
  label,
  tone,
} from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Detail = {
  id: number;
  ref_no: string;
  company_name: string;
  tax_id: string;
  founded_year: number | null;
  employee_band: string | null;
  revenue_band: string | null;
  website: string | null;
  sector: string;
  sector_other: string | null;
  contact_name: string;
  contact_position: string | null;
  email: string;
  phone: string;
  country: string;
  country_other: string | null;
  city: string;
  address: string | null;
  references_text: string | null;
  about: string | null;
  category_other: string | null;
  kvkk_consent: number;
  consent_version: string | null;
  consent_at: string | null;
  status: string;
  source: string;
  priority: string;
  completeness: number;
  duplicate_of: number | null;
  assigned_to: number | null;
  decision_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  categories: string[];
  certifications: string[];
  documents: Array<{
    id: number; kind: string; original_name: string; size_bytes: number; visibility: string;
    created_at: string; uploaded_by_supplier: number; uploaded_by_name: string | null;
  }>;
  audits: Array<{ id: number; audit_no: string; status: string; planned_date: string | null; score: number | null; grade: string | null; auditor_name: string | null }>;
  notes: Array<{ id: number; body: string; visibility: string; created_at: string; author: string }>;
  supplier: { id: number; supplier_code: string; status: string; grade: string | null } | null;
  duplicates: Array<{ id: number; ref_no: string; company_name: string; status: string; created_at: string }>;
  activity: Array<{ id: number; action: string; actor_label: string; from_value: string | null; to_value: string | null; detail: string | null; created_at: string }>;
  allowedTransitions: string[];
};

const ACTION_LABELS: Record<string, { label: string; variant?: 'primary' | 'danger' }> = {
  IN_REVIEW: { label: 'İncelemeye al' },
  AUDIT_PENDING: { label: 'Onayla → Kaliteye gönder', variant: 'primary' },
  APPROVED: { label: 'Onaylı tedarikçi yap', variant: 'primary' },
  ON_HOLD: { label: 'Beklemeye al' },
  REJECTED: { label: 'Reddet', variant: 'danger' },
  DISQUALIFIED: { label: 'Ele', variant: 'danger' },
  NEEDS_INFO: { label: 'Bilgi bekleniyor işaretle' },
  AUDIT_PLANNED: { label: 'Denetim planlandı' },
  AUDIT_IN_PROGRESS: { label: 'Denetim başladı' },
  AUDIT_DONE: { label: 'Denetim tamamlandı' },
};

const ACTIVITY_LABELS: Record<string, string> = {
  SUBMITTED: 'Başvuru gönderildi',
  CREATED: 'Oluşturuldu',
  IMPORTED: 'İçe aktarıldı',
  STATUS_CHANGED: 'Durum değişti',
  ASSIGNED: 'Sorumlu atandı',
  PRIORITY_CHANGED: 'Öncelik değişti',
  NOTE_ADDED: 'Not eklendi',
  INFO_REQUESTED: 'Ek bilgi talep edildi',
  DOCUMENT_UPLOADED: 'Belge yüklendi',
  DOCUMENT_DOWNLOADED: 'Belge indirildi',
  DOCUMENT_VISIBILITY_CHANGED: 'Belge görünürlüğü değişti',
  SUPPLIER_DOCUMENT_UPLOADED: 'Tedarikçi belge yükledi',
  SUPPLIER_MESSAGE: 'Tedarikçi mesaj gönderdi',
  DUPLICATE_FLAGGED: 'Mükerrer olarak işaretlendi',
  TASK_STATUS_CHANGED: 'Görev durumu değişti',
};

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const { lang } = useI18n();
  const { can, user, readOnly } = useAuth();

  const [data, setData] = useState<Detail | null>(null);
  const [users, setUsers] = useState<Array<{ id: number; full_name: string; role: string }>>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusModal, setStatusModal] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [infoModal, setInfoModal] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  const catNames = categoryNames(meta, lang);
  /** En güncel tamamlanmış denetimin notu — başlıkta özet olarak gösterilir. */
  const latestGrade = data?.audits.find((a) => a.grade)?.grade ?? null;

  const load = useCallback(() => {
    api
      .get<Detail>(`/admin/applications/${id}`)
      .then(setData)
      .catch((err) => toast.push(err instanceof ApiError ? err.message : 'Yüklenemedi.', 'error'));
  }, [id, toast]);

  useEffect(() => {
    load();
    api.get<Array<{ id: number; full_name: string; role: string }>>('/admin/users').then(setUsers).catch(() => undefined);
  }, [load]);

  if (!data) {
    return (
      <>
        <TopBar title="Başvuru" />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  async function changeStatus() {
    if (!statusModal) return;
    setBusy(true);
    try {
      await api.post(`/admin/applications/${id}/status`, {
        status: statusModal,
        note: statusNote || undefined,
        rejection_reason: ['REJECTED', 'DISQUALIFIED'].includes(statusModal) ? statusNote || undefined : undefined,
        notify,
      });
      toast.push('Durum güncellendi ve ilgili birime iletildi.', 'ok');
      setStatusModal(null);
      setStatusNote('');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Güncellenemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/applications/${id}/notes`, { body: note.trim() });
      setNote('');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Not eklenemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function requestInfo() {
    setBusy(true);
    try {
      await api.post(`/admin/applications/${id}/request-info`, { message: infoMessage.trim() });
      toast.push('Bilgi talebi tedarikçiye e-posta ile iletildi.', 'ok');
      setInfoModal(false);
      setInfoMessage('');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Gönderilemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function assign(userId: string) {
    try {
      await api.patch(`/admin/applications/${id}`, { assigned_to: userId ? Number(userId) : null });
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Atama yapılamadı.', 'error');
    }
  }

  return (
    <>
      <TopBar
        title={data.company_name}
        subtitle={`${data.ref_no} · ${formatDate(data.created_at, true)} tarihinde ${label(SOURCE, data.source)} üzerinden alındı`}
        actions={
          <>
            <Link className="btn btn-sm" to="/yonetim/basvurular">
              ← Havuza dön
            </Link>
            {!readOnly &&
              data.allowedTransitions.map((s) => {
                const def = ACTION_LABELS[s];
                if (!def) return null;
                return (
                  <button
                    key={s}
                    type="button"
                    className={`btn btn-sm ${def.variant === 'primary' ? 'btn-primary' : def.variant === 'danger' ? 'btn-danger' : ''}`}
                    onClick={() => setStatusModal(s)}
                  >
                    {def.label}
                  </button>
                );
              })}
          </>
        }
      />

      <div className="admin-content">
        <div className="detail-header">
          <div className="row-between wrap">
            <div className="row wrap" style={{ gap: 10 }}>
              <Badge tone={tone(APPLICATION_STATUS, data.status)}>{label(APPLICATION_STATUS, data.status)}</Badge>
              {latestGrade && (
                <span className="row" style={{ gap: 6 }}>
                  <span className="small muted">Kalite notu:</span>
                  <Grade grade={latestGrade} />
                </span>
              )}
              <Badge tone={tone(PRIORITY, data.priority)}>Öncelik: {label(PRIORITY, data.priority)}</Badge>
              <span className="small muted">Doluluk skoru: {data.completeness}/100</span>
              {data.supplier && (
                <Link to={`/yonetim/tedarikciler/${data.supplier.id}`} className="badge badge-ok">
                  Tedarikçi: {data.supplier.supplier_code}
                </Link>
              )}
            </div>
            {!readOnly && (
              <div className="row">
                <span className="small muted">Sorumlu:</span>
                <select
                  className="input"
                  style={{ width: 200 }}
                  value={data.assigned_to ?? ''}
                  onChange={(e) => assign(e.target.value)}
                >
                  <option value="">Atanmadı</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {data.duplicate_of && data.duplicates.length > 0 && (
            <div className="form-error" style={{ marginTop: 14, marginBottom: 0 }}>
              <strong>Olası mükerrer kayıt.</strong> Aynı firma/e-posta ile eşleşen başvurular:{' '}
              {data.duplicates.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ', '}
                  <Link to={`/yonetim/basvurular/${d.id}`} style={{ textDecoration: 'underline' }}>
                    {d.ref_no}
                  </Link>{' '}
                  ({label(APPLICATION_STATUS, d.status)})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="detail-grid">
          <div className="stack">
            {/* Firma bilgileri */}
            <div className="card">
              <div className="card-title">Firma bilgileri</div>
              <dl className="kv">
                <dt>Firma adı</dt>
                <dd>{data.company_name}</dd>
                <dt>Vergi / DUNS no</dt>
                <dd className="mono">{data.tax_id}</dd>
                <dt>Sektör</dt>
                <dd>
                  {meta?.sectors.find((s) => s.code === data.sector)?.[lang === 'tr' ? 'name_tr' : 'name_en'] ?? data.sector}
                  {data.sector_other && ` — ${data.sector_other}`}
                </dd>
                <dt>Kuruluş yılı</dt>
                <dd>{data.founded_year ?? '—'}</dd>
                <dt>Çalışan sayısı</dt>
                <dd>{data.employee_band ?? '—'}</dd>
                <dt>Yıllık ciro</dt>
                <dd>{data.revenue_band ?? '—'}</dd>
                <dt>Web sitesi</dt>
                <dd>
                  {data.website ? (
                    <a href={data.website} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--brand)' }}>
                      {data.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
                <dt>Konum</dt>
                <dd>
                  {data.city} / {data.country_other ?? data.country.toUpperCase()}
                </dd>
                {data.address && (
                  <>
                    <dt>Adres</dt>
                    <dd>{data.address}</dd>
                  </>
                )}
              </dl>
            </div>

            {/* İletişim */}
            <div className="card">
              <div className="card-title">İletişim</div>
              <dl className="kv">
                <dt>Yetkili kişi</dt>
                <dd>
                  {data.contact_name}
                  {data.contact_position && <span className="muted"> · {data.contact_position}</span>}
                </dd>
                <dt>E-posta</dt>
                <dd>
                  <a href={`mailto:${data.email}`} style={{ color: 'var(--brand)' }}>
                    {data.email}
                  </a>
                </dd>
                <dt>Telefon</dt>
                <dd>{data.phone}</dd>
              </dl>
            </div>

            {/* Yetkinlikler */}
            <div className="card">
              <div className="card-title">Tedarik yetkinlikleri</div>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Ürün grupları
              </div>
              <div className="cat-tags" style={{ maxWidth: 'none', marginBottom: 14 }}>
                {data.categories.map((c) => (
                  <span className="cat-tag" key={c}>
                    {catNames[c] ?? c}
                  </span>
                ))}
                {data.category_other && <span className="cat-tag">Diğer: {data.category_other}</span>}
              </div>

              <div className="small muted" style={{ marginBottom: 6 }}>
                Kalite sertifikaları
              </div>
              <div className="cat-tags" style={{ maxWidth: 'none' }}>
                {data.certifications.length === 0 && <span className="small muted">Belirtilmedi</span>}
                {data.certifications.map((c) => (
                  <span className="cat-tag" key={c}>
                    {meta?.certifications.find((x) => x.code === c)?.name ?? c}
                  </span>
                ))}
              </div>

              {data.references_text && (
                <>
                  <div className="small muted" style={{ margin: '14px 0 6px' }}>
                    Referanslar
                  </div>
                  <div style={{ fontSize: 13 }}>{data.references_text}</div>
                </>
              )}
              {data.about && (
                <>
                  <div className="small muted" style={{ margin: '14px 0 6px' }}>
                    Firma tanıtımı
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{data.about}</div>
                </>
              )}
            </div>

            {/* Belgeler */}
            <div className="card">
              <div className="card-title">Belgeler ({data.documents.length})</div>
              {data.documents.length === 0 && <div className="small muted">Belge yüklenmemiş.</div>}
              {data.documents.map((doc) => (
                <div className={`doc-item ${doc.uploaded_by_supplier ? 'supplier-doc' : ''}`} key={doc.id}>
                  <div style={{ flex: 1 }}>
                    <div className="doc-name">{doc.original_name}</div>
                    <div className="doc-meta">
                      {label(DOCUMENT_KIND, doc.kind)} · {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                      {doc.uploaded_by_supplier ? ' · tedarikçi yükledi' : doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => api.download(`/admin/documents/${doc.id}/download`, doc.original_name).catch((e) => toast.push(e.message, 'error'))}
                  >
                    İndir
                  </button>
                </div>
              ))}
            </div>

            {/* Notlar */}
            <div className="card">
              <div className="card-title">Notlar</div>
              {!readOnly && (
                <div className="stack" style={{ marginBottom: 14 }}>
                  <textarea
                    className="input"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Dahili not ekleyin (tedarikçi göremez)..."
                  />
                  <button className="btn btn-sm" onClick={addNote} disabled={!note.trim() || busy} type="button" style={{ alignSelf: 'flex-start' }}>
                    Not ekle
                  </button>
                </div>
              )}
              {data.notes.length === 0 && <div className="small muted">Henüz not eklenmemiş.</div>}
              {data.notes.map((n) => (
                <div className={`note-item ${n.visibility === 'SHARED' ? 'shared' : ''}`} key={n.id}>
                  {n.body}
                  <div className="meta">
                    {n.author} · {formatDate(n.created_at, true)}
                    {n.visibility === 'SHARED' && ' · tedarikçiyle paylaşıldı'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------ Yan panel ----------------------------- */}
          <div className="stack">
            {!readOnly && (
              <div className="card">
                <div className="card-title">Hızlı işlemler</div>
                <div className="stack">
                  <button className="btn btn-block" onClick={() => setInfoModal(true)} type="button">
                    Tedarikçiden bilgi/belge iste
                  </button>
                  {data.audits.length > 0 && (
                    <Link className="btn btn-block" to={`/yonetim/denetimler/${data.audits[0].id}`}>
                      Denetimi aç ({data.audits[0].audit_no})
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Denetimler */}
            {data.audits.length > 0 && (
              <div className="card">
                <div className="card-title">Kalite denetimleri</div>
                {data.audits.map((a) => (
                  <Link
                    to={`/yonetim/denetimler/${a.id}`}
                    key={a.id}
                    className="row-between"
                    style={{ padding: '9px 0', borderBottom: '1px solid #f4f4f4' }}
                  >
                    <div>
                      <div className="mono small">{a.audit_no}</div>
                      <div className="small muted">
                        {a.auditor_name ?? 'Denetçi atanmadı'}
                        {a.planned_date && ` · ${formatDate(a.planned_date)}`}
                      </div>
                    </div>
                    <div className="row">
                      {a.score !== null && <span className="small muted">{a.score}</span>}
                      <Grade grade={a.grade} />
                      <Badge tone={tone(AUDIT_STATUS, a.status)}>{label(AUDIT_STATUS, a.status)}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* KVKK kaydı */}
            <div className="card">
              <div className="card-title">KVKK kaydı</div>
              <dl className="kv">
                <dt>Onay</dt>
                <dd>{data.kvkk_consent ? '✓ Alındı' : '✗ Yok'}</dd>
                <dt>Metin sürümü</dt>
                <dd className="mono small">{data.consent_version ?? '—'}</dd>
                <dt>Onay zamanı</dt>
                <dd>{formatDate(data.consent_at, true)}</dd>
              </dl>
            </div>

            {/* Denetim izi */}
            <div className="card">
              <div className="card-title">İşlem geçmişi</div>
              <div className="timeline">
                {data.activity.map((a, i) => (
                  <div className={`timeline-item ${i > 0 ? 'muted-dot' : ''}`} key={a.id}>
                    <span className="timeline-dot" />
                    <div className="timeline-body">
                      <strong>{ACTIVITY_LABELS[a.action] ?? a.action}</strong>
                      {a.from_value && a.to_value && (
                        <>
                          {': '}
                          {label(APPLICATION_STATUS, a.from_value)} → {label(APPLICATION_STATUS, a.to_value)}
                        </>
                      )}
                      {!a.from_value && a.to_value && a.action !== 'STATUS_CHANGED' && <>: {a.to_value}</>}
                      {a.detail && <div className="muted">{a.detail}</div>}
                      <div className="who">
                        {a.actor_label} · {formatDate(a.created_at, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------- Durum değişikliği --------------------------- */}
      {statusModal && (
        <Modal
          title={ACTION_LABELS[statusModal]?.label ?? 'Durum değiştir'}
          size="sm"
          onClose={() => setStatusModal(null)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setStatusModal(null)} type="button">
                  Vazgeç
                </button>
                <button
                  className={`btn ${['REJECTED', 'DISQUALIFIED'].includes(statusModal) ? 'btn-danger' : 'btn-primary'}`}
                  onClick={changeStatus}
                  disabled={busy}
                  type="button"
                >
                  {busy && <span className="spinner" />} Onayla
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <p className="small" style={{ lineHeight: 1.6 }}>
              <strong>{data.company_name}</strong> başvurusu{' '}
              <strong>{label(APPLICATION_STATUS, statusModal)}</strong> durumuna alınacak.
              {statusModal === 'AUDIT_PENDING' && ' Kalite birimine otomatik olarak bir denetim görevi düşecek.'}
              {statusModal === 'APPROVED' && ' Firma onaylı tedarikçi havuzuna eklenecek.'}
            </p>
            <div className="field">
              <label>{['REJECTED', 'DISQUALIFIED'].includes(statusModal) ? 'Gerekçe' : 'Not (opsiyonel)'}</label>
              <textarea rows={3} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
            </div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Tedarikçiye bilgilendirme e-postası gönder
            </label>
          </div>
        </Modal>
      )}

      {/* ----------------------------- Bilgi talebi ----------------------------- */}
      {infoModal && (
        <Modal
          title="Tedarikçiden bilgi / belge iste"
          size="sm"
          onClose={() => setInfoModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setInfoModal(false)} type="button">
                  Vazgeç
                </button>
                <button className="btn btn-primary" onClick={requestInfo} disabled={busy || infoMessage.trim().length < 5} type="button">
                  {busy && <span className="spinner" />} Gönder
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              Tedarikçiye, 30 gün geçerli güvenli bir yükleme bağlantısı içeren e-posta gönderilir. Hesap açmasına gerek yoktur.
            </p>
            <div className="field">
              <label>Talep edilen bilgi / belgeler</label>
              <textarea
                rows={5}
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder={'Örn:\n- Güncel ISO 9001 sertifikanız (süresi dolmuş görünüyor)\n- Son 2 yıllık mali tablo özeti\n- Kapasite raporu'}
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
