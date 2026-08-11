/** Sunucu enum'larının kullanıcıya gösterilen karşılıkları ve renk sınıfları. */

export type BadgeTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger';

type LabelDef = { tr: string; en: string; tone: BadgeTone };

export const APPLICATION_STATUS: Record<string, LabelDef> = {
  NEW: { tr: 'Yeni', en: 'New', tone: 'info' },
  IN_REVIEW: { tr: 'İncelemede', en: 'In review', tone: 'info' },
  NEEDS_INFO: { tr: 'Bilgi bekleniyor', en: 'Awaiting info', tone: 'warn' },
  AUDIT_PENDING: { tr: 'Denetim bekliyor', en: 'Audit pending', tone: 'warn' },
  AUDIT_PLANNED: { tr: 'Denetim planlandı', en: 'Audit planned', tone: 'warn' },
  AUDIT_IN_PROGRESS: { tr: 'Denetim sürüyor', en: 'Audit in progress', tone: 'warn' },
  AUDIT_DONE: { tr: 'Denetim tamamlandı', en: 'Audit completed', tone: 'info' },
  APPROVED: { tr: 'Onaylı tedarikçi', en: 'Approved supplier', tone: 'ok' },
  REJECTED: { tr: 'Reddedildi', en: 'Rejected', tone: 'danger' },
  ON_HOLD: { tr: 'Beklemede', en: 'On hold', tone: 'neutral' },
  DISQUALIFIED: { tr: 'Elendi', en: 'Disqualified', tone: 'danger' },
};

export const AUDIT_STATUS: Record<string, LabelDef> = {
  PENDING: { tr: 'Bekliyor', en: 'Pending', tone: 'warn' },
  PLANNED: { tr: 'Planlandı', en: 'Planned', tone: 'info' },
  IN_PROGRESS: { tr: 'Sürüyor', en: 'In progress', tone: 'info' },
  COMPLETED: { tr: 'Tamamlandı', en: 'Completed', tone: 'ok' },
  CANCELLED: { tr: 'İptal', en: 'Cancelled', tone: 'neutral' },
};

export const SUPPLIER_STATUS: Record<string, LabelDef> = {
  APPROVED: { tr: 'Onaylı', en: 'Approved', tone: 'ok' },
  CONDITIONAL: { tr: 'Şartlı onay', en: 'Conditional', tone: 'warn' },
  SUSPENDED: { tr: 'Askıda', en: 'Suspended', tone: 'danger' },
  BLACKLISTED: { tr: 'Kara liste', en: 'Blacklisted', tone: 'danger' },
  INACTIVE: { tr: 'Pasif', en: 'Inactive', tone: 'neutral' },
};

export const NCR_STATUS: Record<string, LabelDef> = {
  OPEN: { tr: 'Açık', en: 'Open', tone: 'danger' },
  SUPPLIER_RESPONDED: { tr: 'Cevap alındı', en: 'Supplier responded', tone: 'warn' },
  UNDER_REVIEW: { tr: 'İncelemede', en: 'Under review', tone: 'info' },
  CLOSED: { tr: 'Kapatıldı', en: 'Closed', tone: 'ok' },
  REJECTED: { tr: 'Cevap reddedildi', en: 'Response rejected', tone: 'danger' },
};

export const NCR_SEVERITY: Record<string, LabelDef> = {
  MINOR: { tr: 'Küçük', en: 'Minor', tone: 'neutral' },
  MAJOR: { tr: 'Büyük', en: 'Major', tone: 'warn' },
  CRITICAL: { tr: 'Kritik', en: 'Critical', tone: 'danger' },
};

export const NCR_CATEGORY: Record<string, LabelDef> = {
  PRODUCT: { tr: 'Ürün', en: 'Product', tone: 'neutral' },
  PROCESS: { tr: 'Süreç', en: 'Process', tone: 'neutral' },
  DOCUMENTATION: { tr: 'Dokümantasyon', en: 'Documentation', tone: 'neutral' },
  DELIVERY: { tr: 'Teslimat', en: 'Delivery', tone: 'neutral' },
  SYSTEM: { tr: 'Sistem', en: 'System', tone: 'neutral' },
};

export const CONTRACT_STATUS: Record<string, LabelDef> = {
  DRAFT: { tr: 'Taslak', en: 'Draft', tone: 'neutral' },
  SENT: { tr: 'Gönderildi', en: 'Sent', tone: 'info' },
  SIGNED: { tr: 'İmzalandı', en: 'Signed', tone: 'ok' },
  ACTIVE: { tr: 'Yürürlükte', en: 'Active', tone: 'ok' },
  EXPIRED: { tr: 'Süresi doldu', en: 'Expired', tone: 'danger' },
  TERMINATED: { tr: 'Feshedildi', en: 'Terminated', tone: 'neutral' },
};

export const CONTRACT_TYPE: Record<string, LabelDef> = {
  NDA: { tr: 'Gizlilik (NDA)', en: 'NDA', tone: 'neutral' },
  FRAMEWORK: { tr: 'Çerçeve sözleşme', en: 'Framework', tone: 'neutral' },
  PRICE_AGREEMENT: { tr: 'Fiyat anlaşması', en: 'Price agreement', tone: 'neutral' },
  QUALITY_AGREEMENT: { tr: 'Kalite anlaşması', en: 'Quality agreement', tone: 'neutral' },
  LOGISTICS: { tr: 'Lojistik', en: 'Logistics', tone: 'neutral' },
  OTHER: { tr: 'Diğer', en: 'Other', tone: 'neutral' },
};

export const SOURCE: Record<string, LabelDef> = {
  WEB_FORM: { tr: 'Web formu', en: 'Web form', tone: 'neutral' },
  EMAIL: { tr: 'E-posta', en: 'Email', tone: 'neutral' },
  LINKEDIN: { tr: 'LinkedIn', en: 'LinkedIn', tone: 'neutral' },
  EYDEP: { tr: 'EYDEP', en: 'EYDEP', tone: 'neutral' },
  TURKISHEXPORTER: { tr: 'TurkishExporter', en: 'TurkishExporter', tone: 'neutral' },
  FAIR: { tr: 'Fuar', en: 'Trade fair', tone: 'neutral' },
  REFERRAL: { tr: 'Referans', en: 'Referral', tone: 'neutral' },
  IMPORT: { tr: 'İçe aktarım', en: 'Import', tone: 'neutral' },
  OTHER: { tr: 'Diğer', en: 'Other', tone: 'neutral' },
};

export const ROLE: Record<string, LabelDef> = {
  ADMIN: { tr: 'Yönetici', en: 'Administrator', tone: 'danger' },
  MODERATOR: { tr: 'Satınalma / Moderatör', en: 'Procurement / Moderator', tone: 'info' },
  QUALITY: { tr: 'Kalite Birimi', en: 'Quality Unit', tone: 'ok' },
  VIEWER: { tr: 'İzleyici', en: 'Viewer', tone: 'neutral' },
};

export const TASK_TYPE: Record<string, LabelDef> = {
  REVIEW_APPLICATION: { tr: 'Başvuru değerlendirmesi', en: 'Application review', tone: 'info' },
  PERFORM_AUDIT: { tr: 'Denetim yapılacak', en: 'Audit to perform', tone: 'warn' },
  REVIEW_NCR_RESPONSE: { tr: 'Uygunsuzluk takibi', en: 'NCR follow-up', tone: 'danger' },
  CONTRACT_RENEWAL: { tr: 'Sözleşme yenileme', en: 'Contract renewal', tone: 'warn' },
  SUPPLIER_INFO_REQUEST: { tr: 'Bilgi talebi takibi', en: 'Info request follow-up', tone: 'neutral' },
  REVIEW_DOCUMENT: { tr: 'Belge incelemesi', en: 'Document review', tone: 'info' },
};

export const TASK_STATUS: Record<string, LabelDef> = {
  OPEN: { tr: 'Açık', en: 'Open', tone: 'warn' },
  IN_PROGRESS: { tr: 'Devam ediyor', en: 'In progress', tone: 'info' },
  DONE: { tr: 'Tamamlandı', en: 'Done', tone: 'ok' },
  CANCELLED: { tr: 'İptal', en: 'Cancelled', tone: 'neutral' },
};

export const PRIORITY: Record<string, LabelDef> = {
  LOW: { tr: 'Düşük', en: 'Low', tone: 'neutral' },
  NORMAL: { tr: 'Normal', en: 'Normal', tone: 'neutral' },
  HIGH: { tr: 'Yüksek', en: 'High', tone: 'danger' },
};

export const RECOMMENDATION: Record<string, LabelDef> = {
  APPROVE: { tr: 'Onay', en: 'Approve', tone: 'ok' },
  APPROVE_WITH_CONDITIONS: { tr: 'Şartlı onay', en: 'Approve with conditions', tone: 'warn' },
  REAUDIT: { tr: 'Yeniden denetim', en: 'Re-audit', tone: 'warn' },
  REJECT: { tr: 'Ret', en: 'Reject', tone: 'danger' },
};

export const AUDIT_METHOD: Record<string, LabelDef> = {
  ONSITE: { tr: 'Yerinde', en: 'On-site', tone: 'neutral' },
  REMOTE: { tr: 'Uzaktan', en: 'Remote', tone: 'neutral' },
  DESKTOP: { tr: 'Masa başı', en: 'Desktop', tone: 'neutral' },
};

export const DOCUMENT_KIND: Record<string, LabelDef> = {
  PRESENTATION: { tr: 'Şirket sunumu', en: 'Company presentation', tone: 'neutral' },
  CATALOG: { tr: 'Ürün kataloğu', en: 'Product catalog', tone: 'neutral' },
  ISO9001: { tr: 'ISO 9001 sertifikası', en: 'ISO 9001 certificate', tone: 'neutral' },
  CERT_OTHER: { tr: 'Diğer sertifikalar', en: 'Other certificates', tone: 'neutral' },
  FINANCIAL: { tr: 'Mali tablo', en: 'Financial statement', tone: 'neutral' },
  AUDIT_REPORT: { tr: 'Denetim raporu', en: 'Audit report', tone: 'neutral' },
  CONTRACT_FILE: { tr: 'Sözleşme dosyası', en: 'Contract file', tone: 'neutral' },
  NCR_RESPONSE: { tr: 'Uygunsuzluk cevabı', en: 'NCR response', tone: 'neutral' },
  OTHER: { tr: 'Diğer', en: 'Other', tone: 'neutral' },
};

/** Etiket sözlüğünden metin okur; bilinmeyen kodda kodun kendisini döner. */
export function label(map: Record<string, LabelDef>, code: string | null | undefined, lang: 'tr' | 'en' = 'tr'): string {
  if (!code) return '—';
  return map[code]?.[lang] ?? code;
}

export function tone(map: Record<string, LabelDef>, code: string | null | undefined): BadgeTone {
  if (!code) return 'neutral';
  return map[code]?.tone ?? 'neutral';
}

/** Kullanıcıya gösterilecek tarih biçimi. */
export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return '—';
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMoney(value?: number | null, currency = 'EUR'): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

/** Gün farkını "3 gün önce" gibi ifadeye çevirir. */
export function relativeDays(value?: string | null): string {
  if (!value) return '—';
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (Number.isNaN(diff)) return '—';
  if (diff === 0) return 'bugün';
  if (diff === 1) return 'dün';
  if (diff < 0) return `${Math.abs(diff)} gün sonra`;
  return `${diff} gün önce`;
}
