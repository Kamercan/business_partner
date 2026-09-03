import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type SourceHealthEntry } from '../lib/api.js';
import { StatusBadge, TierBadge, ConfidenceBadge } from '../components/Badges.js';
import { formatPeriod, relativeTime } from '../lib/format.js';

const TIER_ORDER = ['official', 'mirror', 'benchmark', 'manual'];
const TIER_SECTION: Record<string, { title: string; blurb: string }> = {
  official: {
    title: 'Resmî üreticiler',
    blurb: 'Veriyi üreten kurumun kendisi. Bir gösterge için mevcutsa her zaman bu kaynak tercih edilir.',
  },
  mirror: {
    title: 'Resmî ayna servisler',
    blurb: 'Resmî veriyi API ile yeniden yayımlar. Veriyi üretmez — her seride asıl üretici ayrıca belirtilir.',
  },
  benchmark: {
    title: 'Piyasa referansları',
    blurb: 'Fiyatın istatistikle değil piyasa değerlendirmesiyle oluştuğu kalemler. Sektörün fiilen referans aldığı kuruluşlardır; çoğu aboneliklidir, bu yüzden veri CSV/elle kanalıyla kaynağı kayda geçirilerek girilir.',
  },
  manual: {
    title: 'Kurum içi',
    blurb: 'Kendi sözleşme ve teklif fiyatlarınız — piyasa endeksleriyle aynı eksende karşılaştırılabilsin diye aynı yapıda tutulur.',
  },
};

export function Sources() {
  const [health, setHealth] = useState<SourceHealthEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.sources().then((r) => setHealth(r.health)).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="notice err"><span className="notice-icon">✗</span><div className="notice-body"><strong>Hata</strong><p>{error}</p></div></div>;
  if (!health) return <div className="empty">Yükleniyor…</div>;

  return (
    <>
      <div className="page-head">
        <h1>Kaynaklar</h1>
        <p>
          Panodaki her sayının nereden geldiği, hangi lisansla kullanıldığı ve kaynağında nasıl doğrulanacağı.
          Bir gösterge için birden çok kaynak varsa, veriyi <strong>üreten</strong> kurum tercih edilir; ayna
          servisler yalnızca erişim kolaylığı için kullanılır ve bu sayfada ayrıca işaretlenir.
        </p>
      </div>

      <div className="notice">
        <span className="notice-icon">✓</span>
        <div className="notice-body">
          <strong>Kaynak kodlarını kendiniz doğrulayın</strong>
          <p>
            <code className="mono">npm run sources:check</code> komutu her seriyi kendi kaynağına karşı canlı
            sorgular ve başarılı olanları «Doğrulandı» olarak işaretler. «Teyit gerekli» rozeti taşıyan bir seri,
            kodu henüz canlı doğrulanmamış demektir — üretimde kullanmadan önce çalıştırın.
          </p>
        </div>
      </div>

      {TIER_ORDER.map((tier) => {
        const entries = health.filter((h) => h.source.tier === tier);
        if (entries.length === 0) return null;
        const section = TIER_SECTION[tier]!;
        return (
          <section className="section" key={tier}>
            <div className="section-head">
              <h2>{section.title}</h2>
              <p>{entries.length} kaynak</p>
            </div>
            <p className="small muted" style={{ maxWidth: '90ch', marginTop: 0 }}>{section.blurb}</p>
            {entries.map((h) => (
              <SourceCard key={h.source.id} entry={h} open={open === h.source.id}
                onToggle={() => setOpen(open === h.source.id ? null : h.source.id)} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function SourceCard({ entry, open, onToggle }: { entry: SourceHealthEntry; open: boolean; onToggle: () => void }) {
  const s = entry.source;
  return (
    <div className="source-card">
      <div className="source-head">
        <h3 style={{ flex: '1 1 320px' }}>{s.name}</h3>
        <TierBadge tier={s.tier} />
        {entry.keyMissing && <span className="badge warn">⚙ {s.envVar} gerekli</span>}
        {entry.errorCount > 0 && <span className="badge err">✗ {entry.errorCount} seri hatalı</span>}
        {entry.errorCount === 0 && entry.okCount > 0 && <span className="badge ok">✓ {entry.okCount} seri güncel</span>}
      </div>
      <div className="small muted">{s.org}</div>
      <p className="source-why">{s.why}</p>

      <dl className="kv">
        {s.homepage && <><dt>Kurum</dt><dd><a href={s.homepage} target="_blank" rel="noreferrer noopener">{s.homepage}</a></dd></>}
        {s.docsUrl && <><dt>Veri / API</dt><dd><a href={s.docsUrl} target="_blank" rel="noreferrer noopener">{s.docsUrl}</a></dd></>}
        <dt>Kullanım koşulu</dt><dd>{s.license}</dd>
        <dt>Erişim</dt>
        <dd>
          {s.auth === 'none' && 'Anahtarsız, doğrudan erişim'}
          {s.auth === 'api_key' && <>Ücretsiz API anahtarı — <code className="mono">{s.envVar}</code>{s.signupUrl && <> · <a href={s.signupUrl} target="_blank" rel="noreferrer noopener">anahtar alın</a></>}</>}
          {s.auth === 'login' && <>Kayıt ve giriş gerekir — <code className="mono">{s.envVar}</code>{s.signupUrl && <> · <a href={s.signupUrl} target="_blank" rel="noreferrer noopener">kayıt olun</a></>}</>}
          {s.auth === 'manual' && 'Açık API yok — değerler CSV/elle, kaynak referansıyla girilir'}
        </dd>
      </dl>

      {entry.producedElsewhere.length > 0 && (
        <div className="notice" style={{ marginBottom: 10 }}>
          <span className="notice-icon">↩</span>
          <div className="notice-body">
            <strong>Bu kurumun ürettiği {entry.producedElsewhere.length} gösterge başka bir kanaldan alınıyor</strong>
            <p>
              Veriyi üreten kurum burasıdır; uygulama yalnızca erişim kolaylığı için bir ayna servis kullanır.
              {' '}
              {entry.producedElsewhere.map((m, i) => (
                <span key={m.series.id}>
                  {i > 0 && ' · '}
                  <Link to={`/seri/${m.series.id}`}>{m.series.nameTr}</Link>
                  <span className="muted"> ({m.sourceOrg.replace(/\s*\(.*\)$/, '')} üzerinden)</span>
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      <div className="source-series">
        {entry.seriesCount === 0 ? (
          <span className="small muted">
            Bu kaynaktan doğrudan alınan gösterge yok
            {entry.producedElsewhere.length > 0 ? ' — yukarıdaki listeye bakın.' : '; kaynak, başka bir bağlayıcı tarafından destek amacıyla kullanılıyor.'}
          </span>
        ) : (
        <button type="button" className="btn" onClick={onToggle} aria-expanded={open}>
          {open ? '▾' : '▸'} Bu kaynaktan gelen {entry.seriesCount} gösterge
        </button>
        )}
        {open && (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Gösterge</th><th>Üreten kurum</th><th>Kod / parametre</th><th className="num">Gözlem</th>
                  <th>Son dönem</th><th>Durum</th><th>Doğrulama</th>
                </tr>
              </thead>
              <tbody>
                {entry.series.map((m) => (
                  <tr key={m.series.id}>
                    <td style={{ whiteSpace: 'normal', maxWidth: 280 }}>
                      <Link to={`/seri/${m.series.id}`}>{m.series.nameTr}</Link>
                      <div className="small muted">{m.series.unit} · {m.series.freq}</div>
                    </td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 180 }} className="small">
                      {m.producerOrg ?? <span className="muted">bu kurum</span>}
                    </td>
                    <td className="mono" style={{ whiteSpace: 'normal', maxWidth: 240 }}>
                      {Object.keys(m.series.params).length > 0 ? JSON.stringify(m.series.params) : '—'}
                    </td>
                    <td className="num">{m.count}</td>
                    <td>{m.lastPeriod ? formatPeriod(m.lastPeriod, m.series.freq) : '—'}</td>
                    <td>
                      <StatusBadge meta={m} />
                      <div className="small muted" style={{ marginTop: 3, whiteSpace: 'normal', maxWidth: 300 }}>
                        {m.lastRunMessage ?? `son deneme: ${relativeTime(m.lastRunAt)}`}
                      </div>
                    </td>
                    <td>
                      <ConfidenceBadge confidence={m.series.confidence} />
                      <div style={{ marginTop: 3 }}>
                        <a href={m.series.verifyUrl} target="_blank" rel="noreferrer noopener" className="small">kaynakta aç ↗</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
