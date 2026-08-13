import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, EmptyState, Loading, useToast } from '../../components/ui';
import { PRIORITY, TASK_STATUS, TASK_TYPE, formatDate, label, tone } from '../../lib/labels';
import { useI18n } from '../../i18n';
import { TopBar } from './AdminLayout';

type Task = {
  id: number;
  type: string;
  title: string;
  description: string | null;
  /** Başlığın veri kısmı — başlık seçili dilde bundan kurulur. */
  subject: string | null;
  /** Açıklamanın çeviri anahtarı ve değerleri (sunucu üretir). */
  detail_key: string | null;
  detail_params: string | null;
  entity_type: string;
  entity_id: number;
  assigned_role: string;
  assigned_to: number | null;
  assignee_name: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  company_name: string | null;
  is_overdue: number;
};

/** Görev varlığına göre ilgili detay sayfasına yönlendirir. */
function entityLink(task: Task): string {
  switch (task.entity_type) {
    case 'APPLICATION':
      return `/yonetim/basvurular/${task.entity_id}`;
    case 'AUDIT':
      return `/yonetim/denetimler/${task.entity_id}`;
    case 'NCR':
      return `/yonetim/uygunsuzluklar/${task.entity_id}`;
    case 'SUPPLIER':
      return `/yonetim/tedarikciler/${task.entity_id}`;
    case 'CONTRACT':
      return `/yonetim/sozlesmeler?q=${task.entity_id}`;
    default:
      return '/yonetim';
  }
}

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { user, readOnly } = useAuth();
  const { t, lang, tKey } = useI18n();

  /** Görev açıklaması: sunucu bir çeviri anahtarı verdiyse o dilde gösterilir. */
  function taskDetail(task: Task): string {
    if (!task.detail_key) return task.description ?? '';
    let params: Record<string, string | number> = {};
    try {
      params = task.detail_params ? (JSON.parse(task.detail_params) as Record<string, string | number>) : {};
    } catch {
      params = {};
    }
    return tKey(task.detail_key, task.description ?? '', params);
  }
  const [rows, setRows] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState(false);

  const view = params.get('view') ?? 'queue';

  const load = () => {
    const query =
      view === 'mine'
        ? { mine: 'true' }
        : view === 'done'
          ? { status: 'DONE', myQueue: 'true' }
          : { myQueue: 'true' };
    api
      .get<{ rows: Task[] }>(`/admin/tasks${qs(query)}`)
      .then((d) => setRows(d.rows))
      .catch(() => setRows([]));
  };

  useEffect(load, [view]);

  async function act(id: number, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api.patch(`/admin/tasks/${id}`, body);
      toast.push(message, 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function claim(id: number) {
    setBusy(true);
    try {
      await api.post(`/admin/tasks/${id}/claim`);
      toast.push(t('t.claimed'), 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('a.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title={t('t.title')} subtitle={t('t.subtitle')} />
      <div className="admin-content">
        <div className="tabs">
          {[
            { key: 'queue', label: t('t.my.queue') },
            { key: 'mine', label: t('t.mine') },
            { key: 'done', label: t('t.done.list') },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab ${view === tab.key ? 'active' : ''}`}
              onClick={() => setParams(tab.key === 'queue' ? {} : { view: tab.key })}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="table-wrap">
            <EmptyState title={t('t.empty')} hint={t('t.empty.hint')} />
          </div>
        ) : (
          <div className="stack">
            {rows.map((task) => (
              <div className="card" key={task.id} style={task.is_overdue ? { borderLeft: '3px solid var(--brand)' } : undefined}>
                <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
                      <Badge tone={tone(TASK_TYPE, task.type)}>{label(TASK_TYPE, task.type, lang)}</Badge>
                      <Badge tone={tone(TASK_STATUS, task.status)}>{label(TASK_STATUS, task.status, lang)}</Badge>
                      {task.priority === 'HIGH' && <Badge tone="danger">{label(PRIORITY, task.priority, lang)}</Badge>}
                      {task.is_overdue === 1 && <Badge tone="danger">{t('t.overdue')}</Badge>}
                    </div>
                    <Link to={entityLink(task)} style={{ fontSize: 15, fontWeight: 600 }}>
                      {task.subject ? `${label(TASK_TYPE, task.type, lang)}: ${task.subject}` : task.title}
                    </Link>
                    {(task.detail_key || task.description) && (
                      <div className="small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
                        {taskDetail(task)}
                      </div>
                    )}
                    <div className="small muted" style={{ marginTop: 8 }}>
                      {task.due_date && (
                        <>
                          {t('a.due')}: {formatDate(task.due_date, false, lang)} ·{' '}
                        </>
                      )}
                      {t('a.created')}: {formatDate(task.created_at, false, lang)}
                      {task.assignee_name && (
                        <>
                          {' '}
                          · {t('a.owner')}: {task.assignee_name}
                        </>
                      )}
                    </div>
                  </div>

                  {!readOnly && task.status !== 'DONE' && (
                    <div className="row wrap">
                      <Link className="btn btn-sm" to={entityLink(task)}>
                        {t('a.open')}
                      </Link>
                      {task.assigned_to !== user?.id && (
                        <button className="btn btn-sm" onClick={() => claim(task.id)} disabled={busy} type="button">
                          {t('t.claim')}
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => act(task.id, { status: 'DONE' }, t('t.completed'))}
                        disabled={busy}
                        type="button"
                      >
                        {t('t.done')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
