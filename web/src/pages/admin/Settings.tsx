import { useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Loading, Modal, useToast } from '../../components/ui';
import { useMeta } from '../../hooks/useMeta';
import { formatDate } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Setting = { key: string; value: string; updated_at: string };

const GROUPS: Array<{ title: string; hint: string; keys: Array<{ key: string; label: string; type?: string; hint?: string }> }> = [
  {
    title: 'Kalite notu eşikleri',
    hint: 'Denetim puanının hangi aralıkta hangi nota karşılık geldiğini belirler.',
    keys: [
      { key: 'grade.threshold.A', label: 'A notu için minimum puan', type: 'number' },
      { key: 'grade.threshold.B', label: 'B notu için minimum puan', type: 'number' },
      { key: 'grade.threshold.C', label: 'C notu için minimum puan', type: 'number' },
    ],
  },
  {
    title: 'Hedef süreler (SLA)',
    hint: 'Görev terminleri ve panodaki gecikme uyarıları bu değerlere göre hesaplanır.',
    keys: [
      { key: 'sla.review_days', label: 'Ön değerlendirme (gün)', type: 'number' },
      { key: 'sla.audit_days', label: 'Denetim tamamlama (gün)', type: 'number' },
      { key: 'sla.ncr_response_days', label: 'Uygunsuzluk cevabı (gün)', type: 'number' },
      { key: 'contract.renewal_notice_days', label: 'Sözleşme yenileme hatırlatması (gün)', type: 'number' },
    ],
  },
  {
    title: 'Kurum bilgileri',
    hint: 'Form, e-posta ve raporlarda görünen kurum adı.',
    keys: [
      { key: 'org.name', label: 'Resmî unvan' },
      { key: 'org.short', label: 'Kısa ad' },
    ],
  },
];

export default function Settings() {
  const toast = useToast();
  const meta = useMeta();
  const { can } = useAuth();
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [cat, setCat] = useState({ code: '', name_tr: '', name_en: '', hint_tr: '', hint_en: '' });
  const [pwModal, setPwModal] = useState(false);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });

  const load = () =>
    api
      .get<Setting[]>('/meta/settings')
      .then((rows) => {
        setSettings(rows);
        setDraft(Object.fromEntries(rows.map((r) => [r.key, r.value])));
      })
      .catch(() => setSettings([]));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setBusy(true);
    try {
      await api.put('/meta/settings', draft);
      toast.push('Ayarlar kaydedildi.', 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Kaydedilemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    setBusy(true);
    try {
      await api.post('/meta/categories', {
        code: cat.code,
        name_tr: cat.name_tr,
        name_en: cat.name_en || cat.name_tr,
        hint_tr: cat.hint_tr || null,
        hint_en: cat.hint_en || null,
        sort_order: 50,
        is_active: true,
      });
      toast.push('Ürün grubu eklendi. Başvuru formunda hemen görünür.', 'ok');
      setCatModal(false);
      setCat({ code: '', name_tr: '', name_en: '', hint_tr: '', hint_en: '' });
      window.location.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Eklenemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    try {
      await api.post('/auth/change-password', pw);
      toast.push('Şifreniz güncellendi.', 'ok');
      setPwModal(false);
      setPw({ current_password: '', new_password: '' });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Güncellenemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <>
        <TopBar title="Ayarlar" />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Ayarlar"
        subtitle="Sistem parametreleri ve taksonomi yönetimi"
        actions={
          <>
            <button className="btn" onClick={() => setPwModal(true)} type="button">
              Şifremi değiştir
            </button>
            {can('ADMIN') && (
              <button className="btn btn-primary" onClick={save} disabled={busy} type="button">
                {busy && <span className="spinner" />} Ayarları kaydet
              </button>
            )}
          </>
        }
      />

      <div className="admin-content">
        <div className="detail-grid">
          <div className="stack">
            {GROUPS.map((group) => (
              <div className="card" key={group.title}>
                <div className="card-title">{group.title}</div>
                <p className="small muted" style={{ marginBottom: 14 }}>
                  {group.hint}
                </p>
                <div className="grid-2">
                  {group.keys.map((k) => (
                    <div className="field" key={k.key}>
                      <label>{k.label}</label>
                      <input
                        type={k.type ?? 'text'}
                        value={draft[k.key] ?? ''}
                        disabled={!can('ADMIN')}
                        onChange={(e) => setDraft({ ...draft, [k.key]: e.target.value })}
                      />
                      <span className="hint mono" style={{ fontSize: 10.5 }}>
                        {k.key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-title">
                Ürün grupları ({meta?.categories.length ?? 0})
                {can('ADMIN') && (
                  <button className="btn btn-sm" onClick={() => setCatModal(true)} type="button">
                    + Ekle
                  </button>
                )}
              </div>
              <p className="small muted" style={{ marginBottom: 12 }}>
                Başvuru formundaki çoklu seçim listesi. Buraya eklediğiniz grup, kod değişikliği gerektirmeden forma ve
                filtrelere yansır.
              </p>
              <div className="cat-tags" style={{ maxWidth: 'none' }}>
                {meta?.categories.map((c) => (
                  <span className="cat-tag" key={c.code} title={c.hint_tr ?? undefined}>
                    {c.name_tr}
                  </span>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Kalite sertifikaları ({meta?.certifications.length ?? 0})</div>
              <div className="cat-tags" style={{ maxWidth: 'none' }}>
                {meta?.certifications.map((c) => (
                  <span className="cat-tag" key={c.code}>
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Ham ayar kayıtları</div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Anahtar</th>
                      <th>Değer</th>
                      <th>Güncelleme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.map((s) => (
                      <tr key={s.key}>
                        <td className="mono small">{s.key}</td>
                        <td className="small">{s.value}</td>
                        <td className="small muted tight">{formatDate(s.updated_at, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {catModal && (
        <Modal
          title="Yeni ürün grubu"
          size="sm"
          onClose={() => setCatModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setCatModal(false)} type="button">
                  Vazgeç
                </button>
                <button className="btn btn-primary" onClick={addCategory} disabled={busy || !cat.code || !cat.name_tr} type="button">
                  {busy && <span className="spinner" />} Ekle
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>
                Kod <span className="req">*</span>
              </label>
              <input
                value={cat.code}
                onChange={(e) => setCat({ ...cat, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                placeholder="kaynak_montaj"
              />
              <span className="hint">Küçük harf, rakam ve alt çizgi. Sonradan değiştirilemez.</span>
            </div>
            <div className="field">
              <label>
                Türkçe adı <span className="req">*</span>
              </label>
              <input value={cat.name_tr} onChange={(e) => setCat({ ...cat, name_tr: e.target.value })} placeholder="Kaynaklı Montaj Grupları" />
            </div>
            <div className="field">
              <label>İngilizce adı</label>
              <input value={cat.name_en} onChange={(e) => setCat({ ...cat, name_en: e.target.value })} placeholder="Welded Assembly Groups" />
            </div>
            <div className="field">
              <label>Açıklama (form üzerindeki ipucu)</label>
              <textarea rows={2} value={cat.hint_tr} onChange={(e) => setCat({ ...cat, hint_tr: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {pwModal && (
        <Modal
          title="Şifre değiştir"
          size="sm"
          onClose={() => setPwModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setPwModal(false)} type="button">
                  Vazgeç
                </button>
                <button className="btn btn-primary" onClick={changePassword} disabled={busy || pw.new_password.length < 8} type="button">
                  {busy && <span className="spinner" />} Kaydet
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>Mevcut şifre</label>
              <input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </div>
            <div className="field">
              <label>Yeni şifre</label>
              <input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              <span className="hint">En az 8 karakter, harf ve rakam içermeli.</span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
