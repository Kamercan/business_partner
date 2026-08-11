import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import { ah, forbidden, notFound, parse } from '../lib/http.js';
import { actorOf, requireAuth } from '../middleware/auth.js';

export const taskRoutes = Router();
taskRoutes.use(requireAuth);

const SELECT = `
  SELECT t.*, u.full_name AS assignee_name, cb.full_name AS created_by_name,
         CASE t.entity_type
           WHEN 'APPLICATION' THEN (SELECT company_name FROM applications WHERE id = t.entity_id)
           WHEN 'SUPPLIER'    THEN (SELECT company_name FROM suppliers WHERE id = t.entity_id)
           WHEN 'AUDIT'       THEN (SELECT COALESCE(
                                      (SELECT company_name FROM applications ap WHERE ap.id = a.application_id),
                                      (SELECT company_name FROM suppliers su WHERE su.id = a.supplier_id))
                                    FROM audits a WHERE a.id = t.entity_id)
           WHEN 'NCR'         THEN (SELECT s.company_name FROM ncrs n JOIN suppliers s ON s.id = n.supplier_id WHERE n.id = t.entity_id)
           WHEN 'CONTRACT'    THEN (SELECT s.company_name FROM contracts c JOIN suppliers s ON s.id = c.supplier_id WHERE c.id = t.entity_id)
         END AS company_name,
         CASE WHEN t.status IN ('OPEN','IN_PROGRESS') AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')
              THEN 1 ELSE 0 END AS is_overdue
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN users cb ON cb.id = t.created_by`;

const listSchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  mine: z.coerce.boolean().optional(),
  /** Rolüme düşen görevler (atanmamış olanlar dahil) — varsayılan görünüm. */
  myQueue: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

taskRoutes.get(
  '/',
  ah((req, res) => {
    const q = parse(listSchema, req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    const statuses = (q.status ?? 'OPEN,IN_PROGRESS').split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length) {
      clauses.push(`t.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (q.type) {
      const list = q.type.split(',').map((s) => s.trim()).filter(Boolean);
      clauses.push(`t.type IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (q.mine) {
      clauses.push('t.assigned_to = ?');
      params.push(req.user!.id);
    } else if (q.myQueue && req.user!.role !== 'ADMIN') {
      clauses.push('(t.assigned_role = ? OR t.assigned_to = ?)');
      params.push(req.user!.role, req.user!.id);
    }
    if (q.overdue) clauses.push("t.due_date IS NOT NULL AND date(t.due_date) < date('now')");

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (db.prepare(`SELECT COUNT(*) c FROM tasks t ${where}`).get(...params) as { c: number }).c;
    const rows = db
      .prepare(
        `${SELECT} ${where}
         ORDER BY is_overdue DESC,
                  CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 ELSE 2 END,
                  t.due_date IS NULL, t.due_date, t.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize);

    res.json({ rows, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) });
  }),
);

const patchSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  assigned_to: z.number().int().positive().nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

taskRoutes.patch(
  '/:id',
  ah((req, res) => {
    if (req.user!.role === 'VIEWER') throw forbidden('Salt okunur rolde görev güncellenemez.');
    const id = Number(req.params.id);
    const body = parse(patchSchema, req.body);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
      | { id: number; status: string; assigned_role: string; entity_type: string; entity_id: number }
      | undefined;
    if (!task) throw notFound('Görev bulunamadı.');
    if (req.user!.role !== 'ADMIN' && task.assigned_role !== req.user!.role) {
      throw forbidden('Bu görev başka bir birime atanmış.');
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      updates.push(`${k} = ?`);
      params.push(v);
    }
    if (body.status === 'DONE' || body.status === 'CANCELLED') {
      updates.push("completed_at = datetime('now')", 'completed_by = ?');
      params.push(req.user!.id);
    }
    if (updates.length === 0) return res.json(db.prepare(`${SELECT} WHERE t.id = ?`).get(id));

    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);

    if (body.status && body.status !== task.status) {
      logActivity({
        entityType: task.entity_type as 'APPLICATION',
        entityId: task.entity_id,
        action: 'TASK_STATUS_CHANGED',
        actor: actorOf(req),
        from: task.status,
        to: body.status,
      });
    }
    return res.json(db.prepare(`${SELECT} WHERE t.id = ?`).get(id));
  }),
);

/** Görevi üstlen. */
taskRoutes.post(
  '/:id/claim',
  ah((req, res) => {
    if (req.user!.role === 'VIEWER') throw forbidden('Salt okunur rolde görev üstlenilemez.');
    const id = Number(req.params.id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
      | { id: number; assigned_role: string; status: string }
      | undefined;
    if (!task) throw notFound('Görev bulunamadı.');
    if (req.user!.role !== 'ADMIN' && task.assigned_role !== req.user!.role) {
      throw forbidden('Bu görev başka bir birime atanmış.');
    }
    db.prepare(
      `UPDATE tasks SET assigned_to = ?, status = CASE WHEN status = 'OPEN' THEN 'IN_PROGRESS' ELSE status END WHERE id = ?`,
    ).run(req.user!.id, id);
    res.json(db.prepare(`${SELECT} WHERE t.id = ?`).get(id));
  }),
);
