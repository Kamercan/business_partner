import { useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Loading, Modal, useToast } from '../../components/ui';
import { useMeta } from '../../hooks/useMeta';
import { formatDate } from '../../lib/labels';
import { useI18n } from '../../i18n';
import { TopBar } from './AdminLayout';

type Setting = { key: string; value: string; updated_at: string };

const GROUPS = [
  {
    title: 'se.grades',
    hint: 'se.grades.hint',
    keys: [
      { key: 'grade.threshold.A', label: 'se.grade.a', type: 'number' },
      { key: 'grade.threshold.B', label: 'se.grade.b', type: 'number' },
      { key: 'grade.threshold.C', label: 'se.grade.c', type: 'number' },
    ],
  },
  {
    title: 'se.sla',
    hint: 'se.sla.hint',
    keys: [
      { key: 'sla.review_days', label: 'se.sla.review', type: 'number' },
      { key: 'sla.audit_days', label: 'se.sla.audit', type: 'number' },
      { key: 'sla.ncr_response_days', label: 'se.sla.ncr', type: 'number' },
      { key: 'contract.renewal_notice_days', label: 'se.sla.contract', type: 'number' },
    ],
  },
  {
    title: 'se.org',
    hint: 'se.org.hint',
    keys: [
      { key: 'org.name', label: 'se.org.legal' },
      { key: 'org.short', label: 'se.org.short' },
    ],
  },
] as const;

export default function Settings() {
  const { t, lang, pick } = useI18n();
  const toast = useToast();
  const meta = useMeta();
  const { can } = useAuth();
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [cat, setCat] = useState({ code: '', name_tr: '', name_en: '', name_ja: '', hint_tr: '', hint_en: '', hint_ja: '' });
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
        name_ja: cat.name_ja || null,
        hint_tr: cat.hint_tr || null,
        hint_en: cat.hint_en || null,
        hint_ja: cat.hint_ja || null,
        sort_order: 50,
        is_active: true,
      });
      toast.push(t('se.taxonomy.added'), 'ok');
      setCatModal(false);
      setCat({ code: '', name_tr: '', name_en: '', name_ja: '', hint_tr: '', hint_en: '', hint_ja: '' });
      window.location.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.create.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    try {
      await api.post('/auth/change-password', pw);
      toast.push(t('se.password.ok'), 'ok');
      setPwModal(false);
      setPw({ current_password: '', new_password: '' });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.update.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <>
        <TopBar title={t('se.title')} />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={t('se.title')}
        subtitle={t('se.subtitle')}
        actions={
          <>
            <button className="btn" onClick={() => setPwModal(true)} type="button">
              {t('se.password.change')}
            </button>
            {can('ADMIN') && (
              <button className="btn btn-primary" onClick={save} disabled={busy} type="button">
                {busy && <span className="spinner" />} {t('se.save')}
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
                <div className="card-title">{t(group.title)}</div>
                <p className="small muted" style={{ marginBottom: 14 }}>
                  {t(group.hint)}
                </p>
                <div className="grid-2">
                  {group.keys.map((k) => (
                    <div className="field" key={k.key}>
                      <label>{t(k.label)}</label>
                      <input
                        type={'type' in k ? k.type : 'text'}
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
                {t('se.taxonomy')} ({meta?.categories.length ?? 0})
                {can('ADMIN') && (
                  <button className="btn btn-sm" onClick={() => setCatModal(true)} type="button">
                    {t('a.add')}
                  </button>
                )}
              </div>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {t('se.taxonomy.hint')}
              </p>
              <div className="cat-tags" style={{ maxWidth: 'none' }}>
                {meta?.categories.map((c) => (
                  <span className="cat-tag" key={c.code} title={pick(c, 'hint') || undefined}>
                    {pick(c)}
                  </span>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">{t('ad.certs')} ({meta?.certifications.length ?? 0})</div>
              <div className="cat-tags" style={{ maxWidth: 'none' }}>
                {meta?.certifications.map((c) => (
                  <span className="cat-tag" key={c.code}>
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">{t('se.raw')}</div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t('se.key')}</th>
                      <th>{t('se.value')}</th>
                      <th>{t('se.updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.map((s) => (
                      <tr key={s.key}>
                        <td className="mono small">{s.key}</td>
                        <td className="small">{s.value}</td>
                        <td className="small muted tight">{formatDate(s.updated_at, true, lang)}</td>
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
          title={t('se.taxonomy.new')}
          size="sm"
          onClose={() => setCatModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setCatModal(false)} type="button">
                  {t('a.cancel')}
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
              <span className="hint">{t('se.code.hint')}</span>
            </div>
            <div className="field">
              <label>
                {t('se.name.tr')} <span className="req">*</span>
              </label>
              <input value={cat.name_tr} onChange={(e) => setCat({ ...cat, name_tr: e.target.value })} placeholder={t('se.taxonomy.ph')} />
            </div>
            <div className="field">
              <label>{t('se.name.en')}</label>
              <input value={cat.name_en} onChange={(e) => setCat({ ...cat, name_en: e.target.value })} placeholder="Welded Assembly Groups" />
            </div>
            <div className="field">
              <label>{t('se.name.ja')}</label>
              <input value={cat.name_ja} onChange={(e) => setCat({ ...cat, name_ja: e.target.value })} placeholder="溶接組立ユニット" />
              <span className="hint">{t('se.name.ja.hint')}</span>
            </div>
            <div className="field">
              <label>{t('se.hint.field')}</label>
              <textarea rows={2} value={cat.hint_tr} onChange={(e) => setCat({ ...cat, hint_tr: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {pwModal && (
        <Modal
          title={t('se.password.title')}
          size="sm"
          onClose={() => setPwModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setPwModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button className="btn btn-primary" onClick={changePassword} disabled={busy || pw.new_password.length < 8} type="button">
                  {busy && <span className="spinner" />} {t('a.save')}
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>{t('se.password.current')}</label>
              <input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('se.password.new')}</label>
              <input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              <span className="hint">{t('se.password.rule')}</span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
