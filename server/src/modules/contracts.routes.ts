import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { getActivity, logActivity } from '../lib/activity.js';
import { ah, badRequest, notFound, parse } from '../lib/http.js';
import { nextContractNo } from '../lib/ids.js';
import { createTask } from '../lib/tasks.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

export const contractRoutes = Router();
contractRoutes.use(requireAuth);

const SELECT = `
  SELECT c.*, s.company_name, s.supplier_code, u.full_name AS owner_name,
         (SELECT COUNT(*) FROM documents d WHERE d.owner_type = 'CONTRACT' AND d.owner_id = c.id) AS document_count,
         CASE
           WHEN c.status IN ('TERMINATED','EXPIRED') THEN 0
           WHEN c.end_date IS NULL THEN 0
           WHEN date(c.end_date) < date('now') THEN 2
           WHEN date(c.end_date) <= date('now', '+' || COALESCE(c.renewal_notice_days, 60) || ' days') THEN 1
           ELSE 0
         END AS expiry_flag,
         CAST(julianday(c.end_date) - julianday('now') AS INTEGER) AS days_remaining
    FROM contracts c
    JOIN suppliers s ON s.id = c.supplier_id
    LEFT JOIN users u ON u.id = c.owner_id`;

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  expiring: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

contractRoutes.get(
  '/',
  ah((req, res) => {
    const q = parse(listSchema, req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (q.q) {
      const like = `%${q.q.toLowerCase()}%`;
      clauses.push('(lower(c.title) LIKE ? OR lower(c.contract_no) LIKE ? OR lower(s.company_name) LIKE ?)');
      params.push(like, like, like);
    }
    const csvIn = (col: string, value?: string) => {
      const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!list.length) return;
      clauses.push(`${col} IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    };
    csvIn('c.status', q.status);
    csvIn('c.type', q.type);
    if (q.supplier_id) {
      clauses.push('c.supplier_id = ?');
      params.push(q.supplier_id);
    }
    if (q.expiring) {
      clauses.push(
        `c.status NOT IN ('TERMINATED','EXPIRED') AND c.end_date IS NOT NULL
         AND date(c.end_date) <= date('now', '+' || COALESCE(c.renewal_notice_days, 60) || ' days')`,
      );
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) c FROM contracts c JOIN suppliers s ON s.id = c.supplier_id ${where}`).get(...params) as {
        c: number;
      }
    ).c;
    const rows = db
      .prepare(`${SELECT} ${where} ORDER BY expiry_flag DESC, c.end_date IS NULL, c.end_date LIMIT ? OFFSET ?`)
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize);

    res.json({ rows, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) });
  }),
);

contractRoutes.get(
  '/:id',
  ah((req, res) => {
    const id = Number(req.params.id);
    const contract = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!contract) throw notFound('Sözleşme bulunamadı.');

    const documents = db
      .prepare(
        `SELECT d.id, d.kind, d.original_name, d.mime_type, d.size_bytes, d.visibility, d.created_at,
                d.uploaded_by_supplier, u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.owner_type = 'CONTRACT' AND d.owner_id = ? ORDER BY d.id DESC`,
      )
      .all(id);
    res.json({ ...contract, documents, activity: getActivity('CONTRACT', id) });
  }),
);

const createSchema = z.object({
  supplier_id: z.number().int().positive(),
  title: z.string().trim().min(3).max(200),
  type: z.enum(['NDA', 'FRAMEWORK', 'PRICE_AGREEMENT', 'QUALITY_AGREEMENT', 'LOGISTICS', 'OTHER']),
  status: z.enum(['DRAFT', 'SENT', 'SIGNED', 'ACTIVE', 'EXPIRED', 'TERMINATED']).default('DRAFT'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().trim().length(3).default('EUR'),
  value: z.number().min(0).nullable().optional(),
  renewal_notice_days: z.number().int().min(0).max(365).default(60),
  auto_renew: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});

contractRoutes.post(
  '/',
  requireRole('MODERATOR'),
  ah((req, res) => {
    const body = parse(createSchema, req.body);
    if (body.start_date && body.end_date && body.end_date < body.start_date) {
      throw badRequest('Bitiş tarihi başlangıç tarihinden önce olamaz.');
    }
    const supplier = db.prepare('SELECT id, company_name FROM suppliers WHERE id = ?').get(body.supplier_id) as
      | { id: number; company_name: string }
      | undefined;
    if (!supplier) throw notFound('Tedarikçi bulunamadı.');

    const created = db
      .prepare(
        `INSERT INTO contracts (contract_no, supplier_id, title, type, status, start_date, end_date, currency, value,
                                renewal_notice_days, auto_renew, owner_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `${nextContractNo()}-${body.type.slice(0, 3)}`, body.supplier_id, body.title, body.type, body.status,
        body.start_date ?? null, body.end_date ?? null, body.currency, body.value ?? null,
        body.renewal_notice_days, body.auto_renew ? 1 : 0, req.user!.id, body.notes ?? null,
      );
    const id = created.lastInsertRowid as number;
    logActivity({
      entityType: 'CONTRACT',
      entityId: id,
      action: 'CREATED',
      actor: actorOf(req),
      detail: `${body.title} — ${supplier.company_name}`,
    });
    res.status(201).json(db.prepare(`${SELECT} WHERE c.id = ?`).get(id));
  }),
);

const patchSchema = createSchema.partial().omit({ supplier_id: true }).extend({
  signed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

contractRoutes.patch(
  '/:id',
  requireRole('MODERATOR'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(patchSchema, req.body);
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id) as
      | { id: number; status: string; start_date: string | null; end_date: string | null }
      | undefined;
    if (!contract) throw notFound('Sözleşme bulunamadı.');

    const start = body.start_date ?? contract.start_date;
    const end = body.end_date ?? contract.end_date;
    if (start && end && end < start) throw badRequest('Bitiş tarihi başlangıç tarihinden önce olamaz.');

    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      updates.push(`${k} = ?`);
      params.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    if (updates.length === 0) throw badRequest('Güncellenecek alan gönderilmedi.');

    db.prepare(`UPDATE contracts SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);

    if (body.status && body.status !== contract.status) {
      logActivity({
        entityType: 'CONTRACT',
        entityId: id,
        action: 'STATUS_CHANGED',
        actor: actorOf(req),
        from: contract.status,
        to: body.status,
      });
    }
    res.json(db.prepare(`${SELECT} WHERE c.id = ?`).get(id));
  }),
);

/**
 * Süresi yaklaşan sözleşmeleri tarar ve yenileme görevleri üretir.
 * Zamanlanmış görev (cron) olarak da çalıştırılabilir.
 */
contractRoutes.post(
  '/scan-expiring',
  requireRole('MODERATOR'),
  ah((req, res) => {
    const rows = db
      .prepare(
        `SELECT c.id, c.contract_no, c.title, c.end_date, s.company_name
           FROM contracts c JOIN suppliers s ON s.id = c.supplier_id
          WHERE c.status NOT IN ('TERMINATED','EXPIRED') AND c.end_date IS NOT NULL
            AND date(c.end_date) <= date('now', '+' || COALESCE(c.renewal_notice_days, 60) || ' days')`,
      )
      .all() as Array<{ id: number; contract_no: string; title: string; end_date: string; company_name: string }>;

    let created = 0;
    rows.forEach((c) => {
      const taskId = createTask({
        type: 'CONTRACT_RENEWAL',
        title: `Sözleşme yenileme: ${c.company_name}`,
        description: `${c.contract_no} — ${c.title} sözleşmesi ${c.end_date} tarihinde sona eriyor.`,
        subject: c.company_name,
        detailKey: 'task.d.contract.expiring',
        detailParams: { no: c.contract_no, title: c.title, date: c.end_date },
        entityType: 'CONTRACT',
        entityId: c.id,
        assignedRole: 'MODERATOR',
        priority: 'NORMAL',
        createdBy: req.user!.id,
      });
      if (taskId) created += 1;
    });

    // Süresi geçmişleri kapat
    const expired = db
      .prepare(
        `UPDATE contracts SET status = 'EXPIRED', updated_at = datetime('now')
          WHERE status NOT IN ('TERMINATED','EXPIRED') AND end_date IS NOT NULL AND date(end_date) < date('now')`,
      )
      .run();

    res.json({ scanned: rows.length, tasks: created, expired: expired.changes });
  }),
);
