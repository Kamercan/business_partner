import 'dotenv/config';
import { resolve } from 'node:path';

const dataDir = process.env.DATA_DIR ?? resolve(process.cwd(), 'data');

/** Bir ortam değişkeni tanımlı ve boş değilse döner. */
export function envKey(name: string | undefined): string | null {
  if (!name) return null;
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export const config = {
  port: Number(process.env.PORT ?? 4100),
  dataDir,
  dbPath: process.env.DB_PATH ?? resolve(dataDir, 'market.db'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Açılışta eksik verileri otomatik çekmeye çalış. */
  autoIngestOnBoot: process.env.AUTO_INGEST_ON_BOOT !== 'false',
  /** Zamanlanmış güncelleme aralığı (dakika). 0 = kapalı. */
  refreshMinutes: Number(process.env.REFRESH_MINUTES ?? 360),
  /** Dış isteklerde zaman aşımı (ms). */
  httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? 30_000),
  /** Yazma uçlarını korumak için istenirse bir jeton. Boşsa yerel kullanım varsayılır. */
  adminToken: process.env.ADMIN_TOKEN ?? '',
} as const;
