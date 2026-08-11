import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import { DOCUMENT_KINDS } from '../lib/constants.js';
import { ah, badRequest, notFound, parse } from '../lib/http.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';
import { documentPath, persistDocument, upload } from '../middleware/upload.js';

export const documentRoutes = Router();
documentRoutes.use(requireAuth);

const OWNER_TABLE: Record<string, string> = {
  APPLICATION: 'applications',
  SUPPLIER: 'suppliers',
  AUDIT: 'audits',
  CONTRACT: 'contracts',
  NCR: 'ncrs',
};

const uploadSchema = z.object({
  owner_type: z.enum(['APPLICATION', 'SUPPLIER', 'AUDIT', 'CONTRACT', 'NCR']),
  owner_id: z.coerce.number().int().positive(),
  kind: z.enum(DOCUMENT_KINDS).default('OTHER'),
  visibility: z.enum(['INTERNAL', 'SHARED']).default('INTERNAL'),
  note: z.string().max(500).optional(),
});

/** Yanmar tarafından belge yükleme (Faz 4 karşılıklı dosya paylaşımının iç ucu). */
documentRoutes.post(
  '/',
  requireRole('MODERATOR', 'QUALITY'),
  upload.array('files', 10),
  ah((req, res) => {
    const body = parse(uploadSchema, req.body);
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw badRequest('En az bir dosya seçiniz.');

    const owner = db
      .prepare(`SELECT id FROM ${OWNER_TABLE[body.owner_type]} WHERE id = ?`)
      .get(body.owner_id);
    if (!owner) throw notFound('İlgili kayıt bulunamadı.');

    const stored = files.map((file) =>
      persistDocument({
        file,
        ownerType: body.owner_type,
        ownerId: body.owner_id,
        kind: body.kind,
        visibility: body.visibility,
        uploadedBy: req.user!.id,
        note: body.note ?? null,
      }),
    );

    logActivity({
      entityType: body.owner_type,
      entityId: body.owner_id,
      action: 'DOCUMENT_UPLOADED',
      actor: actorOf(req),
      detail: stored.map((s) => s.originalName).join(', '),
    });

    res.status(201).json({ documents: stored });
  }),
);

/** Güvenli indirme — dosyalar hiçbir zaman statik olarak servis edilmez. */
documentRoutes.get(
  '/:id/download',
  ah((req, res) => {
    const id = Number(req.params.id);
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | {
          id: number; owner_type: string; owner_id: number; original_name: string;
          stored_name: string; mime_type: string;
        }
      | undefined;
    if (!doc) throw notFound('Belge bulunamadı.');

    const filePath = documentPath(doc.owner_type, doc.owner_id, doc.stored_name);
    if (!fs.existsSync(filePath)) throw notFound('Belge dosyası sunucuda bulunamadı.');

    logActivity({
      entityType: doc.owner_type as 'APPLICATION',
      entityId: doc.owner_id,
      action: 'DOCUMENT_DOWNLOADED',
      actor: actorOf(req),
      detail: doc.original_name,
    });

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  }),
);

/** Görünürlük değişimi — belgeyi tedarikçiyle paylaş / paylaşımdan kaldır. */
documentRoutes.patch(
  '/:id',
  requireRole('MODERATOR', 'QUALITY'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const body = parse(z.object({ visibility: z.enum(['INTERNAL', 'SHARED']) }), req.body);
    const doc = db.prepare('SELECT owner_type, owner_id, original_name FROM documents WHERE id = ?').get(id) as
      | { owner_type: string; owner_id: number; original_name: string }
      | undefined;
    if (!doc) throw notFound('Belge bulunamadı.');

    db.prepare('UPDATE documents SET visibility = ? WHERE id = ?').run(body.visibility, id);
    logActivity({
      entityType: doc.owner_type as 'APPLICATION',
      entityId: doc.owner_id,
      action: 'DOCUMENT_VISIBILITY_CHANGED',
      actor: actorOf(req),
      to: body.visibility,
      detail: doc.original_name,
    });
    res.json({ ok: true });
  }),
);

documentRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  ah((req, res) => {
    const id = Number(req.params.id);
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | { id: number; owner_type: string; owner_id: number; stored_name: string; original_name: string }
      | undefined;
    if (!doc) throw notFound('Belge bulunamadı.');

    const filePath = documentPath(doc.owner_type, doc.owner_id, doc.stored_name);
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);

    logActivity({
      entityType: doc.owner_type as 'APPLICATION',
      entityId: doc.owner_id,
      action: 'DOCUMENT_DELETED',
      actor: actorOf(req),
      detail: doc.original_name,
    });
    res.json({ ok: true });
  }),
);
