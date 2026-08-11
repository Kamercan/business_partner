import { db, getSettingNumber } from '../db/index.js';
import { DEFAULT_GRADE_THRESHOLDS } from './constants.js';

export type ApplicationLike = {
  company_name: string;
  tax_id: string;
  founded_year: number | null;
  employee_band: string | null;
  revenue_band: string | null;
  website: string | null;
  sector: string;
  contact_name: string;
  contact_position: string | null;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string | null;
  references_text: string | null;
  about: string | null;
};

/**
 * Başvuru doluluk skoru (0-100). Moderatörün kuyruğu önceliklendirmesi için
 * hızlı bir sinyal: zorunlu alanlar zaten dolu olduğundan asıl ayrımı
 * opsiyonel bilgiler, sertifikalar ve yüklenen belgeler yapar.
 */
export function computeCompleteness(
  app: ApplicationLike,
  categories: string[],
  certifications: string[],
  documentCount: number,
): number {
  let score = 0;

  // Zorunlu çekirdek (35 puan)
  const core = [app.company_name, app.tax_id, app.sector, app.contact_name, app.email, app.phone, app.country, app.city];
  score += Math.round((core.filter((v) => String(v ?? '').trim() !== '').length / core.length) * 35);

  // Firma profili derinliği (25 puan)
  const optional: Array<unknown> = [
    app.founded_year, app.employee_band, app.revenue_band, app.website,
    app.contact_position, app.address, app.references_text,
  ];
  score += Math.round((optional.filter((v) => v !== null && String(v).trim() !== '').length / optional.length) * 15);
  if ((app.about ?? '').trim().length >= 120) score += 10;
  else if ((app.about ?? '').trim().length > 0) score += 5;

  // Kategori seçimi (10 puan)
  if (categories.length > 0) score += 6;
  if (categories.length > 1) score += 4;

  // Kalite sertifikaları (15 puan)
  score += Math.min(15, certifications.length * 5);

  // Yüklenen belgeler (15 puan) — 3 zorunlu belge hedeflenir
  score += Math.min(15, documentCount * 5);

  return Math.max(0, Math.min(100, score));
}

/** Ağırlıklı denetim puanından A/B/C/D notunu türetir. */
export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  const a = getSettingNumber('grade.threshold.A', DEFAULT_GRADE_THRESHOLDS.A);
  const b = getSettingNumber('grade.threshold.B', DEFAULT_GRADE_THRESHOLDS.B);
  const c = getSettingNumber('grade.threshold.C', DEFAULT_GRADE_THRESHOLDS.C);
  if (score >= a) return 'A';
  if (score >= b) return 'B';
  if (score >= c) return 'C';
  return 'D';
}

/**
 * Denetim puanlarını ağırlıklı ortalama ile 0-100 aralığına indirger.
 * Puanlanmamış maddeler hesaba katılmaz (kısmi denetim desteklenir).
 */
export function computeAuditScore(auditId: number): { score: number; grade: 'A' | 'B' | 'C' | 'D'; answered: number; total: number } {
  const rows = db
    .prepare(
      `SELECT i.weight AS weight, s.score AS score
         FROM audit_template_items i
         JOIN audits a ON a.template_id = i.template_id
         LEFT JOIN audit_scores s ON s.item_id = i.id AND s.audit_id = a.id
        WHERE a.id = ?`,
    )
    .all(auditId) as Array<{ weight: number; score: number | null }>;

  const answered = rows.filter((r) => r.score !== null);
  const totalWeight = answered.reduce((sum, r) => sum + r.weight, 0);
  const score = totalWeight === 0 ? 0 : answered.reduce((sum, r) => sum + r.weight * (r.score as number), 0) / totalWeight;
  const rounded = Math.round(score * 10) / 10;
  return { score: rounded, grade: scoreToGrade(rounded), answered: answered.length, total: rows.length };
}
