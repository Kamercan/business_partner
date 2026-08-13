import { Router } from 'express';
import { db } from '../db/index.js';
import { ah } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

export const statsRoutes = Router();
statsRoutes.use(requireAuth);

/** Yönetim panosu göstergeleri. */
statsRoutes.get(
  '/dashboard',
  ah((req, res) => {
    const one = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as T;

    const totals = one<{ total: number; last30: number; last7: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN created_at > datetime('now','-30 days') THEN 1 ELSE 0 END) AS last30,
              SUM(CASE WHEN created_at > datetime('now','-7 days') THEN 1 ELSE 0 END) AS last7
         FROM applications`,
    );

    const byStatus = db
      .prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status')
      .all() as Array<{ status: string; count: number }>;

    const byCategory = db
      .prepare(
        `SELECT c.code, c.name_tr, c.name_en, c.name_ja, COUNT(ac.application_id) AS count,
                SUM(CASE WHEN a.status = 'APPROVED' THEN 1 ELSE 0 END) AS approved
           FROM categories c
           LEFT JOIN application_categories ac ON ac.category_code = c.code
           LEFT JOIN applications a ON a.id = ac.application_id
          WHERE c.is_active = 1
          GROUP BY c.code
          ORDER BY count DESC`,
      )
      .all();

    const byCountry = db
      .prepare('SELECT country, COUNT(*) AS count FROM applications GROUP BY country ORDER BY count DESC LIMIT 10')
      .all();

    // Son 12 ay aylık trend
    const monthly = db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count,
                SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved
           FROM applications
          WHERE created_at > datetime('now','-12 months')
          GROUP BY month ORDER BY month`,
      )
      .all();

    const grades = db
      .prepare("SELECT grade, COUNT(*) AS count FROM audits WHERE status = 'COMPLETED' AND grade IS NOT NULL GROUP BY grade")
      .all();

    const auditQueue = one<{ pending: number; planned: number; inProgress: number; completed: number }>(
      `SELECT SUM(status = 'PENDING') AS pending, SUM(status = 'PLANNED') AS planned,
              SUM(status = 'IN_PROGRESS') AS inProgress, SUM(status = 'COMPLETED') AS completed
         FROM audits`,
    );

    const suppliers = one<{ total: number; approved: number; conditional: number; suspended: number }>(
      `SELECT COUNT(*) AS total, SUM(status = 'APPROVED') AS approved,
              SUM(status = 'CONDITIONAL') AS conditional, SUM(status IN ('SUSPENDED','BLACKLISTED')) AS suspended
         FROM suppliers`,
    );

    const ncrs = one<{ open: number; overdue: number; closed: number }>(
      `SELECT SUM(status NOT IN ('CLOSED','REJECTED')) AS open,
              SUM(status NOT IN ('CLOSED','REJECTED') AND due_date IS NOT NULL AND date(due_date) < date('now')) AS overdue,
              SUM(status = 'CLOSED') AS closed
         FROM ncrs`,
    );

    const contracts = one<{ active: number; expiring: number; expired: number }>(
      `SELECT SUM(status = 'ACTIVE') AS active,
              SUM(status NOT IN ('TERMINATED','EXPIRED') AND end_date IS NOT NULL
                  AND date(end_date) <= date('now', '+' || COALESCE(renewal_notice_days,60) || ' days')) AS expiring,
              SUM(status = 'EXPIRED') AS expired
         FROM contracts`,
    );

    const myTasks = one<{ open: number; overdue: number }>(
      `SELECT COUNT(*) AS open,
              SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) < date('now') THEN 1 ELSE 0 END) AS overdue
         FROM tasks
        WHERE status IN ('OPEN','IN_PROGRESS') AND (assigned_role = ? OR assigned_to = ?)`,
      req.user!.role,
      req.user!.id,
    );

    // Ortalama ön değerlendirme süresi (gün)
    const cycle = one<{ avg_review_days: number | null; avg_audit_days: number | null }>(
      `SELECT
         (SELECT AVG(julianday(reviewed_at) - julianday(created_at)) FROM applications WHERE reviewed_at IS NOT NULL) AS avg_review_days,
         (SELECT AVG(julianday(completed_at) - julianday(created_at)) FROM audits WHERE completed_at IS NOT NULL) AS avg_audit_days`,
    );

    const needsAttention = db
      .prepare(
        `SELECT id, ref_no, company_name, status, created_at,
                CAST(julianday('now') - julianday(created_at) AS INTEGER) AS age_days
           FROM applications
          WHERE status IN ('NEW','IN_REVIEW')
            AND created_at < datetime('now','-' || (SELECT COALESCE(value,'10') FROM settings WHERE key='sla.review_days') || ' days')
          ORDER BY created_at LIMIT 10`,
      )
      .all();

    res.json({
      totals,
      byStatus,
      byCategory,
      byCountry,
      monthly,
      grades,
      auditQueue,
      suppliers,
      ncrs,
      contracts,
      myTasks,
      cycle: {
        avgReviewDays: cycle.avg_review_days === null ? null : Math.round(cycle.avg_review_days * 10) / 10,
        avgAuditDays: cycle.avg_audit_days === null ? null : Math.round(cycle.avg_audit_days * 10) / 10,
      },
      needsAttention,
    });
  }),
);

/**
 * E-posta kutusu.
 *
 * `audience=INTERNAL` → Yanmar ekibine düşen bildirimler ("gelen kutusu")
 * `audience=SUPPLIER` → tedarikçilere gönderilen yazışmalar ("giden kutusu")
 */
statsRoutes.get(
  '/outbox',
  ah((req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 30)));
    const audience = req.query.audience === 'INTERNAL' || req.query.audience === 'SUPPLIER' ? req.query.audience : null;

    const where = audience ? 'WHERE audience = ?' : '';
    const params = audience ? [audience] : [];
    const total = (db.prepare(`SELECT COUNT(*) c FROM mail_outbox ${where}`).get(...params) as { c: number }).c;
    const rows = db
      .prepare(
        `SELECT id, to_email, audience, subject, template, entity_type, entity_id, status, error, created_at, sent_at
           FROM mail_outbox ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize);

    const counts = db
      .prepare("SELECT SUM(audience = 'INTERNAL') AS internal, SUM(audience = 'SUPPLIER') AS supplier FROM mail_outbox")
      .get() as { internal: number | null; supplier: number | null };

    res.json({
      rows,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      counts: { internal: counts.internal ?? 0, supplier: counts.supplier ?? 0 },
    });
  }),
);

statsRoutes.get(
  '/outbox/:id',
  ah((req, res) => {
    const row = db.prepare('SELECT * FROM mail_outbox WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    return res.json(row);
  }),
);

/** Sistem geneli denetim izi. */
statsRoutes.get(
  '/activity',
  ah((req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const total = (db.prepare('SELECT COUNT(*) c FROM activity_log').get() as { c: number }).c;
    const rows = db
      .prepare(
        `SELECT id, entity_type, entity_id, action, actor_label, from_value, to_value, detail, created_at
           FROM activity_log ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(pageSize, (page - 1) * pageSize);
    res.json({ rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) });
  }),
);
