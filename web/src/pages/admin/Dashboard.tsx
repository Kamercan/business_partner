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
  byCategory: Array<{ code: string; name_tr: string; name_en: string; count: number; approved: number }>;
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
  const { pick } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>('/admin/stats/dashboard').then(setStats).catch(() => undefined);
  }, []);

  if (!stats) {
    return (
      <>
        <TopBar title="Panom" />
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
      <TopBar
        title={`Merhaba, ${user?.full_name.split(' ')[0]}`}
        subtitle="Tedarikçi başvuru havuzu ve yaşam döngüsü özeti"
      />
      <div className="admin-content stack" style={{ gap: 16 }}>
        {/* KPI'lar */}
        <div className="kpi-grid">
          <div className="kpi accent">
            <span className="kpi-label">Açık iş sıram</span>
            <span className="kpi-value">{stats.myTasks.open}</span>
            <span className="kpi-hint">
              {stats.myTasks.overdue > 0 ? (
                <span style={{ color: 'var(--brand)' }}>{stats.myTasks.overdue} gecikmiş</span>
              ) : (
                'gecikme yok'
              )}{' '}
              · <Link to="/yonetim/gorevler">aç</Link>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Değerlendirme bekleyen</span>
            <span className="kpi-value">{pendingReview}</span>
            <span className="kpi-hint">
              son 7 günde {stats.totals.last7} yeni başvuru · <Link to="/yonetim/basvurular?status=NEW,IN_REVIEW,NEEDS_INFO">aç</Link>
            </span>
          </div>
          <div className="kpi warn">
            <span className="kpi-label">Denetim sürecinde</span>
            <span className="kpi-value">{inAudit}</span>
            <span className="kpi-hint">
              {stats.auditQueue.pending} bekliyor · <Link to="/yonetim/denetimler">aç</Link>
            </span>
          </div>
          <div className="kpi ok">
            <span className="kpi-label">Onaylı tedarikçi</span>
            <span className="kpi-value">{stats.suppliers.approved}</span>
            <span className="kpi-hint">
              {stats.suppliers.conditional} şartlı · <Link to="/yonetim/tedarikciler">aç</Link>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Açık uygunsuzluk</span>
            <span className="kpi-value">{stats.ncrs.open}</span>
            <span className="kpi-hint">
              {stats.ncrs.overdue > 0 ? <span style={{ color: 'var(--brand)' }}>{stats.ncrs.overdue} gecikmiş</span> : 'gecikme yok'} ·{' '}
              <Link to="/yonetim/uygunsuzluklar">aç</Link>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Yenilenecek sözleşme</span>
            <span className="kpi-value">{stats.contracts.expiring}</span>
            <span className="kpi-hint">
              {stats.contracts.active} yürürlükte · <Link to="/yonetim/sozlesmeler?expiring=true">aç</Link>
            </span>
          </div>
        </div>

        <div className="panel-grid">
          {/* Ürün grubu dağılımı — projenin ana ihtiyacı */}
          <div className="card">
            <div className="card-title">
              Ürün grubuna göre başvurular
              <Link className="small" to="/yonetim/basvurular">
                tümünü gör →
              </Link>
            </div>
            <BarChart
              data={stats.byCategory
                .filter((c) => c.count > 0)
                .map((c) => ({ label: pick(c), value: c.count, extra: c.approved ? `(${c.approved} onaylı)` : undefined }))}
            />
          </div>

          <div className="card">
            <div className="card-title">Süreç durumu</div>
            <BarChart
              data={stats.byStatus
                .sort((a, b) => b.count - a.count)
                .map((s) => ({ label: label(APPLICATION_STATUS, s.status), value: s.count }))}
            />
          </div>
        </div>

        <div className="panel-grid">
          <div className="card">
            <div className="card-title">Aylık başvuru trendi</div>
            <TrendChart data={stats.monthly} />
            <div className="row small muted" style={{ gap: 16, marginTop: 8 }}>
              <span>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--brand)', opacity: 0.22, borderRadius: 2 }} />{' '}
                toplam
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--brand)', borderRadius: 2 }} /> onaylanan
              </span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Kalite notu dağılımı</div>
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
                Ort. ön değerlendirme: <strong>{stats.cycle.avgReviewDays ?? '—'} gün</strong>
              </span>
              <span>
                Ort. denetim süresi: <strong>{stats.cycle.avgAuditDays ?? '—'} gün</strong>
              </span>
            </div>
          </div>
        </div>

        {/* SLA ihlali yaklaşan başvurular */}
        {stats.needsAttention.length > 0 && (
          <div className="card">
            <div className="card-title">Hedef süreyi aşan başvurular</div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Referans</th>
                    <th>Firma</th>
                    <th>Durum</th>
                    <th>Bekleme</th>
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
                        <Badge tone={tone(APPLICATION_STATUS, a.status)}>{label(APPLICATION_STATUS, a.status)}</Badge>
                      </td>
                      <td className="tight" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                        {a.age_days} gün
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
