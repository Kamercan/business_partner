import { Router } from 'express';
import { z } from 'zod';
import { db, getSettingNumber } from '../db/index.js';
import { getActivity, logActivity } from '../lib/activity.js';
import { ah, badRequest, notFound, parse } from '../lib/http.js';
import { nextNcrNo, randomToken, sha256 } from '../lib/ids.js';
import { notifyNcrOpened } from '../lib/notifications.js';
import { closeTasksFor, createTask } from '../lib/tasks.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

export const ncrRoutes = Router();
ncrRoutes.use(requireAuth);

const SELECT = `
  SELECT n.*, s.company_name, s.supplier_code, s.email AS supplier_email, s.lang AS supplier_lang,
         uo.full_name AS opened_by_name, uc.full_name AS closed_by_name,
         (SELECT COUNT(*) FROM documents d WHERE d.owner_type = 'NCR' AND d.owner_id = n.id) AS document_count,
         CASE WHEN n.status NOT IN ('CLOSED','REJECTED') AND n.due_date IS NOT NULL AND date(n.due_date) < date('now')
              THEN 1 ELSE 0 END AS is_overdue
    FROM ncrs n
    JOIN suppliers s ON s.id = n.supplier_id
    LEFT JOIN users uo ON uo.id = n.opened_by
    LEFT JOIN users uc ON uc.id = n.closed_by`;

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  overdue: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

ncrRoutes.get(
  '/',
  ah((req, res) => {
    const q = parse(listSchema, req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (q.q) {
      const like = `%${q.q.toLowerCase()}%`;
      clauses.push('(lower(n.title) LIKE ? OR lower(n.ncr_no) LIKE ? OR lower(s.company_name) LIKE ? OR lower(COALESCE(n.part_no,\'\')) LIKE ?)');
      params.push(like, like, like, like);
    }
    const csvIn = (col: string, value?: string) => {
      const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!list.length) return;
      clauses.push(`${col} IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    };
    csvIn('n.status', q.status);
    csvIn('n.severity', q.severity);
    if (q.supplier_id) {
      clauses.push('n.supplier_id = ?');
      params.push(q.supplier_id);
    }
    if (q.overdue) clauses.push("n.status NOT IN ('CLOSED','REJECTED') AND n.due_date IS NOT NULL AND date(n.due_date) < date('now')");

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) c FROM ncrs n JOIN suppliers s ON s.id = n.supplier_id ${where}`).get(...params) as {
        c: number;
      }
    ).c;
    const rows = db
      .prepare(`${SELECT} ${where} ORDER BY is_overdue DESC, n.id DESC LIMIT ? OFFSET ?`)
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize);

    res.json({ rows, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) });
  }),
);

ncrRoutes.get(
  '/:id',
  ah((req, res) => {
    const id = Number(req.params.id);
    const ncr = db.prepare(`${SELECT} WHERE n.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!ncr) throw notFound('Uygunsuzluk raporu bulunamadı.');

    const documents = db
      .prepare(
        `SELECT d.id, d.kind, d.original_name, d.mime_type, d.size_bytes, d.visibility, d.created_at,
                d.uploaded_by_supplier, u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.owner_type = 'NCR' AND d.owner_id = ? ORDER BY d.id DESC`,
      )
      .all(id);
    const notes = db
      .prepare(
        `SELECT n.id, n.body, n.visibility, n.created_at, COALESCE(u.full_name, n.author_label) AS author
           FROM notes n LEFT JOIN users u ON u.id = n.author_id
          WHERE n.entity_type = 'NCR' AND n.entity_id = ? ORDER BY n.id DESC`,
      )
      .all(id);

    res.json({ ...ncr, documents, notes, activity: getActivity('NCR', id) });
  }),
);

const createSchema = z.object({
  supplier_id: z.number().int().positive(),
  title: z.string().trim().min(3).max(200),
  category: z.enum(['PRODUCT', 'PROCESS', 'DOCUMENTATION', 'DELIVERY', 'SYSTEM']),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']),
  description: z.string().trim().min(10).max(4000),
  part_no: z.string().trim().max(80).optional(),
  qty_affected: z.number().int().min(0).optional(),
  detected_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notify: z.boolean().default(true),
});

ncrRoutes.post(
  '/',
  requireRole('QUALITY', 'MODERATOR'),
  ah(async (req, res) => {
    const body = parse(createSchema, req.body);
    const supplier = db.prepare('SELECT id, company_name, email, lang FROM suppliers WHERE id = ?').get(body.supplier_id) as
      | { id: number; company_name: string; email: string; lang: string }
      | undefined;
    if (!supplier) throw notFound('Tedarikçi bulunamadı.');

    const dueDate =
      body.due_date ??
      new Date(Date.now() + getSettingNumber('sla.ncr_response_days', 14) * 86400_000).toISOString().slice(0, 10);
    const ncrNo = nextNcrNo();

    const created = db
      .prepare(
        `INSERT INTO ncrs (ncr_no, supplier_id, title, category, severity, description, part_no, qty_affected,
                           detected_at, due_date, status, opened_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      )
      .run(
        ncrNo, body.supplier_id, body.title, body.category, body.severity, body.description,
        body.part_no ?? null, body.qty_affected ?? null,
        body.detected_at ?? new Date().toISOString().slice(0, 10), dueDate, req.user!.id,
      );
    const ncrId = created.lastInsertRowid as number;

    logActivity({
      entityType: 'NCR',
      entityId: ncrId,
      action: 'OPENED',
      actor: actorOf(req),
      to: 'OPEN',
      detail: `${body.severity} — ${body.title}`,
    });
    createTask({
      type: 'REVIEW_NCR_RESPONSE',
      title: `Uygunsuzluk takibi: ${supplier.company_name}`,
      description: `${ncrNo} — tedarikçinin düzeltici faaliyet cevabı bekleniyor.`,
      subject: supplier.company_name,
      detailKey: 'task.d.ncr.response',
      detailParams: { no: ncrNo },
      entityType: 'NCR',
      entityId: ncrId,
      assignedRole: 'QUALITY',
      priority: body.severity === 'CRITICAL' ? 'HIGH' : 'NORMAL',
      dueInDays: getSettingNumber('sla.ncr_response_days', 14),
      createdBy: req.user!.id,
    });

    if (body.notify) {
      const token = randomToken();
      db.prepare(
        `INSERT INTO portal_tokens (token_hash, purpose, entity_type, entity_id, email, expires_at)
         VALUES (?, 'NCR_RESPONSE', 'NCR', ?, ?, datetime('now','+60 days'))`,
      ).run(sha256(token), ncrId, supplier.email);
      await notifyNcrOpened(
        { id: ncrId, ncr_no: ncrNo, title: body.title, severity: body.severity, due_date: dueDate, description: body.description },
        supplier,
        token,
      );
    }

    res.status(201).json(db.prepare(`${SELECT} WHERE n.id = ?`).get(ncrId));
  }),
);

const patchSchema = z.object({
  status: z.enum(['OPEN', 'SUPPLIER_RESPONDED', 'UNDER_REVIEW', 'CLOSED', 'REJECTED']).optional(),
  containment: z.string().max(4000).nullable().optional(),
  root_cause: z.string().max(4000).nullable().optional(),
  corrective_action: z.string().max(4000).nullable().optional(),
  preventive_action: z.string().max(4000).nullable().optional(),
  effectiveness: z.string().max(2000).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
});

ncrRoutes.patch(
  '/:id',
  requireRole('QUALITY', 'MODERATOR'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(patchSchema, req.body);
    const ncr = db.prepare('SELECT * FROM ncrs WHERE id = ?').get(id) as
      | { id: number; status: string; root_cause: string | null; corrective_action: string | null }
      | undefined;
    if (!ncr) throw notFound('Uygunsuzluk raporu bulunamadı.');

    // Kapatma, kök neden ve düzeltici faaliyet olmadan yapılamaz.
    if (body.status === 'CLOSED') {
      const rootCause = body.root_cause ?? ncr.root_cause;
      const corrective = body.corrective_action ?? ncr.corrective_action;
      if (!rootCause || !corrective) {
        throw badRequest('Uygunsuzluk kapatılmadan önce kök neden ve düzeltici faaliyet girilmelidir.');
      }
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      updates.push(`${k} = ?`);
      params.push(v);
    }
    if (body.status === 'CLOSED') {
      updates.push("closed_at = datetime('now')", 'closed_by = ?');
      params.push(req.user!.id);
    }
    if (updates.length === 0) throw badRequest('Güncellenecek alan gönderilmedi.');

    db.prepare(`UPDATE ncrs SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);

    if (body.status && body.status !== ncr.status) {
      logActivity({
        entityType: 'NCR',
        entityId: id,
        action: 'STATUS_CHANGED',
        actor: actorOf(req),
        from: ncr.status,
        to: body.status,
      });
      if (['CLOSED', 'REJECTED'].includes(body.status)) closeTasksFor('NCR', id, req.user!.id);
    }

    res.json(db.prepare(`${SELECT} WHERE n.id = ?`).get(id));
  }),
);

ncrRoutes.post(
  '/:id/notes',
  requireRole('QUALITY', 'MODERATOR'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(
      z.object({ body: z.string().trim().min(1).max(4000), visibility: z.enum(['INTERNAL', 'SHARED']).default('INTERNAL') }),
      req.body,
    );
    if (!db.prepare('SELECT id FROM ncrs WHERE id = ?').get(id)) throw notFound('Uygunsuzluk raporu bulunamadı.');
    const created = db
      .prepare(`INSERT INTO notes (entity_type, entity_id, author_id, body, visibility) VALUES ('NCR', ?, ?, ?, ?)`)
      .run(id, req.user!.id, body.body, body.visibility);
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

/** Tedarikçiye yeni bir cevap bağlantısı gönderir. */
ncrRoutes.post(
  '/:id/resend-link',
  requireRole('QUALITY', 'MODERATOR'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const ncr = db.prepare(`${SELECT} WHERE n.id = ?`).get(id) as
      | {
          id: number; ncr_no: string; title: string; severity: string; due_date: string | null;
          description: string; company_name: string; supplier_email: string; supplier_lang: string;
        }
      | undefined;
    if (!ncr) throw notFound('Uygunsuzluk raporu bulunamadı.');

    const token = randomToken();
    db.prepare(
      `INSERT INTO portal_tokens (token_hash, purpose, entity_type, entity_id, email, expires_at)
       VALUES (?, 'NCR_RESPONSE', 'NCR', ?, ?, datetime('now','+60 days'))`,
    ).run(sha256(token), id, ncr.supplier_email);

    await notifyNcrOpened(ncr, { company_name: ncr.company_name, email: ncr.supplier_email, lang: ncr.supplier_lang }, token);
    logActivity({ entityType: 'NCR', entityId: id, action: 'LINK_RESENT', actor: actorOf(req) });
    res.json({ ok: true });
  }),
);
