import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type DashboardCard, type StatusResponse } from '../lib/api.js';
import { Sparkline } from '../components/Sparkline.js';
import { StatusBadge } from '../components/Badges.js';
import { formatPct, formatPeriod, formatValue, relativeTime } from '../lib/format.js';

const CATEGORY_ORDER = ['inflation', 'minimum_wage', 'steel', 'scrap', 'fuel', 'freight', 'energy', 'fx'];
const CATEGORY_TITLE: Record<string, string> = {
  inflation: 'Enflasyon', minimum_wage: 'Asgari ücret', steel: 'Sac metal', scrap: 'Hurda demir',
  fuel: 'Akaryakıt', freight: 'Navlun', energy: 'Enerji', fx: 'Kur',
};

export function Dashboard() {
  const nav = useNavigate();
  const [cards, setCards] = useState<DashboardCard[] | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.dashboard(), api.status()])
      .then(([d, s]) => { setCards(d.cards); setStatus(s); })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="notice err"><span className="notice-icon">✗</span><div className="notice-body"><strong>Veri alınamadı</strong><p>{error}</p></div></div>;
  if (!cards) return <div className="empty">Yükleniyor…</div>;

  const byCategory = CATEGORY_ORDER
    .map((c) => ({ category: c, cards: cards.filter((k) => k.meta.series.category === c) }))
    .filter((g) => g.cards.length > 0);

  return (
    <>
      <div className="page-head">
        <h1>Gösterge panosu</h1>
        <p>
          Maliyet girdilerinizin güncel durumu. Her kart, verinin kaynağını ve tazeliğini birlikte gösterir —
          bir sayı ancak nereden geldiği belliyse karar verdirir. Karta tıklayarak geçmişini açın.
        </p>
      </div>

      {status && <SetupNotice status={status} />}

      {byCategory.map(({ category, cards: group }) => (
        <section className="section" key={category}>
          <div className="section-head">
            <h2>{CATEGORY_TITLE[category] ?? category}</h2>
            <p>{group.length} gösterge</p>
          </div>
          <div className="tile-grid">
            {group.map((card) => <Tile key={card.meta.series.id} card={card} onOpen={() => nav(`/seri/${card.meta.series.id}`)} />)}
          </div>
        </section>
      ))}
    </>
  );
}

/** Kurulum eksikleri tek bir yerde, eyleme dönük biçimde toplanır. */
function SetupNotice({ status }: { status: StatusResponse }) {
  const problems: string[] = [];
  if (status.needsKey > 0) problems.push(`${status.needsKey} seri API anahtarı bekliyor`);
  if (status.manualPending > 0) problems.push(`${status.manualPending} seri elle/CSV veri girişi bekliyor`);
  if (status.failing > 0) problems.push(`${status.failing} seride güncelleme hatası var`);
  if (status.stale > 0) problems.push(`${status.stale} seri güncel değil`);
  if (problems.length === 0) return null;

  return (
    <div className="notice warn">
      <span className="notice-icon">⚙</span>
      <div className="notice-body">
        <strong>{status.withData}/{status.total} seride veri var</strong>
        <p>
          {problems.join(' · ')}. Ayrıntı ve çözüm adımları için{' '}
          <a href="/kaynaklar">Kaynaklar</a> sayfasına bakın.
          {' '}Son güncelleme: {relativeTime(status.lastIngestAt)}.
        </p>
      </div>
    </div>
  );
}

function Tile({ card, onOpen }: { card: DashboardCard; onOpen: () => void }) {
  const { meta, summary, unit, spark } = card;
  const yoy = summary?.yoyPct ?? null;
  const dir = yoy === null ? 'flat' : yoy > 0.05 ? 'up' : yoy < -0.05 ? 'down' : 'flat';

  return (
    <button type="button" className="tile" onClick={onOpen}>
      <div className="tile-label">{meta.series.nameTr}</div>
      <div>
        <span className="tile-value">{formatValue(summary?.last?.value ?? null, unit)}</span>
        <span className="tile-unit">{unit}</span>
      </div>
      <Sparkline points={spark} />
      <div className="tile-foot">
        <span className={`delta ${dir}`} title="Bir yıl öncesine göre değişim">
          {yoy === null ? '—' : `${formatPct(yoy)} yıllık`}
        </span>
        <span className="tile-meta">
          {summary?.last ? formatPeriod(summary.last.period, meta.series.freq) : 'veri yok'}
        </span>
      </div>
      <div className="tile-foot">
        <StatusBadge meta={meta} />
        <span
          className="tile-meta"
          title={meta.producerOrg ? `${meta.producerOrg} üretir · ${meta.sourceName} üzerinden alınır` : meta.sourceName}
        >
          {shorten(meta.producerOrg ?? meta.sourceOrg)}
        </span>
      </div>
    </button>
  );
}

function shorten(org: string): string {
  const paren = /\(([^)]+)\)/.exec(org);
  if (paren?.[1]) return paren[1];
  return org.length > 22 ? `${org.slice(0, 21)}…` : org;
}
