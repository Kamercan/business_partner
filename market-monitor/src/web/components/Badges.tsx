import type { SeriesMeta } from '../lib/api.js';
import { relativeTime } from '../lib/format.js';

const TIER_LABEL: Record<string, string> = {
  official: 'Resmî üretici',
  mirror: 'Resmî aynası',
  benchmark: 'Piyasa referansı',
  manual: 'Kurum içi',
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`badge tier-${tier}`} title={tierTitle(tier)}>
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}

function tierTitle(tier: string): string {
  switch (tier) {
    case 'official': return 'Veriyi üreten kurumun kendisi';
    case 'mirror': return 'Resmî veriyi yeniden yayımlayan güvenilir ayna — asıl üretici ayrıca belirtilir';
    case 'benchmark': return 'Piyasanın referans aldığı ticari fiyat değerlendirmesi (genelde abonelikli)';
    default: return 'Kurum içi / elle girilen veri';
  }
}

/** Serinin veri durumu: durum yalnızca renkle değil, simge ve etiketle de anlatılır. */
export function StatusBadge({ meta }: { meta: SeriesMeta }) {
  if (meta.keyMissing) {
    return <span className="badge warn" title={`${meta.keyEnvVar} tanımlı değil`}>⚙ Anahtar gerekli</span>;
  }
  if (meta.count === 0) {
    return meta.series.connector === 'manual'
      ? <span className="badge warn" title="CSV veya elle giriş bekliyor">✎ Veri girilmedi</span>
      : <span className="badge err" title={meta.lastRunMessage ?? 'Veri çekilemedi'}>✗ Veri yok</span>;
  }
  if (meta.lastRunStatus === 'error') {
    return <span className="badge err" title={meta.lastRunMessage ?? ''}>✗ Son güncelleme hatalı</span>;
  }
  if (meta.stale) {
    return <span className="badge warn" title={`Son dönem: ${meta.lastPeriod}`}>⏳ Güncel değil</span>;
  }
  return <span className="badge ok" title={`Son güncelleme: ${relativeTime(meta.lastRunAt)}`}>✓ Güncel</span>;
}

/** Seri kodunun doğrulanma durumu — "canlı doğrulandı" ile "teyit edin" ayrılır. */
export function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === 'verified') {
    return <span className="badge ok" title="Uygulama bu seriyi kaynağından canlı çekmeyi başardı">✓ Doğrulandı</span>;
  }
  if (confidence === 'documented') {
    return <span className="badge" title="Kaynağın dokümantasyonundan alındı; henüz canlı çekilmedi">◔ Belgelendi</span>;
  }
  return (
    <span className="badge warn" title="Seri kodunu kendi ortamınızda teyit edin: npm run sources:check">
      ⚠ Teyit gerekli
    </span>
  );
}
