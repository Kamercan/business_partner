import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Grade, Loading, Modal, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { AUDIT_METHOD, AUDIT_STATUS, RECOMMENDATION, formatDate, label, tone } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Item = {
  id: number;
  section_tr: string;
  section_en: string;
  question_tr: string;
  question_en: string;
  weight: number;
  score: number | null;
  note: string | null;
};

type Audit = {
  id: number;
  audit_no: string;
  application_id: number | null;
  supplier_id: number | null;
  type: string;
  status: string;
  planned_date: string | null;
  completed_at: string | null;
  method: string | null;
  score: number | null;
  grade: string | null;
  strengths: string | null;
  findings: string | null;
  recommendation: string | null;
  company_name: string | null;
  ref_no: string | null;
  supplier_code: string | null;
  auditor_name: string | null;
  auditor_id: number | null;
  items: Item[];
  live: { score: number; grade: string; answered: number; total: number };
  activity: Array<{ id: number; action: string; actor_label: string; to_value: string | null; detail: string | null; created_at: string }>;
};

/** Puanlama ölçeği — denetçiye tutarlı bir dil sunar. */
const SCALE = [
  { value: 0, label: 'au.score.0' },
  { value: 25, label: 'au.score.25' },
  { value: 50, label: 'au.score.50' },
  { value: 75, label: 'au.score.75' },
  { value: 100, label: 'au.score.100' },
] as const;

export default function AuditDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { t, lang } = useI18n();
  const { can, user, readOnly } = useAuth();

  const [audit, setAudit] = useState<Audit | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const [plan, setPlan] = useState({ planned_date: '', method: 'ONSITE', auditor_id: '' });
  const [completeModal, setCompleteModal] = useState(false);
  const [completion, setCompletion] = useState({
    strengths: '',
    findings: '',
    recommendation: 'APPROVE',
    grade_override: '',
    override_reason: '',
  });
  const [users, setUsers] = useState<Array<{ id: number; full_name: string }>>([]);

  const load = useCallback(() => {
    api
      .get<Audit>(`/admin/audits/${id}`)
      .then((data) => {
        setAudit(data);
        setScores(Object.fromEntries(data.items.filter((i) => i.score !== null).map((i) => [i.id, i.score as number])));
        setNotes(Object.fromEntries(data.items.filter((i) => i.note).map((i) => [i.id, i.note as string])));
        setPlan({
          planned_date: data.planned_date ?? '',
          method: data.method ?? 'ONSITE',
          auditor_id: data.auditor_id ? String(data.auditor_id) : '',
        });
        setCompletion((prev) => ({
          ...prev,
          strengths: data.strengths ?? '',
          findings: data.findings ?? '',
          recommendation: data.recommendation ?? 'APPROVE',
        }));
      })
      .catch((err) => toast.push(err instanceof ApiError ? err.message : t('a.load.failed'), 'error'));
  }, [id, toast]);

  useEffect(() => {
    load();
    api.get<Array<{ id: number; full_name: string }>>('/admin/users?role=QUALITY').then(setUsers).catch(() => undefined);
  }, [load]);

  /** Kaydedilmemiş puanlarla anlık ağırlıklı skoru hesaplar. */
  const liveScore = useMemo(() => {
    if (!audit) return { score: 0, answered: 0, total: 0 };
    const answered = audit.items.filter((i) => scores[i.id] !== undefined);
    const weight = answered.reduce((sum, i) => sum + i.weight, 0);
    const score = weight === 0 ? 0 : answered.reduce((sum, i) => sum + i.weight * scores[i.id], 0) / weight;
    return { score: Math.round(score * 10) / 10, answered: answered.length, total: audit.items.length };
  }, [audit, scores]);

  const projectedGrade = liveScore.score >= 85 ? 'A' : liveScore.score >= 70 ? 'B' : liveScore.score >= 55 ? 'C' : 'D';

  if (!audit) {
    return (
      <>
        <TopBar title={t('au.detail')} />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  const locked = audit.status === 'COMPLETED' || readOnly || !can('QUALITY');

  const sections = audit.items.reduce<Record<string, Item[]>>((acc, item) => {
    const key = lang === 'tr' ? item.section_tr : item.section_en;
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  async function saveScores() {
    const payload = Object.entries(scores).map(([itemId, score]) => ({
      item_id: Number(itemId),
      score,
      note: notes[Number(itemId)] || undefined,
    }));
    if (payload.length === 0) {
      toast.push('Kaydedilecek puan yok.', 'info');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/admin/audits/${id}/scores`, { scores: payload });
      toast.push('Puanlar kaydedildi.', 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Kaydedilemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    setBusy(true);
    try {
      await api.patch(`/admin/audits/${id}`, {
        planned_date: plan.planned_date || undefined,
        method: plan.method || undefined,
        auditor_id: plan.auditor_id ? Number(plan.auditor_id) : null,
      });
      toast.push(t('au.planned'), 'ok');
      setPlanModal(false);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Kaydedilemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    try {
      await api.post(`/admin/audits/${id}/complete`, {
        strengths: completion.strengths || undefined,
        findings: completion.findings || undefined,
        recommendation: completion.recommendation,
        method: audit!.method ?? plan.method,
        grade_override: completion.grade_override || undefined,
        override_reason: completion.override_reason || undefined,
      });
      toast.push(t('au.complete.ok'), 'ok');
      setCompleteModal(false);
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('au.complete.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title={audit.company_name ?? audit.audit_no}
        subtitle={`${audit.audit_no} · ${audit.supplier_code ?? audit.ref_no ?? ''}`}
        actions={
          <>
            <Link className="btn btn-sm" to="/yonetim/denetimler">
              ← Denetimler
            </Link>
            {audit.application_id && (
              <Link className="btn btn-sm" to={`/yonetim/basvurular/${audit.application_id}`}>
                {t('au.open.application')}
              </Link>
            )}
            {!locked && (
              <>
                <button className="btn btn-sm" onClick={() => setPlanModal(true)} type="button">
                  {t('au.plan')}
                </button>
                <button className="btn btn-sm" onClick={saveScores} disabled={busy} type="button">
                  {busy && <span className="spinner" />} {t('au.save.scores')}
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => setCompleteModal(true)}
                  disabled={liveScore.answered < liveScore.total}
                  title={liveScore.answered < liveScore.total ? t('au.score.all.first') : undefined}
                  type="button"
                >
                  Denetimi tamamla
                </button>
              </>
            )}
          </>
        }
      />

      <div className="admin-content">
        <div className="detail-grid">
          {/* --------------------------- Kontrol listesi --------------------------- */}
          <div>
            {audit.status === 'COMPLETED' && (
              <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid var(--ok)' }}>
                <div className="row-between wrap">
                  <div>
                    <div className="card-title" style={{ marginBottom: 4 }}>
                      {t('au.completed')}
                    </div>
                    <div className="small muted">
                      {formatDate(audit.completed_at, true, lang)} · {audit.auditor_name} ·{' '}
                      {label(RECOMMENDATION, audit.recommendation, lang)}
                    </div>
                  </div>
                  <div className="row">
                    <span className="big-score" style={{ fontSize: 28 }}>
                      {audit.score}
                    </span>
                    <Grade grade={audit.grade} />
                  </div>
                </div>
                {audit.strengths && (
                  <>
                    <div className="small muted" style={{ margin: '14px 0 4px' }}>
                      {t('au.strengths')}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{audit.strengths}</div>
                  </>
                )}
                {audit.findings && (
                  <>
                    <div className="small muted" style={{ margin: '12px 0 4px' }}>
                      {t('au.findings')}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{audit.findings}</div>
                  </>
                )}
              </div>
            )}

            {Object.entries(sections).map(([section, items]) => {
              const answered = items.filter((i) => scores[i.id] !== undefined).length;
              return (
                <div className="audit-section" key={section}>
                  <header>
                    <span>{section}</span>
                    <span className="muted small">
                      {t('au.scored', { done: answered, total: items.length })}
                    </span>
                  </header>
                  {items.map((item) => (
                    <div className="audit-item" key={item.id}>
                      <div className="q">
                        {lang === 'tr' ? item.question_tr : item.question_en}
                        <span className="weight">{t('au.weight')} ×{item.weight}</span>
                      </div>
                      <div className="score-row">
                        {SCALE.map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            className={`score-btn ${scores[item.id] === s.value ? 'on' : ''}`}
                            disabled={locked}
                            onClick={() => setScores((prev) => ({ ...prev, [item.id]: s.value }))}
                          >
                            {t(s.label)}
                          </button>
                        ))}
                      </div>
                      {!locked && (
                        <input
                          className="input"
                          style={{ marginTop: 8 }}
                          placeholder={t('au.finding.ph')}
                          value={notes[item.id] ?? ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      )}
                      {locked && item.note && <div className="small muted" style={{ marginTop: 6 }}>{item.note}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* ------------------------------ Yan panel ------------------------------ */}
          <div className="stack">
            <div className="score-summary">
              <div className="card-title">{audit.status === 'COMPLETED' ? t('au.result') : t('au.live.score')}</div>
              <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
                <span className="big-score">{audit.status === 'COMPLETED' ? audit.score : liveScore.score}</span>
                <span className="muted">/ 100</span>
                <span className="spacer" />
                <span className={`grade grade-${audit.status === 'COMPLETED' ? audit.grade : projectedGrade}`} style={{ width: 34, height: 34, fontSize: 16 }}>
                  {audit.status === 'COMPLETED' ? audit.grade : projectedGrade}
                </span>
              </div>
              <div className="progress-bar" style={{ marginTop: 12 }}>
                <span style={{ width: `${(liveScore.answered / Math.max(1, liveScore.total)) * 100}%` }} />
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {t('au.scored.items', { done: liveScore.answered, total: liveScore.total })}
              </div>
              <div className="small muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
                {t('au.thresholds')} <strong>A</strong> ≥85 · <strong>B</strong> ≥70 · <strong>C</strong> ≥55 · <strong>D</strong> &lt;55
              </div>
            </div>

            <div className="card">
              <div className="card-title">{t('au.info')}</div>
              <dl className="kv">
                <dt>{t('a.status')}</dt>
                <dd>
                  <Badge tone={tone(AUDIT_STATUS, audit.status)}>{label(AUDIT_STATUS, audit.status, lang)}</Badge>
                </dd>
                <dt>{t('au.auditor')}</dt>
                <dd>{audit.auditor_name ?? '—'}</dd>
                <dt>{t('au.planned.date')}</dt>
                <dd>{formatDate(audit.planned_date, false, lang)}</dd>
                <dt>{t('au.method')}</dt>
                <dd>{label(AUDIT_METHOD, audit.method, lang)}</dd>
                <dt>{t('au.completed.date')}</dt>
                <dd>{formatDate(audit.completed_at, true, lang)}</dd>
              </dl>
            </div>

            <div className="card">
              <div className="card-title">{t('a.history')}</div>
              <div className="timeline">
                {audit.activity.map((a, i) => (
                  <div className={`timeline-item ${i > 0 ? 'muted-dot' : ''}`} key={a.id}>
                    <span className="timeline-dot" />
                    <div className="timeline-body">
                      <strong>{a.action}</strong>
                      {a.to_value && <>: {a.to_value}</>}
                      {a.detail && <div className="muted">{a.detail}</div>}
                      <div className="who">
                        {a.actor_label} · {formatDate(a.created_at, true, lang)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------- Planla -------------------------------- */}
      {planModal && (
        <Modal
          title={t('au.plan.title')}
          size="sm"
          onClose={() => setPlanModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setPlanModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button className="btn btn-primary" onClick={savePlan} disabled={busy} type="button">
                  {busy && <span className="spinner" />} Kaydet
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <label>{t('au.planned.date')}</label>
              <input type="date" value={plan.planned_date} onChange={(e) => setPlan({ ...plan, planned_date: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('au.method.label')}</label>
              <select value={plan.method} onChange={(e) => setPlan({ ...plan, method: e.target.value })}>
                <option value="ONSITE">{t('au.method.onsite')}</option>
                <option value="REMOTE">{t('au.method.remote')}</option>
                <option value="DESKTOP">{t('au.method.desktop')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('au.auditor')}</label>
              <select value={plan.auditor_id} onChange={(e) => setPlan({ ...plan, auditor_id: e.target.value })}>
                <option value="">{t('a.unassigned')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
                {user && !users.some((u) => u.id === user.id) && <option value={user.id}>{user.full_name} (ben)</option>}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* ------------------------------- Tamamla -------------------------------- */}
      {completeModal && (
        <Modal
          title={t('au.complete.title')}
          size="sm"
          onClose={() => setCompleteModal(false)}
          footer={
            <>
              <span />
              <div className="row">
                <button className="btn" onClick={() => setCompleteModal(false)} type="button">
                  {t('a.cancel')}
                </button>
                <button className="btn btn-primary" onClick={complete} disabled={busy} type="button">
                  {busy && <span className="spinner" />} Tamamla
                </button>
              </div>
            </>
          }
        >
          <div className="stack">
            <div className="row" style={{ gap: 14, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 6 }}>
              <span className="big-score" style={{ fontSize: 26 }}>
                {liveScore.score}
              </span>
              <Grade grade={completion.grade_override || projectedGrade} />
              <span className="small muted">{t('au.computed.grade')}: {projectedGrade}</span>
            </div>

            <div className="field">
              <label>{t('au.strengths')}</label>
              <textarea rows={3} value={completion.strengths} onChange={(e) => setCompletion({ ...completion, strengths: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('au.findings')}</label>
              <textarea rows={3} value={completion.findings} onChange={(e) => setCompletion({ ...completion, findings: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('au.recommendation')}</label>
              <select value={completion.recommendation} onChange={(e) => setCompletion({ ...completion, recommendation: e.target.value })}>
                {Object.keys(RECOMMENDATION).map((r) => (
                  <option key={r} value={r}>
                    {label(RECOMMENDATION, r, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('au.override')}</label>
              <select value={completion.grade_override} onChange={(e) => setCompletion({ ...completion, grade_override: e.target.value })}>
                <option value="">Hesaplanan notu kullan ({projectedGrade})</option>
                {['A', 'B', 'C', 'D'].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            {completion.grade_override && (
              <div className="field">
                <label>
                  {t('au.override.reason')} <span className="req">*</span>
                </label>
                <textarea rows={2} value={completion.override_reason} onChange={(e) => setCompletion({ ...completion, override_reason: e.target.value })} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
