import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db, tx } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import { APPLICATION_SOURCES } from '../lib/constants.js';
import { ah, badRequest, parse } from '../lib/http.js';
import { nextRefNo } from '../lib/ids.js';
import { computeCompleteness } from '../lib/scoring.js';
import { normalizeCompany, normalizeTaxId } from '../lib/text.js';
import { actorOf, requireAuth, requireRole } from '../middleware/auth.js';

/**
 * EYDEP / TurkishExporter / fuar listeleri gibi dış kaynaklardan gelen
 * tedarikçi adaylarını aynı havuza aktarır. Böylece "farklı kanallardan gelen
 * başvuruları tek merkezde toplama" hedefi web formuyla sınırlı kalmaz.
 */
export const importRoutes = Router();
importRoutes.use(requireAuth);

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

/** Ayraç ve tırnak farkındalıklı basit CSV ayrıştırıcı. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = clean.split('\n')[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);

  const headers = (rows.shift() ?? []).map((h) => h.toLowerCase().trim());
  return { headers, rows };
}

/** Türkçe/İngilizce başlık eşleştirmesi. */
const COLUMN_ALIASES: Record<string, string[]> = {
  company_name: ['firma', 'firma adı', 'firma adi', 'unvan', 'company', 'company name', 'şirket', 'sirket'],
  tax_id: ['vergi no', 'vergi', 'vergi numarası', 'tax id', 'tax', 'duns', 'vkn'],
  email: ['e-posta', 'eposta', 'email', 'e-mail', 'mail'],
  phone: ['telefon', 'phone', 'tel', 'gsm'],
  contact_name: ['yetkili', 'yetkili kişi', 'contact', 'contact name', 'ilgili kişi', 'ad soyad'],
  city: ['şehir', 'sehir', 'il', 'city'],
  country: ['ülke', 'ulke', 'country'],
  website: ['web', 'web sitesi', 'website', 'site', 'url'],
  sector: ['sektör', 'sektor', 'sector', 'industry'],
  categories: ['ürün grubu', 'urun grubu', 'ürün grupları', 'kategori', 'category', 'categories', 'product group'],
  about: ['açıklama', 'aciklama', 'not', 'notes', 'description', 'about'],
};

function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  Object.entries(COLUMN_ALIASES).forEach(([field, aliases]) => {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[field] = idx;
  });
  return map;
}

const optionsSchema = z.object({
  source: z.enum(APPLICATION_SOURCES).default('IMPORT'),
  /** true ise sadece önizleme döner, kayıt oluşturmaz. */
  dry_run: z.coerce.boolean().default(false),
});

importRoutes.post(
  '/applications',
  requireRole('MODERATOR'),
  csvUpload.single('file'),
  ah((req, res) => {
    const options = parse(optionsSchema, req.body);
    const file = req.file;
    if (!file) throw badRequest('CSV dosyası yükleyiniz.');

    const { headers, rows } = parseCsv(file.buffer.toString('utf8'));
    const map = mapHeaders(headers);
    if (map.company_name === undefined) {
      throw badRequest(
        `CSV'de firma adı sütunu bulunamadı. Beklenen başlıklardan biri: ${COLUMN_ALIASES.company_name.join(', ')}`,
      );
    }

    const validCats = new Set(
      (db.prepare('SELECT code FROM categories WHERE is_active = 1').all() as Array<{ code: string }>).map((c) => c.code),
    );
    const catByName = new Map<string, string>();
    (db.prepare('SELECT code, name_tr, name_en FROM categories').all() as Array<{
      code: string;
      name_tr: string;
      name_en: string;
    }>).forEach((c) => {
      catByName.set(normalizeCompany(c.name_tr), c.code);
      catByName.set(normalizeCompany(c.name_en), c.code);
      catByName.set(c.code, c.code);
    });

    const get = (row: string[], field: string) => (map[field] === undefined ? '' : (row[map[field]] ?? '').trim());

    const results = { imported: 0, skipped: 0, duplicates: 0, errors: [] as Array<{ line: number; error: string }> };
    const preview: Array<Record<string, unknown>> = [];

    const run = () => {
      rows.forEach((row, index) => {
        const line = index + 2;
        const companyName = get(row, 'company_name');
        if (!companyName) {
          results.skipped += 1;
          return;
        }

        const email = get(row, 'email');
        const taxId = get(row, 'tax_id') || 'BILINMIYOR';
        const companyKey = normalizeCompany(companyName);

        const existing = db
          .prepare(
            `SELECT id, ref_no FROM applications
              WHERE company_key = ?
                 OR (? != '' AND lower(email) = lower(?))
                 OR (? != 'BILINMIYOR' AND REPLACE(REPLACE(UPPER(tax_id),' ',''),'-','') = ?)
              LIMIT 1`,
          )
          .get(companyKey, email, email, taxId, normalizeTaxId(taxId)) as { id: number; ref_no: string } | undefined;

        if (existing) {
          results.duplicates += 1;
          if (options.dry_run) {
            preview.push({ line, company_name: companyName, action: 'duplicate', existing_ref: existing.ref_no });
          }
          return;
        }

        const rawCats = get(row, 'categories');
        const categories = [
          ...new Set(
            rawCats
              .split(/[;,|]/)
              .map((c) => catByName.get(normalizeCompany(c.trim())) ?? '')
              .filter((c) => c && validCats.has(c)),
          ),
        ];

        if (options.dry_run) {
          preview.push({
            line,
            company_name: companyName,
            email: email || null,
            city: get(row, 'city') || null,
            categories,
            action: 'import',
          });
          results.imported += 1;
          return;
        }

        try {
          const refNo = nextRefNo();
          const created = db
            .prepare(
              `INSERT INTO applications (
                 ref_no, company_name, company_key, tax_id, website, sector, contact_name, email, phone,
                 country, city, about, kvkk_consent, status, source, completeness
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'NEW', ?, 0)`,
            )
            .run(
              refNo, companyName, companyKey, taxId, get(row, 'website') || null,
              get(row, 'sector') || 'diger', get(row, 'contact_name') || 'Bilinmiyor',
              email || `bilinmiyor+${companyKey.replace(/\s/g, '')}@example.invalid`,
              get(row, 'phone') || '-', (get(row, 'country') || 'tr').toLowerCase().slice(0, 20),
              get(row, 'city') || '-', get(row, 'about') || null, options.source,
            );
          const appId = created.lastInsertRowid as number;

          const ins = db.prepare('INSERT OR IGNORE INTO application_categories (application_id, category_code) VALUES (?, ?)');
          categories.forEach((c) => ins.run(appId, c));

          const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId) as never;
          db.prepare('UPDATE applications SET completeness = ? WHERE id = ?').run(
            computeCompleteness(app, categories, [], 0),
            appId,
          );

          logActivity({
            entityType: 'APPLICATION',
            entityId: appId,
            action: 'IMPORTED',
            actor: actorOf(req),
            to: 'NEW',
            detail: `${options.source} listesinden içe aktarıldı (satır ${line}).`,
          });
          results.imported += 1;
        } catch (err) {
          results.errors.push({ line, error: err instanceof Error ? err.message : String(err) });
        }
      });
    };

    if (options.dry_run) run();
    else tx(run);

    if (!options.dry_run) {
      logActivity({
        entityType: 'SYSTEM',
        entityId: 0,
        action: 'IMPORT_APPLICATIONS',
        actor: actorOf(req),
        detail: `${results.imported} kayıt içe aktarıldı, ${results.duplicates} mükerrer atlandı.`,
      });
    }

    res.json({
      ...results,
      total: rows.length,
      detectedColumns: Object.keys(map),
      preview: options.dry_run ? preview.slice(0, 50) : undefined,
      dryRun: options.dry_run,
    });
  }),
);

/** Örnek CSV şablonu indirir. */
importRoutes.get(
  '/template',
  ah((_req, res) => {
    const header = 'Firma Adı;Vergi No;Yetkili Kişi;E-posta;Telefon;Ülke;Şehir;Web Sitesi;Sektör;Ürün Grubu;Açıklama';
    const example =
      'Örnek Makine San. Ltd. Şti.;1234567890;Ahmet Yılmaz;info@ornekmakine.com;+90 232 000 0000;tr;İzmir;https://ornekmakine.com;makine;hidrolik|disli;CNC işleme ve montaj';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tedarikci-import-sablonu.csv"');
    res.send(`﻿${header}\n${example}\n`);
  }),
);
