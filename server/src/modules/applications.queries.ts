import { z } from 'zod';
import { db } from '../db/index.js';
import { APPLICATION_SOURCES, APPLICATION_STATUSES } from '../lib/constants.js';

/** Virgülle ayrılmış query parametrelerini diziye çevirir. */
const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return [] as string[];
    const arr = Array.isArray(v) ? v : v.split(',');
    return arr.map((s) => s.trim()).filter(Boolean);
  });

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: csv,
  category: csv,
  cert: csv,
  country: csv,
  sector: csv,
  source: csv,
  assignedTo: z.coerce.number().int().positive().optional(),
  unassigned: z.coerce.boolean().optional(),
  minCompleteness: z.coerce.number().min(0).max(100).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  duplicatesOnly: z.coerce.boolean().optional(),
  /** Kategori filtrelerinde: any = herhangi biri, all = hepsini birden sağlayan */
  categoryMode: z.enum(['any', 'all']).default('any'),
  sort: z
    .enum(['created_at', 'company_name', 'status', 'completeness', 'country'])
    .default('created_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

type Built = { where: string; params: unknown[] };

/**
 * Filtreleri tek bir WHERE cümlesine dönüştürür. Liste, sayım ve Excel
 * export'u aynı yapıyı kullanır; böylece "ekranda gördüğün = export ettiğin".
 */
export function buildWhere(q: ListQuery): Built {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (q.q) {
    const like = `%${q.q.toLowerCase()}%`;
    clauses.push(`(
      lower(a.company_name) LIKE ? OR lower(a.ref_no) LIKE ? OR lower(a.email) LIKE ?
      OR lower(a.contact_name) LIKE ? OR lower(a.city) LIKE ? OR a.tax_id LIKE ?
      OR lower(COALESCE(a.references_text,'')) LIKE ? OR lower(COALESCE(a.about,'')) LIKE ?
    )`);
    params.push(like, like, like, like, like, `%${q.q}%`, like, like);
  }

  const inClause = (column: string, values: string[], allowed?: readonly string[]) => {
    const safe = allowed ? values.filter((v) => allowed.includes(v)) : values;
    if (safe.length === 0) return;
    clauses.push(`${column} IN (${safe.map(() => '?').join(',')})`);
    params.push(...safe);
  };

  inClause('a.status', q.status, APPLICATION_STATUSES);
  inClause('a.source', q.source, APPLICATION_SOURCES);
  inClause('a.country', q.country);
  inClause('a.sector', q.sector);

  // Ürün grubu filtresi — projenin çıkış noktası:
  // "sadece hidrolikçileri filtreleyip göremiyorum"
  if (q.category.length > 0) {
    if (q.categoryMode === 'all') {
      clauses.push(`(
        SELECT COUNT(DISTINCT ac.category_code) FROM application_categories ac
         WHERE ac.application_id = a.id AND ac.category_code IN (${q.category.map(() => '?').join(',')})
      ) = ?`);
      params.push(...q.category, q.category.length);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM application_categories ac
         WHERE ac.application_id = a.id AND ac.category_code IN (${q.category.map(() => '?').join(',')})
      )`);
      params.push(...q.category);
    }
  }

  if (q.cert.length > 0) {
    clauses.push(`(
      SELECT COUNT(DISTINCT ct.cert_code) FROM application_certifications ct
       WHERE ct.application_id = a.id AND ct.cert_code IN (${q.cert.map(() => '?').join(',')})
    ) = ?`);
    params.push(...q.cert, q.cert.length);
  }

  if (q.assignedTo !== undefined) {
    clauses.push('a.assigned_to = ?');
    params.push(q.assignedTo);
  }
  if (q.unassigned) clauses.push('a.assigned_to IS NULL');
  if (q.minCompleteness !== undefined) {
    clauses.push('a.completeness >= ?');
    params.push(q.minCompleteness);
  }
  if (q.duplicatesOnly) clauses.push('a.duplicate_of IS NOT NULL');
  if (q.dateFrom) {
    clauses.push('date(a.created_at) >= date(?)');
    params.push(q.dateFrom);
  }
  if (q.dateTo) {
    clauses.push('date(a.created_at) <= date(?)');
    params.push(q.dateTo);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const SORT_COLUMNS: Record<ListQuery['sort'], string> = {
  created_at: 'a.created_at',
  company_name: 'a.company_name COLLATE NOCASE',
  status: 'a.status',
  completeness: 'a.completeness',
  country: 'a.country',
};

export type ApplicationRow = {
  id: number;
  ref_no: string;
  company_name: string;
  tax_id: string;
  sector: string;
  country: string;
  city: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string | null;
  employee_band: string | null;
  revenue_band: string | null;
  founded_year: number | null;
  status: string;
  source: string;
  priority: string;
  completeness: number;
  duplicate_of: number | null;
  assigned_to: number | null;
  assignee_name: string | null;
  created_at: string;
  updated_at: string;
  categories: string;
  certifications: string;
  document_count: number;
  grade: string | null;
};

const BASE_SELECT = `
  SELECT a.id, a.ref_no, a.company_name, a.tax_id, a.sector, a.country, a.city,
         a.contact_name, a.email, a.phone, a.website, a.employee_band, a.revenue_band, a.founded_year,
         a.status, a.source, a.priority, a.completeness, a.duplicate_of, a.assigned_to,
         u.full_name AS assignee_name, a.created_at, a.updated_at,
         COALESCE((SELECT group_concat(ac.category_code) FROM application_categories ac WHERE ac.application_id = a.id), '') AS categories,
         COALESCE((SELECT group_concat(ct.cert_code) FROM application_certifications ct WHERE ct.application_id = a.id), '') AS certifications,
         (SELECT COUNT(*) FROM documents d WHERE d.owner_type = 'APPLICATION' AND d.owner_id = a.id) AS document_count,
         (SELECT ad.grade FROM audits ad WHERE ad.application_id = a.id AND ad.grade IS NOT NULL ORDER BY ad.id DESC LIMIT 1) AS grade
    FROM applications a
    LEFT JOIN users u ON u.id = a.assigned_to`;

export function queryApplications(q: ListQuery): { rows: ApplicationRow[]; total: number } {
  const { where, params } = buildWhere(q);
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM applications a ${where}`).get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `${BASE_SELECT} ${where} ORDER BY ${SORT_COLUMNS[q.sort]} ${q.dir === 'asc' ? 'ASC' : 'DESC'}, a.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as ApplicationRow[];

  return { rows, total };
}

/** Export için sayfalama olmadan tüm eşleşen kayıtlar (üst sınır ile). */
export function queryApplicationsForExport(q: ListQuery, limit = 10000): ApplicationRow[] {
  const { where, params } = buildWhere(q);
  return db
    .prepare(`${BASE_SELECT} ${where} ORDER BY ${SORT_COLUMNS[q.sort]} ${q.dir === 'asc' ? 'ASC' : 'DESC'}, a.id DESC LIMIT ?`)
    .all(...params, limit) as ApplicationRow[];
}
