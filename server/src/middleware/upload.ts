import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { badRequest } from '../lib/http.js';
import { safeFileName } from '../lib/text.js';

/**
 * Dosyalar bellekte tutulur, doğrulandıktan sonra diske yazılır.
 * Orijinal ad asla dosya sistemine yansıtılmaz; içerik hash'i ile birlikte
 * rastgele bir ad kullanılır (dizin geçişi ve üzerine yazma riski kalmaz).
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!config.allowedMime.has(file.mimetype)) {
      cb(badRequest(`Desteklenmeyen dosya türü: ${file.mimetype}. PDF, Office belgeleri ve görseller kabul edilir.`));
      return;
    }
    cb(null, true);
  },
});

export type StoredFile = {
  id: number;
  originalName: string;
  storedName: string;
  size: number;
  sha256: string;
};

/** Dosyayı diske yazar ve documents tablosuna kaydeder. */
export function persistDocument(params: {
  file: Express.Multer.File;
  ownerType: 'APPLICATION' | 'SUPPLIER' | 'AUDIT' | 'CONTRACT' | 'NCR';
  ownerId: number;
  kind: string;
  visibility?: 'INTERNAL' | 'SHARED';
  uploadedBy?: number | null;
  uploadedBySupplier?: boolean;
  note?: string | null;
}): StoredFile {
  const sha = crypto.createHash('sha256').update(params.file.buffer).digest('hex');
  const ext = path.extname(safeFileName(params.file.originalname)).slice(0, 12);
  const storedName = `${crypto.randomUUID()}${ext}`;

  const dir = path.join(config.storageDir, params.ownerType.toLowerCase(), String(params.ownerId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, storedName), params.file.buffer);

  const res = db
    .prepare(
      `INSERT INTO documents (owner_type, owner_id, kind, original_name, stored_name, mime_type, size_bytes,
                              sha256, visibility, uploaded_by, uploaded_by_supplier, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.ownerType,
      params.ownerId,
      params.kind,
      safeFileName(params.file.originalname),
      storedName,
      params.file.mimetype,
      params.file.size,
      sha,
      params.visibility ?? 'INTERNAL',
      params.uploadedBy ?? null,
      params.uploadedBySupplier ? 1 : 0,
      params.note ?? null,
    );

  return {
    id: res.lastInsertRowid as number,
    originalName: safeFileName(params.file.originalname),
    storedName,
    size: params.file.size,
    sha256: sha,
  };
}

export function documentPath(ownerType: string, ownerId: number, storedName: string): string {
  return path.join(config.storageDir, ownerType.toLowerCase(), String(ownerId), storedName);
}
