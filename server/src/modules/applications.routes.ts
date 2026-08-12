import { Router } from 'express';
import { z } from 'zod';
import { CONSENT_VERSION } from '../config.js';
import { db, tx } from '../db/index.js';
import { getActivity, logActivity } from '../lib/activity.js';
import { STATUS_TRANSITIONS, type ApplicationStatus } from '../lib/constants.js';
import { buildApplicationsWorkbook } from '../lib/excel.js';
import { ah, badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { nextAuditNo, nextRefNo, nextSupplierCode, randomToken, sha256 } from '../lib/ids.js';
import {
  notifyApplicationReceived,
  notifyAuditAssigned,
  notifyInfoRequest,
  notifyPortalInvite,
  notifyStatusChange,
} from '../lib/notifications.js';
import { computeCompleteness } from '../lib/scoring.js';
import { normalizeCompany, normalizeTaxId } from '../lib/text.js';
import { closeTasksFor, createTask } from '../lib/tasks.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';
import { persistDocument, upload } from '../middleware/upload.js';
import { submitLimiter } from '../middleware/rateLimit.js';
import { listQuerySchema, queryApplications, queryApplicationsForExport } from './applications.queries.js';

export const publicApplications = Router();
export const adminApplications = Router();

// ---------------------------------------------------------------------------
// FAZ 1 — Kamuya açık başvuru
// ---------------------------------------------------------------------------

const submitSchema = z.object({
  company_name: z.string().trim().min(2, 'Firma adı en az 2 karakter olmalıdır.').max(200),
  tax_id: z.string().trim().min(4, 'Vergi / DUNS numarası geçersiz.').max(40),
  founded_year: z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional().nullable(),
  employee_band: z.string().trim().max(40).optional().nullable(),
  revenue_band: z.string().trim().max(40).optional().nullable(),
  website: z.string().trim().max(200).optional().nullable(),
  sector: z.string().trim().min(1, 'Sektör seçimi zorunludur.').max(60),
  sector_other: z.string().trim().max(120).optional().nullable(),

  contact_name: z.string().trim().min(2, 'Yetkili kişi adı zorunludur.').max(120),
  contact_position: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email('Geçerli bir e-posta adresi giriniz.').max(160),
  phone: z.string().trim().min(6, 'Telefon numarası geçersiz.').max(40),
  country: z.string().trim().min(1, 'Ülke seçimi zorunludur.').max(60),
  country_other: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(1, 'Şehir zorunludur.').max(80),
  address: z.string().trim().max(400).optional().nullable(),

  references_text: z.string().trim().max(600).optional().nullable(),
  about: z.string().trim().max(4000).optional().nullable(),
  category_other: z.string().trim().max(200).optional().nullable(),

  categories: z.array(z.string().trim().max(40)).min(1, 'En az bir ürün grubu seçiniz.').max(20),
  certifications: z.array(z.string().trim().max(40)).max(20).default([]),

  kvkk_consent: z.literal(true, { errorMap: () => ({ message: 'KVKK aydınlatma onayı zorunludur.' }) }),
  /** Bot tuzağı: gerçek kullanıcılar bu alanı doldurmaz. */
  website_url: z.string().max(0).optional(),
});

/** multipart/form-data alanlarını JSON'a çevirir (diziler JSON string olarak gelir). */
function parseMultipartBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const key of ['categories', 'certifications']) {
    const raw = body[key];
    if (typeof raw === 'string') {
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
  }
  if (typeof body.kvkk_consent === 'string') out.kvkk_consent = ['true', '1', 'on'].includes(body.kvkk_consent);
  if (body.founded_year === '') out.founded_year = null;
  for (const [k, v] of Object.entries(out)) if (v === '') out[k] = null;
  return out;
}

const DOC_FIELDS = [
  { name: 'presentation', kind: 'PRESENTATION', maxCount: 1 },
  { name: 'catalog', kind: 'CATALOG', maxCount: 1 },
  { name: 'iso9001', kind: 'ISO9001', maxCount: 1 },
  { name: 'cert_other', kind: 'CERT_OTHER', maxCount: 5 },
  { name: 'financial', kind: 'FINANCIAL', maxCount: 1 },
];

publicApplications.post(
  '/',
  submitLimiter,
  upload.fields(DOC_FIELDS.map((f) => ({ name: f.name, maxCount: f.maxCount }))),
  ah(async (req, res) => {
    const body = parse(submitSchema, parseMultipartBody(req.body as Record<string, unknown>));

    // Bal küpü dolduysa başarı taklidi yap; bot geri bildirim almasın.
    if (body.website_url) {
      res.status(201).json({ ref_no: 'YTM-BP-0000-00000', message: 'Başvurunuz alındı.' });
      return;
    }

    // Geçerli taksonomi kodları
    const validCats = new Set(
      (db.prepare('SELECT code FROM categories WHERE is_active = 1').all() as Array<{ code: string }>).map((c) => c.code),
    );
    const validCerts = new Set(
      (db.prepare('SELECT code FROM certifications WHERE is_active = 1').all() as Array<{ code: string }>).map((c) => c.code),
    );
    const categories = [...new Set(body.categories.filter((c) => validCats.has(c)))];
    const certifications = [...new Set(body.certifications.filter((c) => validCerts.has(c)))];
    if (categories.length === 0) throw badRequest('Geçerli en az bir ürün grubu seçiniz.');
    if (categories.includes('diger') && !body.category_other) {
      throw badRequest('"Diğer" seçtiğiniz için ürün grubunu açıklamanız gerekir.');
    }

    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const fileList = DOC_FIELDS.flatMap((f) => (files[f.name] ?? []).map((file) => ({ file, kind: f.kind })));

    const companyKey = normalizeCompany(body.company_name);
    const taxKey = normalizeTaxId(body.tax_id);

    // Mükerrer tespiti — aynı firmanın tekrar başvurusu engellenmez ama işaretlenir.
    const duplicate = db
      .prepare(
        `SELECT id FROM applications
          WHERE (company_key = ? OR REPLACE(REPLACE(UPPER(tax_id),' ',''),'-','') = ? OR lower(email) = lower(?))
          ORDER BY id DESC LIMIT 1`,
      )
      .get(companyKey, taxKey, body.email) as { id: number } | undefined;

    // Son 24 saatte birebir aynı firma+e-posta ile başvuru varsa reddet.
    const recent = db
      .prepare(
        `SELECT ref_no FROM applications
          WHERE company_key = ? AND lower(email) = lower(?) AND created_at > datetime('now','-1 day')
          LIMIT 1`,
      )
      .get(companyKey, body.email) as { ref_no: string } | undefined;
    if (recent) {
      throw conflict(
        `Bu firma için son 24 saat içinde zaten bir başvuru alınmış (${recent.ref_no}). Başvurunuzun durumunu takip sayfasından görebilirsiniz.`,
        { ref_no: recent.ref_no },
      );
    }

    const ip = req.ip ?? null;
    const created = tx(() => {
      const refNo = nextRefNo();
      const result = db
        .prepare(
          `INSERT INTO applications (
             ref_no, company_name, company_key, tax_id, founded_year, employee_band, revenue_band, website,
             sector, sector_other, contact_name, contact_position, email, phone, country, country_other, city, address,
             references_text, about, category_other, kvkk_consent, consent_version, consent_ip, consent_at,
             status, source, completeness, duplicate_of, submit_ip, user_agent
           ) VALUES (
             @ref_no, @company_name, @company_key, @tax_id, @founded_year, @employee_band, @revenue_band, @website,
             @sector, @sector_other, @contact_name, @contact_position, @email, @phone, @country, @country_other, @city, @address,
             @references_text, @about, @category_other, 1, @consent_version, @consent_ip, datetime('now'),
             'NEW', 'WEB_FORM', 0, @duplicate_of, @submit_ip, @user_agent
           )`,
        )
        .run({
          ref_no: refNo,
          company_name: body.company_name,
          company_key: companyKey,
          tax_id: body.tax_id,
          founded_year: body.founded_year ?? null,
          employee_band: body.employee_band ?? null,
          revenue_band: body.revenue_band ?? null,
          website: body.website ?? null,
          sector: body.sector,
          sector_other: body.sector_other ?? null,
          contact_name: body.contact_name,
          contact_position: body.contact_position ?? null,
          email: body.email,
          phone: body.phone,
          country: body.country,
          country_other: body.country_other ?? null,
          city: body.city,
          address: body.address ?? null,
          references_text: body.references_text ?? null,
          about: body.about ?? null,
          category_other: body.category_other ?? null,
          consent_version: CONSENT_VERSION,
          consent_ip: ip,
          duplicate_of: duplicate?.id ?? null,
          submit_ip: ip,
          user_agent: (req.headers['user-agent'] ?? '').slice(0, 300),
        });

      const appId = result.lastInsertRowid as number;

      const insCat = db.prepare('INSERT INTO application_categories (application_id, category_code) VALUES (?, ?)');
      categories.forEach((c) => insCat.run(appId, c));
      const insCert = db.prepare('INSERT INTO application_certifications (application_id, cert_code) VALUES (?, ?)');
      certifications.forEach((c) => insCert.run(appId, c));

      fileList.forEach(({ file, kind }) =>
        persistDocument({ file, ownerType: 'APPLICATION', ownerId: appId, kind, visibility: 'INTERNAL' }),
      );

      const completeness = computeCompleteness(
        {
          company_name: body.company_name,
          tax_id: body.tax_id,
          founded_year: body.founded_year ?? null,
          employee_band: body.employee_band ?? null,
          revenue_band: body.revenue_band ?? null,
          website: body.website ?? null,
          sector: body.sector,
          contact_name: body.contact_name,
          contact_position: body.contact_position ?? null,
          email: body.email,
          phone: body.phone,
          country: body.country,
          city: body.city,
          address: body.address ?? null,
          references_text: body.references_text ?? null,
          about: body.about ?? null,
        },
        categories,
        certifications,
        fileList.length,
      );
      db.prepare('UPDATE applications SET completeness = ? WHERE id = ?').run(completeness, appId);

      logActivity({
        entityType: 'APPLICATION',
        entityId: appId,
        action: 'SUBMITTED',
        actor: { id: null, label: body.company_name },
        to: 'NEW',
        detail: `Web formu üzerinden başvuru alındı. ${fileList.length} belge yüklendi.`,
      });
      if (duplicate) {
        logActivity({
          entityType: 'APPLICATION',
          entityId: appId,
          action: 'DUPLICATE_FLAGGED',
          actor: { id: null, label: 'system' },
          detail: `Olası mükerrer kayıt: #${duplicate.id}`,
        });
      }

      createTask({
        type: 'REVIEW_APPLICATION',
        title: `Başvuru değerlendirmesi: ${body.company_name}`,
        description: 'Yeni tedarikçi başvurusu ön değerlendirme bekliyor.',
        entityType: 'APPLICATION',
        entityId: appId,
        assignedRole: 'MODERATOR',
        dueInDays: 10,
      });

      return { id: appId, ref_no: refNo, completeness };
    });

    await notifyApplicationReceived({
      id: created.id,
      ref_no: created.ref_no,
      company_name: body.company_name,
      email: body.email,
      contact_name: body.contact_name,
    });

    res.status(201).json({
      ref_no: created.ref_no,
      completeness: created.completeness,
      message: 'Başvurunuz alındı.',
    });
  }),
);

// ---------------------------------------------------------------------------
// FAZ 2 — Moderatör paneli
// ---------------------------------------------------------------------------

adminApplications.use(requireAuth);

function filterSummary(q: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    q: 'Arama',
    status: 'Durum',
    category: 'Ürün grubu',
    cert: 'Sertifika',
    country: 'Ülke',
    sector: 'Sektör',
    dateFrom: 'Başlangıç',
    dateTo: 'Bitiş',
    minCompleteness: 'Min. doluluk',
  };
  return Object.entries(labels)
    .filter(([k]) => {
      const v = q[k];
      return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
    })
    .map(([k, label]) => `${label}: ${Array.isArray(q[k]) ? (q[k] as string[]).join(', ') : String(q[k])}`)
    .join(' | ');
}

adminApplications.get(
  '/',
  ah((req, res) => {
    const q = parse(listQuerySchema, req.query);
    const { rows, total } = queryApplications(q);
    res.json({
      rows,
      total,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    });
  }),
);

/** Excel dışa aktarım — ekrandaki filtrenin birebir aynısı uygulanır. */
adminApplications.get(
  '/export',
  ah(async (req, res) => {
    const q = parse(listQuerySchema, req.query);
    const rows = queryApplicationsForExport(q);
    const buffer = await buildApplicationsWorkbook(rows, {
      filterSummary: filterSummary(req.query as Record<string, unknown>),
      exportedBy: `${req.user!.full_name} <${req.user!.email}>`,
    });

    logActivity({
      entityType: 'SYSTEM',
      entityId: 0,
      action: 'EXPORT_APPLICATIONS',
      actor: actorOf(req),
      detail: `${rows.length} kayıt Excel'e aktarıldı.`,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tedarikci-basvurulari-${stamp}.xlsx"`);
    res.send(buffer);
  }),
);

adminApplications.get(
  '/:id',
  ah((req, res) => {
    const id = Number(req.params.id);
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!app) throw notFound('Başvuru bulunamadı.');

    const categories = (
      db.prepare('SELECT category_code FROM application_categories WHERE application_id = ?').all(id) as Array<{
        category_code: string;
      }>
    ).map((r) => r.category_code);
    const certifications = (
      db.prepare('SELECT cert_code FROM application_certifications WHERE application_id = ?').all(id) as Array<{
        cert_code: string;
      }>
    ).map((r) => r.cert_code);

    const documents = db
      .prepare(
        `SELECT d.id, d.kind, d.original_name, d.mime_type, d.size_bytes, d.visibility, d.created_at,
                d.uploaded_by_supplier, u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.owner_type = 'APPLICATION' AND d.owner_id = ?
          ORDER BY d.id DESC`,
      )
      .all(id);

    const audits = db
      .prepare(
        `SELECT a.id, a.audit_no, a.type, a.status, a.planned_date, a.completed_at, a.score, a.grade,
                a.recommendation, u.full_name AS auditor_name
           FROM audits a LEFT JOIN users u ON u.id = a.auditor_id
          WHERE a.application_id = ? ORDER BY a.id DESC`,
      )
      .all(id);

    const notes = db
      .prepare(
        `SELECT n.id, n.body, n.visibility, n.created_at, COALESCE(u.full_name, n.author_label) AS author
           FROM notes n LEFT JOIN users u ON u.id = n.author_id
          WHERE n.entity_type = 'APPLICATION' AND n.entity_id = ?
          ORDER BY n.id DESC`,
      )
      .all(id);

    const supplier = db.prepare('SELECT id, supplier_code, status, grade FROM suppliers WHERE application_id = ?').get(id);

    const duplicates = db
      .prepare(
        `SELECT id, ref_no, company_name, status, created_at FROM applications
          WHERE id != ? AND (company_key = (SELECT company_key FROM applications WHERE id = ?)
                             OR lower(email) = (SELECT lower(email) FROM applications WHERE id = ?))
          ORDER BY id DESC LIMIT 10`,
      )
      .all(id, id, id);

    res.json({
      ...app,
      categories,
      certifications,
      documents,
      audits,
      notes,
      supplier: supplier ?? null,
      duplicates,
      activity: getActivity('APPLICATION', id),
      allowedTransitions: STATUS_TRANSITIONS[app.status as ApplicationStatus] ?? [],
    });
  }),
);

const patchSchema = z.object({
  assigned_to: z.number().int().positive().nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  decision_note: z.string().max(2000).nullable().optional(),
});

adminApplications.patch(
  '/:id',
  requireRole('MODERATOR', 'QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(patchSchema, req.body);
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as
      | { id: number; assigned_to: number | null; priority: string }
      | undefined;
    if (!app) throw notFound('Başvuru bulunamadı.');

    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      updates.push(`${key} = ?`);
      params.push(value);
    }
    if (updates.length === 0) throw badRequest('Güncellenecek alan gönderilmedi.');

    db.prepare(`UPDATE applications SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
      ...params,
      id,
    );

    if (body.assigned_to !== undefined) {
      const assignee = body.assigned_to
        ? (db.prepare('SELECT full_name FROM users WHERE id = ?').get(body.assigned_to) as { full_name: string } | undefined)
        : undefined;
      logActivity({
        entityType: 'APPLICATION',
        entityId: id,
        action: 'ASSIGNED',
        actor: actorOf(req),
        to: assignee?.full_name ?? 'atanmadı',
      });
      db.prepare(
        `UPDATE tasks SET assigned_to = ? WHERE entity_type = 'APPLICATION' AND entity_id = ? AND status IN ('OPEN','IN_PROGRESS')`,
      ).run(body.assigned_to ?? null, id);
    }
    if (body.priority) {
      logActivity({
        entityType: 'APPLICATION',
        entityId: id,
        action: 'PRIORITY_CHANGED',
        actor: actorOf(req),
        from: app.priority,
        to: body.priority,
      });
    }

    res.json(db.prepare('SELECT * FROM applications WHERE id = ?').get(id));
  }),
);

const statusSchema = z.object({
  status: z.enum([
    'NEW', 'IN_REVIEW', 'NEEDS_INFO', 'AUDIT_PENDING', 'AUDIT_PLANNED',
    'AUDIT_IN_PROGRESS', 'AUDIT_DONE', 'APPROVED', 'REJECTED', 'ON_HOLD', 'DISQUALIFIED',
  ]),
  note: z.string().max(2000).optional(),
  rejection_reason: z.string().max(500).optional(),
  notify: z.boolean().default(true),
});

/**
 * Faz 3'ün kalbi: durum geçişi.
 * AUDIT_PENDING'e geçiş, kalite birimine bir denetim kaydı ve görev üretir.
 * APPROVED'a geçiş, onaylı tedarikçi havuzuna kayıt açar.
 */
adminApplications.post(
  '/:id/status',
  requireRole('MODERATOR', 'QUALITY'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = parse(statusSchema, req.body);
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as
      | {
          id: number; ref_no: string; company_name: string; email: string; contact_name: string;
          tax_id: string; country: string; city: string; website: string | null; phone: string;
          status: ApplicationStatus;
        }
      | undefined;
    if (!app) throw notFound('Başvuru bulunamadı.');
    if (app.status === body.status) throw badRequest('Başvuru zaten bu durumda.');

    const allowed = STATUS_TRANSITIONS[app.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw badRequest(
        `"${app.status}" durumundan "${body.status}" durumuna geçilemez. İzin verilen geçişler: ${allowed.join(', ') || 'yok'}.`,
      );
    }

    // Yalnızca kalite birimi denetim sonucuna dayalı kararları verebilir.
    if (['APPROVED', 'DISQUALIFIED'].includes(body.status) && req.user!.role === 'MODERATOR') {
      const audit = db
        .prepare("SELECT id FROM audits WHERE application_id = ? AND status = 'COMPLETED' LIMIT 1")
        .get(id);
      if (!audit) throw forbidden('Onay/eleme kararı tamamlanmış bir kalite denetimi gerektirir.');
    }

    const result = tx(() => {
      db.prepare(
        `UPDATE applications
            SET status = ?, decision_note = COALESCE(?, decision_note), rejection_reason = COALESCE(?, rejection_reason),
                reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?`,
      ).run(body.status, body.note ?? null, body.rejection_reason ?? null, req.user!.id, id);

      logActivity({
        entityType: 'APPLICATION',
        entityId: id,
        action: 'STATUS_CHANGED',
        actor: actorOf(req),
        from: app.status,
        to: body.status,
        detail: body.note ?? body.rejection_reason ?? null,
      });

      let auditId: number | null = null;
      let supplierId: number | null = null;

      if (body.status === 'AUDIT_PENDING') {
        // Moderatör onayı -> kalite birimine iş sırası
        closeTasksFor('APPLICATION', id, req.user!.id, ['REVIEW_APPLICATION']);
        const existing = db
          .prepare("SELECT id FROM audits WHERE application_id = ? AND status IN ('PENDING','PLANNED','IN_PROGRESS')")
          .get(id) as { id: number } | undefined;

        if (existing) {
          auditId = existing.id;
        } else {
          const template = db
            .prepare("SELECT id FROM audit_templates WHERE is_active = 1 ORDER BY id LIMIT 1")
            .get() as { id: number } | undefined;
          const created = db
            .prepare(
              `INSERT INTO audits (audit_no, application_id, template_id, type, status)
               VALUES (?, ?, ?, 'INITIAL', 'PENDING')`,
            )
            .run(nextAuditNo(), id, template?.id ?? null);
          auditId = created.lastInsertRowid as number;
          logActivity({
            entityType: 'AUDIT',
            entityId: auditId,
            action: 'CREATED',
            actor: actorOf(req),
            detail: `${app.company_name} için denetim açıldı.`,
          });
        }

        createTask({
          type: 'PERFORM_AUDIT',
          title: `Tedarikçi denetimi: ${app.company_name}`,
          description: 'Satınalma onayı verildi, kalite denetimi bekleniyor.',
          entityType: 'AUDIT',
          entityId: auditId,
          assignedRole: 'QUALITY',
          dueInDays: 30,
          createdBy: req.user!.id,
        });
      }

      if (body.status === 'APPROVED') {
        const existing = db.prepare('SELECT id FROM suppliers WHERE application_id = ?').get(id) as
          | { id: number }
          | undefined;
        if (existing) {
          supplierId = existing.id;
          db.prepare("UPDATE suppliers SET status = 'APPROVED', updated_at = datetime('now') WHERE id = ?").run(existing.id);
        } else {
          const lastAudit = db
            .prepare("SELECT grade FROM audits WHERE application_id = ? AND grade IS NOT NULL ORDER BY id DESC LIMIT 1")
            .get(id) as { grade: string } | undefined;
          const created = db
            .prepare(
              `INSERT INTO suppliers (supplier_code, application_id, company_name, tax_id, country, city, website,
                                      contact_name, email, phone, grade, status, approved_at, next_audit_due)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), date('now','+1 year'))`,
            )
            .run(
              nextSupplierCode(), id, app.company_name, app.tax_id, app.country, app.city, app.website,
              app.contact_name, app.email, app.phone, lastAudit?.grade ?? null,
              lastAudit?.grade === 'C' ? 'CONDITIONAL' : 'APPROVED',
            );
          supplierId = created.lastInsertRowid as number;

          // Ürün gruplarını tedarikçiye taşı
          const cats = db
            .prepare('SELECT category_code FROM application_categories WHERE application_id = ?')
            .all(id) as Array<{ category_code: string }>;
          const ins = db.prepare('INSERT INTO supplier_categories (supplier_id, category_code) VALUES (?, ?)');
          cats.forEach((c) => ins.run(supplierId, c.category_code));

          db.prepare('UPDATE audits SET supplier_id = ? WHERE application_id = ?').run(supplierId, id);
          logActivity({
            entityType: 'SUPPLIER',
            entityId: supplierId,
            action: 'CREATED',
            actor: actorOf(req),
            detail: `${app.company_name} onaylı tedarikçi havuzuna eklendi.`,
          });
        }
        closeTasksFor('APPLICATION', id, req.user!.id);
      }

      if (['REJECTED', 'DISQUALIFIED'].includes(body.status)) {
        closeTasksFor('APPLICATION', id, req.user!.id);
      }

      return { auditId, supplierId };
    });

    // Onaylanan tedarikçiye portal daveti: parolasını kendisi belirler.
    if (result.supplierId && body.status === 'APPROVED') {
      const token = randomToken();
      db.prepare(
        `INSERT INTO portal_tokens (token_hash, purpose, entity_type, entity_id, email, expires_at)
         VALUES (?, 'SET_PASSWORD', 'SUPPLIER', ?, ?, datetime('now','+14 days'))`,
      ).run(sha256(token), result.supplierId, app.email);
      await notifyPortalInvite(
        { id: result.supplierId, company_name: app.company_name, email: app.email },
        token,
      );
    }

    if (body.notify) {
      await notifyStatusChange(app, body.status, body.note ?? body.rejection_reason ?? null);
      if (result.auditId) {
        const auditNo = db.prepare('SELECT audit_no FROM audits WHERE id = ?').get(result.auditId) as { audit_no: string };
        await notifyAuditAssigned({
          id: result.auditId,
          audit_no: auditNo.audit_no,
          company_name: app.company_name,
        });
      }
    }

    res.json({
      ...(db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Record<string, unknown>),
      audit_id: result.auditId,
      supplier_id: result.supplierId,
    });
  }),
);

/** Toplu durum değişikliği — havuzu hızlı temizlemek için. */
const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(['IN_REVIEW', 'AUDIT_PENDING', 'REJECTED', 'ON_HOLD']),
  note: z.string().max(1000).optional(),
  notify: z.boolean().default(false),
});

adminApplications.post(
  '/bulk-status',
  requireRole('MODERATOR'),
  ah(async (req, res) => {
    const body = parse(bulkSchema, req.body);
    const results: Array<{ id: number; ok: boolean; error?: string }> = [];

    for (const id of body.ids) {
      const app = db.prepare('SELECT status FROM applications WHERE id = ?').get(id) as
        | { status: ApplicationStatus }
        | undefined;
      if (!app) {
        results.push({ id, ok: false, error: 'Bulunamadı' });
        continue;
      }
      if (!(STATUS_TRANSITIONS[app.status] ?? []).includes(body.status)) {
        results.push({ id, ok: false, error: `${app.status} → ${body.status} geçişi geçersiz` });
        continue;
      }
      db.prepare(
        `UPDATE applications SET status = ?, decision_note = COALESCE(?, decision_note),
                reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).run(body.status, body.note ?? null, req.user!.id, id);
      logActivity({
        entityType: 'APPLICATION',
        entityId: id,
        action: 'STATUS_CHANGED',
        actor: actorOf(req),
        from: app.status,
        to: body.status,
        detail: 'Toplu işlem',
      });
      results.push({ id, ok: true });
    }

    res.json({ results, updated: results.filter((r) => r.ok).length });
  }),
);

/** Tedarikçiden ek bilgi/belge talebi — tek kullanımlık güvenli bağlantı üretir. */
const infoRequestSchema = z.object({ message: z.string().trim().min(5).max(2000) });

adminApplications.post(
  '/:id/request-info',
  requireRole('MODERATOR', 'QUALITY'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = parse(infoRequestSchema, req.body);
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as
      | { id: number; ref_no: string; company_name: string; email: string; contact_name: string; status: ApplicationStatus }
      | undefined;
    if (!app) throw notFound('Başvuru bulunamadı.');

    const token = randomToken();
    db.prepare(
      `INSERT INTO portal_tokens (token_hash, purpose, entity_type, entity_id, email, expires_at)
       VALUES (?, 'INFO_REQUEST', 'APPLICATION', ?, ?, datetime('now','+30 days'))`,
    ).run(sha256(token), id, app.email);

    if (app.status !== 'NEEDS_INFO' && (STATUS_TRANSITIONS[app.status] ?? []).includes('NEEDS_INFO')) {
      db.prepare("UPDATE applications SET status = 'NEEDS_INFO', updated_at = datetime('now') WHERE id = ?").run(id);
    }

    db.prepare(
      `INSERT INTO notes (entity_type, entity_id, author_id, body, visibility)
       VALUES ('APPLICATION', ?, ?, ?, 'SHARED')`,
    ).run(id, req.user!.id, `Ek bilgi talebi gönderildi:\n${body.message}`);

    logActivity({
      entityType: 'APPLICATION',
      entityId: id,
      action: 'INFO_REQUESTED',
      actor: actorOf(req),
      detail: body.message.slice(0, 500),
    });

    createTask({
      type: 'SUPPLIER_INFO_REQUEST',
      title: `Bilgi talebi takibi: ${app.company_name}`,
      description: body.message.slice(0, 400),
      entityType: 'APPLICATION',
      entityId: id,
      assignedRole: 'MODERATOR',
      assignedTo: req.user!.id,
      dueInDays: 14,
      createdBy: req.user!.id,
    });

    await notifyInfoRequest(app, body.message, token);
    res.json({ ok: true, message: 'Bilgi talebi tedarikçiye iletildi.' });
  }),
);

/** Dahili not ekleme. */
adminApplications.post(
  '/:id/notes',
  requireRole('MODERATOR', 'QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    const exists = db.prepare('SELECT id FROM applications WHERE id = ?').get(id);
    if (!exists) throw notFound('Başvuru bulunamadı.');

    const res1 = db
      .prepare(`INSERT INTO notes (entity_type, entity_id, author_id, body) VALUES ('APPLICATION', ?, ?, ?)`)
      .run(id, req.user!.id, body.body);
    logActivity({ entityType: 'APPLICATION', entityId: id, action: 'NOTE_ADDED', actor: actorOf(req) });
    res.status(201).json({ id: res1.lastInsertRowid });
  }),
);

/**
 * KVKK "unutulma hakkı" — başvuruyu ve tüm eklerini kalıcı olarak siler.
 * Sadece ADMIN yapabilir ve işlem denetim izine kaydedilir.
 */
adminApplications.delete(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const app = db.prepare('SELECT ref_no, company_name FROM applications WHERE id = ?').get(id) as
      | { ref_no: string; company_name: string }
      | undefined;
    if (!app) throw notFound('Başvuru bulunamadı.');

    const fs = await import('node:fs');
    const path = await import('node:path');
    const { config } = await import('../config.js');
    const dir = path.join(config.storageDir, 'application', String(id));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

    db.prepare("DELETE FROM documents WHERE owner_type = 'APPLICATION' AND owner_id = ?").run(id);
    db.prepare('DELETE FROM applications WHERE id = ?').run(id);

    logActivity({
      entityType: 'SYSTEM',
      entityId: 0,
      action: 'APPLICATION_ERASED',
      actor: actorOf(req),
      detail: `KVKK silme talebi: ${app.ref_no} — ${app.company_name}`,
    });

    res.json({ ok: true });
  }),
);
