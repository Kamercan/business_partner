import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { BarChart, Badge, Loading, TrendChart } from '../../components/ui';
import { useI18n } from '../../i18n';
import { APPLICATION_STATUS, formatDate, label, tone } from '../../lib/labels';
import { TopBar } from './AdminLayout';

type Stats = {
  totals: { total: number; last30: number; last7: number };
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ code: string; name_tr: string; name_en: string; name_ja: string | null; count: number; approved: number }>;
  byCountry: Array<{ country: string; count: number }>;
  monthly: Array<{ month: string; count: number; approved: number }>;
  grades: Array<{ grade: string; count: number }>;
  auditQueue: { pending: number; planned: number; inProgress: number; completed: number };
  suppliers: { total: number; approved: number; conditional: number; suspended: number };
  ncrs: { open: number; overdue: number; closed: number };
  contracts: { active: number; expiring: number; expired: number };
  myTasks: { open: number; overdue: number };
  cycle: { avgReviewDays: number | null; avgAuditDays: number | null };
  needsAttention: Array<{ id: number; ref_no: string; company_name: string; status: string; age_days: number }>;
};

export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang, pick } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>('/admin/stats/dashboard').then(setStats).catch(() => undefined);
  }, []);

  if (!stats) {
    return (
      <>
        <TopBar title={t('d.title')} />
        <div className="admin-content">
          <Loading />
        </div>
      </>
    );
  }

  const statusCount = (s: string) => stats.byStatus.find((x) => x.status === s)?.count ?? 0;
  const pendingReview = statusCount('NEW') + statusCount('IN_REVIEW') + statusCount('NEEDS_INFO');
  const inAudit = stats.auditQueue.pending + stats.auditQueue.planned + stats.auditQueue.inProgress;

  return (
    <>
      <TopBar title={t('d.hello', { name: user?.full_name.split(' ')[0] ?? '' })} subtitle={t('d.subtitle')} />
      <div className="admin-content stack" style={{ gap: 16 }}>
        {/* KPI'lar */}
        <div className="kpi-grid">
          <div className="kpi accent">
            <span className="kpi-label">{t('d.my.tasks')}</span>
            <span className="kpi-value">{stats.myTasks.open}</span>
            <span className="kpi-hint">
              {stats.myTasks.overdue > 0 ? (
                <span style={{ color: 'var(--brand)' }}>
                  {stats.myTasks.overdue} {t('a.overdue')}
                </span>
              ) : (
                t('d.no.overdue')
              )}{' '}
              · <Link to="/yonetim/gorevler">{t('a.open')}</Link>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t('d.pending.review')}</span>
            <span className="kpi-value">{pendingReview}</span>
            <span className="kpi-hint">
              {t('d.last7', { count: stats.totals.last7 })} ·{' '}
              <Link to="/yonetim/basvurular?status=NEW,IN_REVIEW,NEEDS_INFO">{t('a.open')}</Link>
            </span>
          </div>
          <div className="kpi warn">
            <span className="kpi-label">{t('d.in.audit')}</span>
            <span className="kpi-value">{inAudit}</span>
            <span className="kpi-hint">
              {t('d.waiting', { count: stats.auditQueue.pending })} · <Link to="/yonetim/denetimler">{t('a.open')}</Link>
            </span>
          </div>
          <div className="kpi ok">
            <span className="kpi-label">{t('d.approved.suppliers')}</span>
            <span className="kpi-value">{stats.suppliers.approved}</span>
            <span className="kpi-hint">
              {t('d.conditional', { count: stats.suppliers.conditional })} · <Link to="/yonetim/tedarikciler">{t('a.open')}</Link>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t('d.open.ncrs')}</span>
            <span className="kpi-value">{stats.ncrs.open}</span>
            <span className="kpi-hint">
              {stats.ncrs.overdue > 0 ? (
                <span style={{ color: 'var(--brand)' }}>
                  {stats.ncrs.overdue} {t('a.overdue')}
                </span>
              ) : (
                t('d.no.overdue')
              )}{' '}
              · <Link to="/yonetim/uygunsuzluklar">{t('a.open')}</Link>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t('d.renewing')}</span>
            <span className="kpi-value">{stats.contracts.expiring}</span>
            <span className="kpi-hint">
              {t('d.active.contracts', { count: stats.contracts.active })} ·{' '}
              <Link to="/yonetim/sozlesmeler?expiring=true">{t('a.open')}</Link>
            </span>
          </div>
        </div>

        <div className="panel-grid">
          {/* Ürün grubu dağılımı — projenin ana ihtiyacı */}
          <div className="card">
            <div className="card-title">
              {t('d.by.category')}
              <Link className="small" to="/yonetim/basvurular">
                {t('d.see.all')}
              </Link>
            </div>
            <BarChart
              data={stats.byCategory
                .filter((c) => c.count > 0)
                .map((c) => ({
                  label: pick(c),
                  value: c.count,
                  extra: c.approved ? t('d.approved.short', { count: c.approved }) : undefined,
                }))}
            />
          </div>

          <div className="card">
            <div className="card-title">{t('d.by.status')}</div>
            <BarChart
              data={stats.byStatus
                .sort((a, b) => b.count - a.count)
                .map((s) => ({ label: label(APPLICATION_STATUS, s.status, lang), value: s.count }))}
            />
          </div>
        </div>

        <div className="panel-grid">
          <div className="card">
            <div className="card-title">{t('d.monthly')}</div>
            <TrendChart data={stats.monthly} />
            <div className="row small muted" style={{ gap: 16, marginTop: 8 }}>
              <span>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--brand)', opacity: 0.22, borderRadius: 2 }} />{' '}
                {t('d.total')}
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--brand)', borderRadius: 2 }} /> {t('d.approved.word')}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">{t('d.grades')}</div>
            <div className="row wrap" style={{ gap: 10 }}>
              {['A', 'B', 'C', 'D'].map((g) => (
                <div key={g} className="row" style={{ gap: 6 }}>
                  <span className={`grade grade-${g}`}>{g}</span>
                  <strong>{stats.grades.find((x) => x.grade === g)?.count ?? 0}</strong>
                </div>
              ))}
            </div>
            <div className="row wrap small muted" style={{ gap: 18, marginTop: 18 }}>
              <span>
                {t('d.avg.review')} <strong>{t('d.days', { n: stats.cycle.avgReviewDays ?? '—' })}</strong>
              </span>
              <span>
                {t('d.avg.audit')} <strong>{t('d.days', { n: stats.cycle.avgAuditDays ?? '—' })}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* SLA ihlali yaklaşan başvurular */}
        {stats.needsAttention.length > 0 && (
          <div className="card">
            <div className="card-title">{t('d.needs.attention')}</div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('a.reference')}</th>
                    <th>{t('a.company')}</th>
                    <th>{t('a.status')}</th>
                    <th>{t('d.waiting.col')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.needsAttention.map((a) => (
                    <tr key={a.id}>
                      <td className="ref">{a.ref_no}</td>
                      <td>
                        <Link to={`/yonetim/basvurular/${a.id}`} className="company">
                          {a.company_name}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={tone(APPLICATION_STATUS, a.status)}>{label(APPLICATION_STATUS, a.status, lang)}</Badge>
                      </td>
                      <td className="tight" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                        {t('d.days', { n: a.age_days })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
