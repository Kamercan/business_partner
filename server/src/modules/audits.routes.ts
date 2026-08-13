import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db/index.js';
import { getActivity, logActivity } from '../lib/activity.js';
import { ah, badRequest, notFound, parse } from '../lib/http.js';
import { nextAuditNo } from '../lib/ids.js';
import { notifyAuditAssigned } from '../lib/notifications.js';
import { computeAuditScore } from '../lib/scoring.js';
import { closeTasksFor, createTask } from '../lib/tasks.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

export const auditRoutes = Router();
auditRoutes.use(requireAuth);

const AUDIT_SELECT = `
  SELECT a.*, app.company_name, app.ref_no, app.country, app.city, app.email AS company_email,
         s.supplier_code, u.full_name AS auditor_name,
         t.name_tr AS template_name_tr, t.name_en AS template_name_en,
         (SELECT COUNT(*) FROM audit_scores sc WHERE sc.audit_id = a.id) AS scored_count
    FROM audits a
    LEFT JOIN applications app ON app.id = a.application_id
    LEFT JOIN suppliers s ON s.id = a.supplier_id
    LEFT JOIN users u ON u.id = a.auditor_id
    LEFT JOIN audit_templates t ON t.id = a.template_id`;

const listSchema = z.object({
  status: z.string().optional(),
  auditor: z.coerce.number().int().positive().optional(),
  mine: z.coerce.boolean().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/** Kalite biriminin denetim kuyruğu. */
auditRoutes.get(
  '/',
  ah((req, res) => {
    const q = parse(listSchema, req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (q.status) {
      const list = q.status.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) {
        clauses.push(`a.status IN (${list.map(() => '?').join(',')})`);
        params.push(...list);
      }
    }
    if (q.auditor) {
      clauses.push('a.auditor_id = ?');
      params.push(q.auditor);
    }
    if (q.mine) {
      clauses.push('(a.auditor_id = ? OR a.auditor_id IS NULL)');
      params.push(req.user!.id);
    }
    if (q.q) {
      const like = `%${q.q.toLowerCase()}%`;
      clauses.push('(lower(app.company_name) LIKE ? OR lower(a.audit_no) LIKE ?)');
      params.push(like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) c FROM audits a LEFT JOIN applications app ON app.id = a.application_id ${where}`,
        )
        .get(...params) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `${AUDIT_SELECT} ${where}
         ORDER BY CASE a.status WHEN 'PENDING' THEN 0 WHEN 'PLANNED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,
                  a.planned_date IS NULL, a.planned_date, a.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize);

    res.json({ rows, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) });
  }),
);

auditRoutes.get(
  '/:id',
  ah((req, res) => {
    const id = Number(req.params.id);
    const audit = db.prepare(`${AUDIT_SELECT} WHERE a.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!audit) throw notFound('Denetim bulunamadı.');

    const items = db
      .prepare(
        `SELECT i.id, i.section_tr, i.section_en, i.question_tr, i.question_en, i.weight, i.sort_order,
                s.score, s.note
           FROM audit_template_items i
           LEFT JOIN audit_scores s ON s.item_id = i.id AND s.audit_id = ?
          WHERE i.template_id = ?
          ORDER BY i.sort_order, i.id`,
      )
      .all(id, audit.template_id);

    const documents = db
      .prepare(
        `SELECT d.id, d.kind, d.original_name, d.mime_type, d.size_bytes, d.created_at, u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.owner_type = 'AUDIT' AND d.owner_id = ? ORDER BY d.id DESC`,
      )
      .all(id);

    const notes = db
      .prepare(
        `SELECT n.id, n.body, n.created_at, COALESCE(u.full_name, n.author_label) AS author
           FROM notes n LEFT JOIN users u ON u.id = n.author_id
          WHERE n.entity_type = 'AUDIT' AND n.entity_id = ? ORDER BY n.id DESC`,
      )
      .all(id);

    res.json({ ...audit, items, documents, notes, activity: getActivity('AUDIT', id), live: computeAuditScore(id) });
  }),
);

/** Periyodik / özel denetim açma (onaylı tedarikçiler için). */
const createSchema = z.object({
  supplier_id: z.number().int().positive().optional(),
  application_id: z.number().int().positive().optional(),
  type: z.enum(['INITIAL', 'PERIODIC', 'FOLLOW_UP', 'SPECIAL']).default('PERIODIC'),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  auditor_id: z.number().int().positive().optional(),
  method: z.enum(['ONSITE', 'REMOTE', 'DESKTOP']).optional(),
});

auditRoutes.post(
  '/',
  requireRole('QUALITY', 'MODERATOR'),
  ah(async (req, res) => {
    const body = parse(createSchema, req.body);
    if (!body.supplier_id && !body.application_id) {
      throw badRequest('Denetim için tedarikçi veya başvuru belirtilmelidir.');
    }

    const template = db.prepare('SELECT id FROM audit_templates WHERE is_active = 1 ORDER BY id LIMIT 1').get() as
      | { id: number }
      | undefined;

    const companyName =
      (db.prepare('SELECT company_name FROM suppliers WHERE id = ?').get(body.supplier_id ?? 0) as { company_name: string } | undefined)
        ?.company_name ??
      (db.prepare('SELECT company_name FROM applications WHERE id = ?').get(body.application_id ?? 0) as { company_name: string } | undefined)
        ?.company_name;
    if (!companyName) throw notFound('Tedarikçi veya başvuru bulunamadı.');

    const created = db
      .prepare(
        `INSERT INTO audits (audit_no, application_id, supplier_id, template_id, type, status, auditor_id, planned_date, method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextAuditNo(), body.application_id ?? null, body.supplier_id ?? null, template?.id ?? null,
        body.type, body.planned_date ? 'PLANNED' : 'PENDING', body.auditor_id ?? null,
        body.planned_date ?? null, body.method ?? null,
      );
    const auditId = created.lastInsertRowid as number;

    logActivity({ entityType: 'AUDIT', entityId: auditId, action: 'CREATED', actor: actorOf(req), detail: companyName });
    createTask({
      type: 'PERFORM_AUDIT',
      title: `Tedarikçi denetimi: ${companyName}`,
      subject: companyName,
      entityType: 'AUDIT',
      entityId: auditId,
      assignedRole: 'QUALITY',
      assignedTo: body.auditor_id ?? null,
      dueInDays: 30,
      createdBy: req.user!.id,
    });

    const auditNo = db.prepare('SELECT audit_no FROM audits WHERE id = ?').get(auditId) as { audit_no: string };
    await notifyAuditAssigned({ id: auditId, audit_no: auditNo.audit_no, company_name: companyName });

    res.status(201).json(db.prepare(`${AUDIT_SELECT} WHERE a.id = ?`).get(auditId));
  }),
);

/** Denetim planlama / üstlenme. */
const planSchema = z.object({
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  auditor_id: z.number().int().positive().nullable().optional(),
  method: z.enum(['ONSITE', 'REMOTE', 'DESKTOP']).optional(),
  status: z.enum(['PENDING', 'PLANNED', 'IN_PROGRESS', 'CANCELLED']).optional(),
});

auditRoutes.patch(
  '/:id',
  requireRole('QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(planSchema, req.body);
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id) as
      | { id: number; status: string; application_id: number | null }
      | undefined;
    if (!audit) throw notFound('Denetim bulunamadı.');
    if (audit.status === 'COMPLETED') throw badRequest('Tamamlanmış denetim değiştirilemez.');

    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      updates.push(`${k} = ?`);
      params.push(v);
    }
    // Tarih verilip durum belirtilmediyse otomatik PLANNED
    if (body.planned_date && !body.status && audit.status === 'PENDING') {
      updates.push('status = ?');
      params.push('PLANNED');
    }
    if (updates.length === 0) throw badRequest('Güncellenecek alan gönderilmedi.');

    db.prepare(`UPDATE audits SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);

    const after = db.prepare('SELECT status, planned_date FROM audits WHERE id = ?').get(id) as {
      status: string;
      planned_date: string | null;
    };
    logActivity({
      entityType: 'AUDIT',
      entityId: id,
      action: 'PLANNED',
      actor: actorOf(req),
      from: audit.status,
      to: after.status,
      detail: after.planned_date ? `Planlanan tarih: ${after.planned_date}` : null,
    });

    // Başvuru durumunu iş akışıyla senkron tut
    if (audit.application_id) {
      const map: Record<string, string> = { PLANNED: 'AUDIT_PLANNED', IN_PROGRESS: 'AUDIT_IN_PROGRESS' };
      const target = map[after.status];
      if (target) {
        db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
          target,
          audit.application_id,
        );
        logActivity({
          entityType: 'APPLICATION',
          entityId: audit.application_id,
          action: 'STATUS_CHANGED',
          actor: actorOf(req),
          to: target,
          detail: 'Denetim planlaması ile otomatik güncellendi.',
        });
      }
    }

    if (body.auditor_id !== undefined) {
      db.prepare(
        `UPDATE tasks SET assigned_to = ?, status = CASE WHEN status = 'OPEN' THEN 'IN_PROGRESS' ELSE status END
          WHERE entity_type = 'AUDIT' AND entity_id = ? AND status IN ('OPEN','IN_PROGRESS')`,
      ).run(body.auditor_id ?? null, id);
    }

    res.json(db.prepare(`${AUDIT_SELECT} WHERE a.id = ?`).get(id));
  }),
);

/** Kontrol listesi puanlaması (kısmi kaydetme desteklenir). */
const scoreSchema = z.object({
  scores: z
    .array(z.object({ item_id: z.number().int().positive(), score: z.number().int().min(0).max(100), note: z.string().max(1000).optional() }))
    .min(1)
    .max(200),
});

auditRoutes.put(
  '/:id/scores',
  requireRole('QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(scoreSchema, req.body);
    const audit = db.prepare('SELECT id, status, template_id, application_id FROM audits WHERE id = ?').get(id) as
      | { id: number; status: string; template_id: number; application_id: number | null }
      | undefined;
    if (!audit) throw notFound('Denetim bulunamadı.');
    if (audit.status === 'COMPLETED') throw badRequest('Tamamlanmış denetimin puanları değiştirilemez.');

    const validItems = new Set(
      (db.prepare('SELECT id FROM audit_template_items WHERE template_id = ?').all(audit.template_id) as Array<{ id: number }>).map(
        (r) => r.id,
      ),
    );

    tx(() => {
      const stmt = db.prepare(
        `INSERT INTO audit_scores (audit_id, item_id, score, note) VALUES (?, ?, ?, ?)
         ON CONFLICT(audit_id, item_id) DO UPDATE SET score = excluded.score, note = excluded.note`,
      );
      body.scores
        .filter((s) => validItems.has(s.item_id))
        .forEach((s) => stmt.run(id, s.item_id, s.score, s.note ?? null));

      if (audit.status === 'PENDING' || audit.status === 'PLANNED') {
        db.prepare("UPDATE audits SET status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?").run(id);
        if (audit.application_id) {
          db.prepare("UPDATE applications SET status = 'AUDIT_IN_PROGRESS', updated_at = datetime('now') WHERE id = ?").run(
            audit.application_id,
          );
        }
      }
    });

    res.json({ ok: true, live: computeAuditScore(id) });
  }),
);

/** Denetimi tamamla — puan ve A/B/C/D notu kesinleşir. */
const completeSchema = z.object({
  strengths: z.string().max(4000).optional(),
  findings: z.string().max(4000).optional(),
  recommendation: z.enum(['APPROVE', 'APPROVE_WITH_CONDITIONS', 'REAUDIT', 'REJECT']),
  method: z.enum(['ONSITE', 'REMOTE', 'DESKTOP']).optional(),
  /** Kalite uzmanı, hesaplanan notu gerekçe ile ezebilir. */
  grade_override: z.enum(['A', 'B', 'C', 'D']).optional(),
  override_reason: z.string().max(1000).optional(),
});

auditRoutes.post(
  '/:id/complete',
  requireRole('QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(completeSchema, req.body);
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id) as
      | { id: number; status: string; application_id: number | null; supplier_id: number | null; audit_no: string }
      | undefined;
    if (!audit) throw notFound('Denetim bulunamadı.');
    if (audit.status === 'COMPLETED') throw badRequest('Denetim zaten tamamlanmış.');

    const computed = computeAuditScore(id);
    if (computed.answered === 0) throw badRequest('Denetimi tamamlamadan önce kontrol listesini puanlayınız.');
    if (computed.answered < computed.total) {
      throw badRequest(`Kontrol listesi eksik: ${computed.answered}/${computed.total} madde puanlandı.`);
    }
    if (body.grade_override && !body.override_reason) {
      throw badRequest('Kalite notunu değiştirmek için gerekçe girilmelidir.');
    }

    const grade = body.grade_override ?? computed.grade;

    tx(() => {
      db.prepare(
        `UPDATE audits
            SET status = 'COMPLETED', score = ?, grade = ?, strengths = ?, findings = ?, recommendation = ?,
                method = COALESCE(?, method), auditor_id = COALESCE(auditor_id, ?),
                completed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?`,
      ).run(
        computed.score, grade, body.strengths ?? null, body.findings ?? null, body.recommendation,
        body.method ?? null, req.user!.id, id,
      );

      logActivity({
        entityType: 'AUDIT',
        entityId: id,
        action: 'COMPLETED',
        actor: actorOf(req),
        to: `${grade} (${computed.score})`,
        detail: body.grade_override
          ? `Hesaplanan not ${computed.grade} iken ${grade} olarak değiştirildi. Gerekçe: ${body.override_reason}`
          : `Öneri: ${body.recommendation}`,
      });

      closeTasksFor('AUDIT', id, req.user!.id, ['PERFORM_AUDIT']);

      if (audit.application_id) {
        db.prepare("UPDATE applications SET status = 'AUDIT_DONE', updated_at = datetime('now') WHERE id = ?").run(
          audit.application_id,
        );
        logActivity({
          entityType: 'APPLICATION',
          entityId: audit.application_id,
          action: 'STATUS_CHANGED',
          actor: actorOf(req),
          to: 'AUDIT_DONE',
          detail: `Denetim ${audit.audit_no} tamamlandı — Not: ${grade}`,
        });

        // Karar için satınalmaya geri dönüş görevi
        const app = db.prepare('SELECT company_name FROM applications WHERE id = ?').get(audit.application_id) as {
          company_name: string;
        };
        createTask({
          type: 'REVIEW_APPLICATION',
          title: `Denetim sonucu kararı: ${app.company_name}`,
          description: `Denetim tamamlandı (Not: ${grade}, Puan: ${computed.score}). Onay veya eleme kararı bekleniyor.`,
          subject: app.company_name,
          detailKey: 'task.d.audit.decision',
          detailParams: { grade, score: computed.score },
          entityType: 'APPLICATION',
          entityId: audit.application_id,
          assignedRole: 'MODERATOR',
          priority: 'HIGH',
          dueInDays: 7,
          createdBy: req.user!.id,
        });
      }

      // Periyodik denetimde tedarikçi notunu güncelle
      if (audit.supplier_id) {
        db.prepare(
          `UPDATE suppliers SET grade = ?, next_audit_due = date('now','+1 year'), updated_at = datetime('now') WHERE id = ?`,
        ).run(grade, audit.supplier_id);
        logActivity({
          entityType: 'SUPPLIER',
          entityId: audit.supplier_id,
          action: 'GRADE_UPDATED',
          actor: actorOf(req),
          to: grade,
          detail: `Denetim ${audit.audit_no}`,
        });
      }
    });

    res.json({ ...(db.prepare(`${AUDIT_SELECT} WHERE a.id = ?`).get(id) as object), computed });
  }),
);

auditRoutes.post(
  '/:id/notes',
  requireRole('QUALITY', 'MODERATOR'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    if (!db.prepare('SELECT id FROM audits WHERE id = ?').get(id)) throw notFound('Denetim bulunamadı.');
    const created = db
      .prepare(`INSERT INTO notes (entity_type, entity_id, author_id, body) VALUES ('AUDIT', ?, ?, ?)`)
      .run(id, req.user!.id, body.body);
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

/** Denetim şablonu — puanlama formunu üreten kontrol listesi. */
auditRoutes.get(
  '/templates/active',
  ah((_req, res) => {
    const template = db.prepare('SELECT * FROM audit_templates WHERE is_active = 1 ORDER BY id LIMIT 1').get() as
      | { id: number }
      | undefined;
    if (!template) throw notFound('Aktif denetim şablonu yok.');
    const items = db
      .prepare('SELECT * FROM audit_template_items WHERE template_id = ? ORDER BY sort_order, id')
      .all(template.id);
    res.json({ ...template, items });
  }),
);
