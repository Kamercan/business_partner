import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, EmptyState, Loading, useToast } from '../../components/ui';
import { PRIORITY, TASK_STATUS, TASK_TYPE, formatDate, label, tone } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Task = {
  id: number;
  type: string;
  title: string;
  description: string | null;
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
      toast.push(err instanceof ApiError ? err.message : 'İşlem başarısız.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function claim(id: number) {
    setBusy(true);
    try {
      await api.post(`/admin/tasks/${id}/claim`);
      toast.push('Görevi üstlendiniz.', 'ok');
      load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'İşlem başarısız.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="İş Sıram" subtitle="Birimimize ve bana atanan açık görevler" />
      <div className="admin-content">
        <div className="tabs">
          {[
            { key: 'queue', label: 'Birimimin kuyruğu' },
            { key: 'mine', label: 'Bana atananlar' },
            { key: 'done', label: 'Tamamlananlar' },
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
            <EmptyState title="Görev yok" hint="Bu görünümde bekleyen iş bulunmuyor." />
          </div>
        ) : (
          <div className="stack">
            {rows.map((task) => (
              <div className="card" key={task.id} style={task.is_overdue ? { borderLeft: '3px solid var(--brand)' } : undefined}>
                <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
                      <Badge tone={tone(TASK_TYPE, task.type)}>{label(TASK_TYPE, task.type)}</Badge>
                      <Badge tone={tone(TASK_STATUS, task.status)}>{label(TASK_STATUS, task.status)}</Badge>
                      {task.priority === 'HIGH' && <Badge tone="danger">{label(PRIORITY, task.priority)}</Badge>}
                      {task.is_overdue === 1 && <Badge tone="danger">Gecikmiş</Badge>}
                    </div>
                    <Link to={entityLink(task)} style={{ fontSize: 15, fontWeight: 600 }}>
                      {task.title}
                    </Link>
                    {task.description && (
                      <div className="small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
                        {task.description}
                      </div>
                    )}
                    <div className="small muted" style={{ marginTop: 8 }}>
                      {task.due_date && <>Termin: {formatDate(task.due_date)} · </>}
                      Oluşturma: {formatDate(task.created_at)}
                      {task.assignee_name && <> · Sorumlu: {task.assignee_name}</>}
                    </div>
                  </div>

                  {!readOnly && task.status !== 'DONE' && (
                    <div className="row wrap">
                      <Link className="btn btn-sm" to={entityLink(task)}>
                        Aç
                      </Link>
                      {task.assigned_to !== user?.id && (
                        <button className="btn btn-sm" onClick={() => claim(task.id)} disabled={busy} type="button">
                          Üstlen
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => act(task.id, { status: 'DONE' }, 'Görev tamamlandı.')}
                        disabled={busy}
                        type="button"
                      >
                        Tamamlandı
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
