import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const bool = (v: string | undefined, fallback = false) =>
  v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const isProd = process.env.NODE_ENV === 'production';

/**
 * Kalıcı veri dizini. Railway/Docker gibi ortamlarda kalıcı disk (volume)
 * buraya bağlanır; veritabanı ve yüklenen belgeler bu dizinde tutulur.
 */
const dataDir = path.resolve(ROOT, process.env.DATA_DIR ?? './data');
fs.mkdirSync(dataDir, { recursive: true });

/**
 * JWT imza anahtarı çözümlemesi:
 *   1. JWT_SECRET tanımlıysa onu kullan (önerilen).
 *   2. Üretimde tanımlı değilse güçlü bir anahtar üret ve kalıcı diske yaz —
 *      böylece elle anahtar üretmeden dağıtım yapılabilir, yeniden başlatmada
 *      oturumlar düşmez.
 *   3. Geliştirmede sabit bir geliştirme anahtarı yeterlidir.
 */
function resolveJwtSecret(): string {
  const fromEnv = (process.env.JWT_SECRET ?? '').trim();
  if (fromEnv.length >= 32) return fromEnv;

  if (!isProd) return fromEnv || 'dev-only-secret-change-me-in-production-0123456789';

  if (fromEnv.length > 0) {
    throw new Error(`JWT_SECRET en az 32 karakter olmalıdır (şu an ${fromEnv.length}).`);
  }

  const file = path.join(dataDir, '.jwt-secret');
  if (fs.existsSync(file)) {
    const stored = fs.readFileSync(file, 'utf8').trim();
    if (stored.length >= 32) return stored;
  }

  const generated = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, generated, { mode: 0o600 });
  console.warn('⚠  JWT_SECRET tanımlı değil — kalıcı diske güçlü bir anahtar üretildi.');
  console.warn('   Kalıcı disk sıfırlanırsa oturumlar düşer. Kalıcılık için JWT_SECRET tanımlayın.');
  return generated;
}

/** Railway ve benzeri platformlar genel alan adını ortam değişkeniyle bildirir. */
function resolvePublicBaseUrl(): string {
  const explicit = (process.env.PUBLIC_BASE_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const railway = (process.env.RAILWAY_PUBLIC_DOMAIN ?? '').trim();
  if (railway) return `https://${railway.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  return 'http://localhost:5173';
}

const publicBaseUrl = resolvePublicBaseUrl();

/**
 * İzin verilen origin listesi. Üretimde arayüz ve API aynı kökenden
 * (aynı sunucu) servis edildiği için CORS'a genelde gerek kalmaz;
 * yine de genel adres listeye eklenir.
 */
function resolveCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return isProd ? [publicBaseUrl] : ['http://localhost:5173'];
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd,
  port: int(process.env.PORT, 4000),
  corsOrigins: resolveCorsOrigins(),
  publicBaseUrl,

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',

  dataDir,
  dbFile: process.env.DB_FILE ? path.resolve(ROOT, process.env.DB_FILE) : path.join(dataDir, 'portal.db'),
  storageDir: process.env.STORAGE_DIR ? path.resolve(ROOT, process.env.STORAGE_DIR) : path.join(dataDir, 'storage'),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 20) * 1024 * 1024,

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@yanmar.com.tr',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? '',

  /**
   * Demo modu: örnek başvurular, tedarikçiler ve rol hesapları oluşturulur;
   * giriş ekranında demo hesapları gösterilir. Gerçek kullanımda kapatılmalıdır.
   */
  demoMode: bool(process.env.SEED_DEMO, true),

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
  mailFrom: process.env.MAIL_FROM ?? 'Yanmar Türkiye Business Partner <no-reply@yanmar.com.tr>',
  notifyEmails: (process.env.NOTIFY_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Yüklenmesine izin verilen dosya türleri. */
  allowedMime: new Set([
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'application/zip',
    'application/x-zip-compressed',
  ]),
};

export const CONSENT_VERSION = 'KVKK-2026-01';
