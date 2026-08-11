import crypto from 'node:crypto';
import { db } from '../db/index.js';

/**
 * Yıl bazlı, sıfır dolgulu referans numarası üreticisi.
 * Örn. YTM-BP-2026-00042
 */
function sequential(prefix: string, table: string, column: string, date = new Date()): string {
  const year = date.getUTCFullYear();
  const like = `${prefix}-${year}-%`;
  const row = db
    .prepare(`SELECT ${column} AS v FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`)
    .get(like) as { v: string } | undefined;
  const last = row ? Number(row.v.split('-').pop()) : 0;
  const next = (Number.isFinite(last) ? last : 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
}

export const nextRefNo = (date?: Date) => sequential('YTM-BP', 'applications', 'ref_no', date);
export const nextAuditNo = (date?: Date) => sequential('DNT', 'audits', 'audit_no', date);
export const nextNcrNo = (date?: Date) => sequential('NCR', 'ncrs', 'ncr_no', date);
export const nextContractNo = (date?: Date) => sequential('SZL', 'contracts', 'contract_no', date);

/** TED-0001 biçiminde tedarikçi kodu. */
export function nextSupplierCode(): string {
  const row = db
    .prepare("SELECT supplier_code AS v FROM suppliers ORDER BY id DESC LIMIT 1")
    .get() as { v: string } | undefined;
  const last = row ? Number(row.v.split('-').pop()) : 0;
  return `TED-${String((Number.isFinite(last) ? last : 0) + 1).padStart(4, '0')}`;
}

/** URL güvenli rastgele token. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
