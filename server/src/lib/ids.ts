import crypto from 'node:crypto';
import { db } from '../db/index.js';

/**
 * Yıl bazlı, sıfır dolgulu referans numarası üreticisi.
 * Örn. YTM-BP-2026-00042
 *
 * Sıra numarası **sayısal** olarak bulunur. Metin sıralaması kullanılamaz:
 * farklı dolgu uzunlukları karıştığında ("NCR-2026-0001" ile "NCR-2026-00002")
 * metinsel en büyük, sayısal en büyükle aynı olmaz; üretici aynı numarayı
 * tekrar üretip UNIQUE kısıtına takılır ve yeni kayıt hiç açılamaz.
 */
function sequential(prefix: string, table: string, column: string, date = new Date()): string {
  const year = date.getUTCFullYear();
  const head = `${prefix}-${year}-`;
  // SQLite substr 1 tabanlıdır; başlıktan sonraki kısım sayıya çevrilir.
  const row = db
    .prepare(
      `SELECT MAX(CAST(substr(${column}, ${head.length + 1}) AS INTEGER)) AS v
         FROM ${table} WHERE ${column} LIKE ?`,
    )
    .get(`${head}%`) as { v: number | null } | undefined;
  const last = row?.v ?? 0;
  return `${head}${String(last + 1).padStart(5, '0')}`;
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
