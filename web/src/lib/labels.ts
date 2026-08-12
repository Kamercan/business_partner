/** Sunucu enum'larının kullanıcıya gösterilen karşılıkları ve renk sınıfları. */
import type { Lang } from '../i18n';

export type BadgeTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger';

/** Tarih/sayı biçimlendirmesi için dil kodları. */
const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-GB', ja: 'ja-JP' };

type LabelDef = { tr: string; en: string; ja: string; tone: BadgeTone };

export const APPLICATION_STATUS: Record<string, LabelDef> = {
  NEW: { tr: 'Yeni', en: 'New', ja: '新規', tone: 'info' },
  IN_REVIEW: { tr: 'İncelemede', en: 'In review', ja: '審査中', tone: 'info' },
  NEEDS_INFO: { tr: 'Bilgi bekleniyor', en: 'Awaiting info', ja: '情報待ち', tone: 'warn' },
  AUDIT_PENDING: { tr: 'Denetim bekliyor', en: 'Audit pending', ja: '監査待ち', tone: 'warn' },
  AUDIT_PLANNED: { tr: 'Denetim planlandı', en: 'Audit planned', ja: '監査予定', tone: 'warn' },
  AUDIT_IN_PROGRESS: { tr: 'Denetim sürüyor', en: 'Audit in progress', ja: '監査中', tone: 'warn' },
  AUDIT_DONE: { tr: 'Denetim tamamlandı', en: 'Audit completed', ja: '監査完了', tone: 'info' },
  APPROVED: { tr: 'Onaylı tedarikçi', en: 'Approved supplier', ja: '承認サプライヤー', tone: 'ok' },
  REJECTED: { tr: 'Reddedildi', en: 'Rejected', ja: '不採用', tone: 'danger' },
  ON_HOLD: { tr: 'Beklemede', en: 'On hold', ja: '保留', tone: 'neutral' },
  DISQUALIFIED: { tr: 'Elendi', en: 'Disqualified', ja: '資格なし', tone: 'danger' },
};

export const AUDIT_STATUS: Record<string, LabelDef> = {
  PENDING: { tr: 'Bekliyor', en: 'Pending', ja: '待機中', tone: 'warn' },
  PLANNED: { tr: 'Planlandı', en: 'Planned', ja: '予定', tone: 'info' },
  IN_PROGRESS: { tr: 'Sürüyor', en: 'In progress', ja: '進行中', tone: 'info' },
  COMPLETED: { tr: 'Tamamlandı', en: 'Completed', ja: '完了', tone: 'ok' },
  CANCELLED: { tr: 'İptal', en: 'Cancelled', ja: '中止', tone: 'neutral' },
};

export const SUPPLIER_STATUS: Record<string, LabelDef> = {
  APPROVED: { tr: 'Onaylı', en: 'Approved', ja: '承認済み', tone: 'ok' },
  CONDITIONAL: { tr: 'Şartlı onay', en: 'Conditional', ja: '条件付き承認', tone: 'warn' },
  SUSPENDED: { tr: 'Askıda', en: 'Suspended', ja: '取引停止', tone: 'danger' },
  BLACKLISTED: { tr: 'Kara liste', en: 'Blacklisted', ja: '取引禁止', tone: 'danger' },
  INACTIVE: { tr: 'Pasif', en: 'Inactive', ja: '休止', tone: 'neutral' },
};

export const NCR_STATUS: Record<string, LabelDef> = {
  OPEN: { tr: 'Açık', en: 'Open', ja: '未対応', tone: 'danger' },
  SUPPLIER_RESPONDED: { tr: 'Cevap alındı', en: 'Supplier responded', ja: '回答受領', tone: 'warn' },
  UNDER_REVIEW: { tr: 'İncelemede', en: 'Under review', ja: '確認中', tone: 'info' },
  CLOSED: { tr: 'Kapatıldı', en: 'Closed', ja: '完了', tone: 'ok' },
  REJECTED: { tr: 'Cevap reddedildi', en: 'Response rejected', ja: '回答却下', tone: 'danger' },
};

export const NCR_SEVERITY: Record<string, LabelDef> = {
  MINOR: { tr: 'Küçük', en: 'Minor', ja: '軽微', tone: 'neutral' },
  MAJOR: { tr: 'Büyük', en: 'Major', ja: '重大', tone: 'warn' },
  CRITICAL: { tr: 'Kritik', en: 'Critical', ja: '致命的', tone: 'danger' },
};

export const NCR_CATEGORY: Record<string, LabelDef> = {
  PRODUCT: { tr: 'Ürün', en: 'Product', ja: '製品', tone: 'neutral' },
  PROCESS: { tr: 'Süreç', en: 'Process', ja: '工程', tone: 'neutral' },
  DOCUMENTATION: { tr: 'Dokümantasyon', en: 'Documentation', ja: '書類', tone: 'neutral' },
  DELIVERY: { tr: 'Teslimat', en: 'Delivery', ja: '納入', tone: 'neutral' },
  SYSTEM: { tr: 'Sistem', en: 'System', ja: 'システム', tone: 'neutral' },
};

export const CONTRACT_STATUS: Record<string, LabelDef> = {
  DRAFT: { tr: 'Taslak', en: 'Draft', ja: '草案', tone: 'neutral' },
  SENT: { tr: 'Gönderildi', en: 'Sent', ja: '送付済み', tone: 'info' },
  SIGNED: { tr: 'İmzalandı', en: 'Signed', ja: '締結済み', tone: 'ok' },
  ACTIVE: { tr: 'Yürürlükte', en: 'Active', ja: '有効', tone: 'ok' },
  EXPIRED: { tr: 'Süresi doldu', en: 'Expired', ja: '期限切れ', tone: 'danger' },
  TERMINATED: { tr: 'Feshedildi', en: 'Terminated', ja: '解約', tone: 'neutral' },
};

export const CONTRACT_TYPE: Record<string, LabelDef> = {
  NDA: { tr: 'Gizlilik (NDA)', en: 'NDA', ja: '秘密保持契約（NDA）', tone: 'neutral' },
  FRAMEWORK: { tr: 'Çerçeve sözleşme', en: 'Framework', ja: '基本契約', tone: 'neutral' },
  PRICE_AGREEMENT: { tr: 'Fiyat anlaşması', en: 'Price agreement', ja: '価格取決め', tone: 'neutral' },
  QUALITY_AGREEMENT: { tr: 'Kalite anlaşması', en: 'Quality agreement', ja: '品質協定', tone: 'neutral' },
  LOGISTICS: { tr: 'Lojistik', en: 'Logistics', ja: '物流取決め', tone: 'neutral' },
  OTHER: { tr: 'Diğer', en: 'Other', ja: 'その他', tone: 'neutral' },
};

export const ROLE: Record<string, LabelDef> = {
  ADMIN: { tr: 'Yönetici', en: 'Administrator', ja: '管理者', tone: 'danger' },
  MODERATOR: { tr: 'Satınalma / Moderatör', en: 'Procurement / Moderator', ja: '調達／モデレーター', tone: 'info' },
  QUALITY: { tr: 'Kalite Birimi', en: 'Quality Unit', ja: '品質部門', tone: 'ok' },
  VIEWER: { tr: 'İzleyici', en: 'Viewer', ja: '閲覧者', tone: 'neutral' },
};

export const TASK_TYPE: Record<string, LabelDef> = {
  REVIEW_APPLICATION: { tr: 'Başvuru değerlendirmesi', en: 'Application review', ja: '申請の審査', tone: 'info' },
  PERFORM_AUDIT: { tr: 'Denetim yapılacak', en: 'Audit to perform', ja: '監査の実施', tone: 'warn' },
  REVIEW_NCR_RESPONSE: { tr: 'Uygunsuzluk takibi', en: 'NCR follow-up', ja: '不適合のフォロー', tone: 'danger' },
  CONTRACT_RENEWAL: { tr: 'Sözleşme yenileme', en: 'Contract renewal', ja: '契約更新', tone: 'warn' },
  SUPPLIER_INFO_REQUEST: { tr: 'Bilgi talebi takibi', en: 'Info request follow-up', ja: '情報依頼のフォロー', tone: 'neutral' },
  REVIEW_DOCUMENT: { tr: 'Belge incelemesi', en: 'Document review', ja: '書類の確認', tone: 'info' },
};

export const TASK_STATUS: Record<string, LabelDef> = {
  OPEN: { tr: 'Açık', en: 'Open', ja: '未着手', tone: 'warn' },
  IN_PROGRESS: { tr: 'Devam ediyor', en: 'In progress', ja: '対応中', tone: 'info' },
  DONE: { tr: 'Tamamlandı', en: 'Done', ja: '完了', tone: 'ok' },
  CANCELLED: { tr: 'İptal', en: 'Cancelled', ja: '中止', tone: 'neutral' },
};

export const PRIORITY: Record<string, LabelDef> = {
  LOW: { tr: 'Düşük', en: 'Low', ja: '低', tone: 'neutral' },
  NORMAL: { tr: 'Normal', en: 'Normal', ja: '通常', tone: 'neutral' },
  HIGH: { tr: 'Yüksek', en: 'High', ja: '高', tone: 'danger' },
};

export const RECOMMENDATION: Record<string, LabelDef> = {
  APPROVE: { tr: 'Onay', en: 'Approve', ja: '承認', tone: 'ok' },
  APPROVE_WITH_CONDITIONS: { tr: 'Şartlı onay', en: 'Approve with conditions', ja: '条件付き承認', tone: 'warn' },
  REAUDIT: { tr: 'Yeniden denetim', en: 'Re-audit', ja: '再監査', tone: 'warn' },
  REJECT: { tr: 'Ret', en: 'Reject', ja: '不採用', tone: 'danger' },
};

export const AUDIT_METHOD: Record<string, LabelDef> = {
  ONSITE: { tr: 'Yerinde', en: 'On-site', ja: '現地', tone: 'neutral' },
  REMOTE: { tr: 'Uzaktan', en: 'Remote', ja: 'リモート', tone: 'neutral' },
  DESKTOP: { tr: 'Masa başı', en: 'Desktop', ja: '書面', tone: 'neutral' },
};

export const DOCUMENT_KIND: Record<string, LabelDef> = {
  PRESENTATION: { tr: 'Şirket sunumu', en: 'Company presentation', ja: '会社紹介資料', tone: 'neutral' },
  CATALOG: { tr: 'Ürün kataloğu', en: 'Product catalog', ja: '製品カタログ', tone: 'neutral' },
  ISO9001: { tr: 'ISO 9001 sertifikası', en: 'ISO 9001 certificate', ja: 'ISO 9001 認証書', tone: 'neutral' },
  CERT_OTHER: { tr: 'Diğer sertifikalar', en: 'Other certificates', ja: 'その他の認証', tone: 'neutral' },
  FINANCIAL: { tr: 'Mali tablo', en: 'Financial statement', ja: '財務資料', tone: 'neutral' },
  AUDIT_REPORT: { tr: 'Denetim raporu', en: 'Audit report', ja: '監査報告書', tone: 'neutral' },
  CONTRACT_FILE: { tr: 'Sözleşme dosyası', en: 'Contract file', ja: '契約書', tone: 'neutral' },
  NCR_RESPONSE: { tr: 'Uygunsuzluk cevabı', en: 'NCR response', ja: '不適合回答', tone: 'neutral' },
  OTHER: { tr: 'Diğer', en: 'Other', ja: 'その他', tone: 'neutral' },
};

/** Etiket sözlüğünden metin okur; bilinmeyen kodda kodun kendisini döner. */
export function label(map: Record<string, LabelDef>, code: string | null | undefined, lang: Lang = 'tr'): string {
  if (!code) return '—';
  return map[code]?.[lang] ?? code;
}

export function tone(map: Record<string, LabelDef>, code: string | null | undefined): BadgeTone {
  if (!code) return 'neutral';
  return map[code]?.tone ?? 'neutral';
}

/** Kullanıcıya gösterilecek tarih biçimi (seçili dilin yerel biçimiyle). */
export function formatDate(value?: string | null, withTime = false, lang: Lang = 'tr'): string {
  if (!value) return '—';
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(LOCALE[lang], {
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

export function formatMoney(value?: number | null, currency = 'EUR', lang: Lang = 'tr'): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

/** Gün farkını "3 gün önce" gibi ifadeye çevirir. */
export function relativeDays(value?: string | null, lang: Lang = 'tr'): string {
  if (!value) return '—';
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (Number.isNaN(diff)) return '—';
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto' });
  return rtf.format(-diff, 'day');
}
