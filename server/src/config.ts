import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const bool = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const isProd = process.env.NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd,
  port: int(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),

  jwtSecret: jwtSecret || 'dev-only-secret-change-me-in-production-0123456789',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',

  dbFile: path.resolve(ROOT, process.env.DB_FILE ?? './data/portal.db'),
  storageDir: path.resolve(ROOT, process.env.STORAGE_DIR ?? './storage'),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 20) * 1024 * 1024,

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@yanmar.com.tr',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',

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
