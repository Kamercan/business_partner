import { config } from '../config.js';
import { ingestAll } from './ingest.js';
import { getSetting } from './store.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Aynı anda ikinci bir güncelleme başlamasın. */
export function isRefreshing(): boolean {
  return running;
}

export async function refreshNow(opts: { onlyMissing?: boolean } = {}): Promise<void> {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const results = await ingestAll({ onlyMissing: opts.onlyMissing });
    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'error');
    console.log(
      `[güncelleme] ${ok} başarılı · ${skipped} atlandı · ${failed.length} hata ` +
      `(${((Date.now() - started) / 1000).toFixed(1)} sn)`,
    );
    for (const f of failed.slice(0, 10)) console.warn(`  ✗ ${f.seriesId}: ${f.message}`);
  } finally {
    running = false;
  }
}

/** Düzenli güncellemeyi başlatır. REFRESH_MINUTES=0 ile kapatılır. */
export function startScheduler(): void {
  if (config.refreshMinutes <= 0) {
    console.log('[zamanlayıcı] kapalı (REFRESH_MINUTES=0)');
    return;
  }
  const intervalMs = config.refreshMinutes * 60_000;
  timer = setInterval(() => { void refreshNow(); }, intervalMs);
  timer.unref?.();
  console.log(`[zamanlayıcı] her ${config.refreshMinutes} dakikada bir güncelleme`);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function lastIngestAt(): string | null {
  return getSetting('last_ingest_at');
}
