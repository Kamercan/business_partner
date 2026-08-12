/** Form ve panel genelinde kullanılan sabit listeler. */

export const EMPLOYEE_BANDS = ['1-50', '51-250', '251-1000', '1000+'] as const;
export const REVENUE_BANDS = ['<1M', '1-10M', '10-50M', '50M+'] as const;

export const COUNTRIES = [
  { code: 'tr', tr: 'Türkiye', en: 'Türkiye' },
  { code: 'bg', tr: 'Bulgaristan', en: 'Bulgaria' },
  { code: 'gr', tr: 'Yunanistan', en: 'Greece' },
  { code: 'ro', tr: 'Romanya', en: 'Romania' },
  { code: 'rs', tr: 'Sırbistan', en: 'Serbia' },
  { code: 'me', tr: 'Karadağ', en: 'Montenegro' },
  { code: 'ba', tr: 'Bosna-Hersek', en: 'Bosnia & Herzegovina' },
  { code: 'hr', tr: 'Hırvatistan', en: 'Croatia' },
  { code: 'si', tr: 'Slovenya', en: 'Slovenia' },
  { code: 'al', tr: 'Arnavutluk', en: 'Albania' },
  { code: 'mk', tr: 'Kuzey Makedonya', en: 'North Macedonia' },
  { code: 'xk', tr: 'Kosova', en: 'Kosovo' },
  { code: 'md', tr: 'Moldova', en: 'Moldova' },
  { code: 'other', tr: 'Diğer', en: 'Other' },
] as const;

export const APPLICATION_STATUSES = [
  'NEW',
  'IN_REVIEW',
  'NEEDS_INFO',
  'AUDIT_PENDING',
  'AUDIT_PLANNED',
  'AUDIT_IN_PROGRESS',
  'AUDIT_DONE',
  'APPROVED',
  'REJECTED',
  'ON_HOLD',
  'DISQUALIFIED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Tedarikçinin tek başvuru kanalı bu portaldır. Alan, geçmiş kayıtlarla
 * uyum için şemada duruyor ancak arayüzde gösterilmez ve filtrelenmez.
 */
export const APPLICATION_SOURCES = ['WEB_FORM'] as const;

export const ROLES = ['ADMIN', 'MODERATOR', 'QUALITY', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const DOCUMENT_KINDS = [
  'PRESENTATION',
  'CATALOG',
  'ISO9001',
  'CERT_OTHER',
  'FINANCIAL',
  'AUDIT_REPORT',
  'CONTRACT_FILE',
  'NCR_RESPONSE',
  'OTHER',
] as const;

/**
 * Başvuru durum makinesi. Bir durumdan hangi durumlara geçilebileceğini
 * merkezî olarak tanımlar; iş akışı kuralları tek yerden değiştirilebilir.
 */
export const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  NEW: ['IN_REVIEW', 'NEEDS_INFO', 'AUDIT_PENDING', 'REJECTED', 'ON_HOLD'],
  IN_REVIEW: ['NEEDS_INFO', 'AUDIT_PENDING', 'REJECTED', 'ON_HOLD'],
  NEEDS_INFO: ['IN_REVIEW', 'AUDIT_PENDING', 'REJECTED', 'ON_HOLD'],
  ON_HOLD: ['IN_REVIEW', 'AUDIT_PENDING', 'REJECTED'],
  AUDIT_PENDING: ['AUDIT_PLANNED', 'AUDIT_IN_PROGRESS', 'ON_HOLD', 'REJECTED'],
  AUDIT_PLANNED: ['AUDIT_IN_PROGRESS', 'AUDIT_PENDING', 'ON_HOLD', 'REJECTED'],
  AUDIT_IN_PROGRESS: ['AUDIT_DONE', 'AUDIT_PLANNED', 'ON_HOLD'],
  AUDIT_DONE: ['APPROVED', 'DISQUALIFIED', 'AUDIT_PENDING'],
  APPROVED: ['ON_HOLD'],
  REJECTED: ['IN_REVIEW'],
  DISQUALIFIED: ['AUDIT_PENDING'],
};

/** Kalite notu eşikleri (settings tablosundan override edilebilir). */
export const DEFAULT_GRADE_THRESHOLDS = { A: 85, B: 70, C: 55 };
