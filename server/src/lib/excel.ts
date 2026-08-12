import ExcelJS from 'exceljs';
import { db } from '../db/index.js';
import type { ApplicationRow } from '../modules/applications.queries.js';

const BRAND = 'FFE60012';

type Dict = Record<string, string>;

function lookup(table: 'categories' | 'certifications' | 'sectors', locale: 'tr' | 'en'): Dict {
  const nameCol = table === 'certifications' ? 'name' : locale === 'tr' ? 'name_tr' : 'name_en';
  const rows = db.prepare(`SELECT code, ${nameCol} AS name FROM ${table}`).all() as Array<{
    code: string;
    name: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}

const STATUS_TR: Dict = {
  NEW: 'Yeni',
  IN_REVIEW: 'İncelemede',
  NEEDS_INFO: 'Bilgi bekleniyor',
  AUDIT_PENDING: 'Denetim bekliyor',
  AUDIT_PLANNED: 'Denetim planlandı',
  AUDIT_IN_PROGRESS: 'Denetim sürüyor',
  AUDIT_DONE: 'Denetim tamamlandı',
  APPROVED: 'Onaylı tedarikçi',
  REJECTED: 'Reddedildi',
  ON_HOLD: 'Beklemede',
  DISQUALIFIED: 'Elendi',
};

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Moderatör panelindeki filtrelenmiş listeyi Excel'e aktarır (Faz 2).
 * Kodlar yerine okunabilir Türkçe etiketler yazılır; ikinci sayfada
 * ürün grubu bazlı özet bulunur.
 */
export async function buildApplicationsWorkbook(
  rows: ApplicationRow[],
  meta: { filterSummary: string; exportedBy: string; locale?: 'tr' | 'en' },
): Promise<Buffer> {
  const locale = meta.locale ?? 'tr';
  const cats = lookup('categories', locale);
  const certs = lookup('certifications', locale);
  const sectors = lookup('sectors', locale);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Yanmar Türkiye Business Partner Portal';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Başvurular', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = [
    { header: 'Referans No', key: 'ref_no', width: 18 },
    { header: 'Firma Adı', key: 'company_name', width: 38 },
    { header: 'Vergi / DUNS No', key: 'tax_id', width: 16 },
    { header: 'Durum', key: 'status', width: 20 },
    { header: 'Kalite Notu', key: 'grade', width: 11 },
    { header: 'Ürün Grupları', key: 'categories', width: 42 },
    { header: 'Kalite Sertifikaları', key: 'certifications', width: 30 },
    { header: 'Sektör', key: 'sector', width: 24 },
    { header: 'Ülke', key: 'country', width: 10 },
    { header: 'Şehir', key: 'city', width: 16 },
    { header: 'Yetkili Kişi', key: 'contact_name', width: 22 },
    { header: 'E-posta', key: 'email', width: 30 },
    { header: 'Telefon', key: 'phone', width: 18 },
    { header: 'Web Sitesi', key: 'website', width: 28 },
    { header: 'Çalışan Sayısı', key: 'employee_band', width: 14 },
    { header: 'Yıllık Ciro (€)', key: 'revenue_band', width: 14 },
    { header: 'Kuruluş Yılı', key: 'founded_year', width: 12 },
    { header: 'Doluluk %', key: 'completeness', width: 11 },
    { header: 'Belge Sayısı', key: 'document_count', width: 12 },
    { header: 'Sorumlu', key: 'assignee_name', width: 22 },
    { header: 'Mükerrer', key: 'duplicate', width: 10 },
    { header: 'Başvuru Tarihi', key: 'created_at', width: 20 },
  ];

  const names = (codes: string, dict: Dict) =>
    codes
      .split(',')
      .filter(Boolean)
      .map((c) => dict[c] ?? c)
      .join(', ');

  rows.forEach((r) => {
    sheet.addRow({
      ref_no: r.ref_no,
      company_name: r.company_name,
      tax_id: r.tax_id,
      status: STATUS_TR[r.status] ?? r.status,
      grade: r.grade ?? '',
      categories: names(r.categories, cats),
      certifications: names(r.certifications, certs),
      sector: sectors[r.sector] ?? r.sector,
      country: r.country.toUpperCase(),
      city: r.city,
      contact_name: r.contact_name,
      email: r.email,
      phone: r.phone,
      website: r.website ?? '',
      employee_band: r.employee_band ?? '',
      revenue_band: r.revenue_band ?? '',
      founded_year: r.founded_year ?? '',
      completeness: r.completeness,
      document_count: r.document_count,
      assignee_name: r.assignee_name ?? '',
      duplicate: r.duplicate_of ? 'Evet' : '',
      created_at: r.created_at,
    });
  });

  styleHeader(sheet);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  // Doluluk yüzdesi için renk skalası
  const completenessCol = sheet.getColumn('completeness').letter;
  if (rows.length > 0) {
    sheet.addConditionalFormatting({
      ref: `${completenessCol}2:${completenessCol}${rows.length + 1}`,
      rules: [
        {
          type: 'colorScale',
          priority: 1,
          cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }],
          color: [{ argb: 'FFF8CBCB' }, { argb: 'FFC6EFCE' }],
        } as ExcelJS.ConditionalFormattingRule,
      ],
    });
  }

  // --- Özet sayfası: ürün grubu bazlı dağılım ---
  const summary = wb.addWorksheet('Özet');
  summary.columns = [
    { header: 'Ürün Grubu', key: 'name', width: 42 },
    { header: 'Başvuru Sayısı', key: 'count', width: 16 },
    { header: 'Onaylı', key: 'approved', width: 12 },
    { header: 'Denetim Sürecinde', key: 'inAudit', width: 20 },
  ];

  const perCategory = new Map<string, { count: number; approved: number; inAudit: number }>();
  rows.forEach((r) => {
    r.categories
      .split(',')
      .filter(Boolean)
      .forEach((code) => {
        const entry = perCategory.get(code) ?? { count: 0, approved: 0, inAudit: 0 };
        entry.count += 1;
        if (r.status === 'APPROVED') entry.approved += 1;
        if (['AUDIT_PENDING', 'AUDIT_PLANNED', 'AUDIT_IN_PROGRESS', 'AUDIT_DONE'].includes(r.status)) entry.inAudit += 1;
        perCategory.set(code, entry);
      });
  });

  [...perCategory.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([code, v]) =>
      summary.addRow({ name: cats[code] ?? code, count: v.count, approved: v.approved, inAudit: v.inAudit }),
    );
  styleHeader(summary);

  // --- Bilgi sayfası: hangi filtrelerle alındı (izlenebilirlik) ---
  const info = wb.addWorksheet('Rapor Bilgisi');
  info.columns = [
    { header: 'Alan', key: 'k', width: 26 },
    { header: 'Değer', key: 'v', width: 90 },
  ];
  info.addRow({ k: 'Rapor', v: 'Tedarikçi Başvuruları' });
  info.addRow({ k: 'Oluşturan', v: meta.exportedBy });
  info.addRow({ k: 'Oluşturma zamanı', v: new Date().toLocaleString('tr-TR') });
  info.addRow({ k: 'Kayıt sayısı', v: String(rows.length) });
  info.addRow({ k: 'Uygulanan filtreler', v: meta.filterSummary || 'Filtre uygulanmadı (tüm kayıtlar)' });
  styleHeader(info);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Genel amaçlı tek sayfalık dışa aktarım (tedarikçi, sözleşme, NCR listeleri). */
export async function buildSimpleWorkbook(
  sheetName: string,
  columns: Array<{ header: string; key: string; width?: number }>,
  rows: Array<Record<string, unknown>>,
  meta?: { exportedBy: string },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Yanmar Türkiye Business Partner Portal';
  wb.created = new Date();

  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ ...c, width: c.width ?? 22 }));
  rows.forEach((r) => sheet.addRow(r));
  styleHeader(sheet);
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  if (meta) {
    const info = wb.addWorksheet('Rapor Bilgisi');
    info.columns = [
      { header: 'Alan', key: 'k', width: 26 },
      { header: 'Değer', key: 'v', width: 80 },
    ];
    info.addRow({ k: 'Rapor', v: sheetName });
    info.addRow({ k: 'Oluşturan', v: meta.exportedBy });
    info.addRow({ k: 'Oluşturma zamanı', v: new Date().toLocaleString('tr-TR') });
    info.addRow({ k: 'Kayıt sayısı', v: String(rows.length) });
    styleHeader(info);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
