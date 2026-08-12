import type { Request } from 'express';
import type { MailLang } from './mailText.js';

/**
 * Tedarikçinin ekranında görebileceği sunucu mesajları — üç dilde.
 *
 * Arayüz kendi dilini her istekte `X-Lang` başlığıyla bildirir; hata mesajı da
 * o dilde döner. Böylece Japonca portalda yanlış parola girildiğinde Türkçe bir
 * uyarı çıkmaz. Yönetim paneline özgü mesajlar bu dosyanın kapsamında değildir.
 */
type Entry = { tr: string; en: string; ja: string };

const text = {
  // -------------------------------- Giriş -----------------------------------
  'login.bad': {
    tr: 'E-posta veya parola hatalı.',
    en: 'Incorrect email or password.',
    ja: 'メールアドレスまたはパスワードが正しくありません。',
  },
  'login.closed': {
    tr: 'Tedarikçi kaydınız şu anda portal erişimine açık değil.',
    en: 'Your supplier account is not currently open for portal access.',
    ja: '現在、貴社のアカウントはポータルをご利用いただけない状態です。',
  },
  'login.expired': {
    tr: 'Oturumunuzun süresi doldu, lütfen tekrar giriş yapın.',
    en: 'Your session has expired, please sign in again.',
    ja: 'セッションの有効期限が切れました。もう一度ログインしてください。',
  },

  // --------------------------- Parola bağlantısı ----------------------------
  'token.invalid': { tr: 'Bağlantı geçersiz.', en: 'This link is not valid.', ja: 'このリンクは無効です。' },
  'token.revoked': {
    tr: 'Bu bağlantı iptal edilmiş.',
    en: 'This link has been revoked.',
    ja: 'このリンクは無効化されています。',
  },
  'token.used': {
    tr: 'Bu bağlantı daha önce kullanılmış. Parolanızı unuttuysanız yeni bir bağlantı isteyin.',
    en: 'This link has already been used. If you forgot your password, request a new link.',
    ja: 'このリンクはすでに使用されています。パスワードをお忘れの場合は、新しいリンクをご請求ください。',
  },
  'token.expired': {
    tr: 'Bağlantının süresi dolmuş. Giriş ekranından yeni bir bağlantı isteyebilirsiniz.',
    en: 'This link has expired. You can request a new one from the sign-in page.',
    ja: 'このリンクは有効期限が切れています。ログイン画面から新しいリンクをご請求いただけます。',
  },

  // ---------------------------------- Parola --------------------------------
  'pw.min': {
    tr: 'Parola en az 8 karakter olmalıdır.',
    en: 'The password must be at least 8 characters.',
    ja: 'パスワードは8文字以上で入力してください。',
  },
  'pw.letter': {
    tr: 'Parola en az bir harf içermelidir.',
    en: 'The password must contain at least one letter.',
    ja: 'パスワードには英字を1文字以上含めてください。',
  },
  'pw.digit': {
    tr: 'Parola en az bir rakam içermelidir.',
    en: 'The password must contain at least one digit.',
    ja: 'パスワードには数字を1文字以上含めてください。',
  },
  'pw.current.bad': {
    tr: 'Mevcut parolanız hatalı.',
    en: 'Your current password is incorrect.',
    ja: '現在のパスワードが正しくありません。',
  },
  'pw.set.ok': {
    tr: 'Parolanız oluşturuldu. Şimdi giriş yapabilirsiniz.',
    en: 'Your password has been set. You can sign in now.',
    ja: 'パスワードを設定しました。ログインいただけます。',
  },
  'pw.forgot.sent': {
    tr: 'Kayıtlı bir tedarikçi hesabı varsa parola bağlantısı e-posta ile gönderildi.',
    en: 'If a supplier account exists for this address, a password link has been emailed.',
    ja: 'このアドレスで登録があれば、パスワード設定用のリンクをメールでお送りしました。',
  },

  // ---------------------------------- Kayıtlar ------------------------------
  'notfound.supplier': {
    tr: 'Tedarikçi kaydı bulunamadı.',
    en: 'Supplier record not found.',
    ja: 'サプライヤーの登録が見つかりません。',
  },
  'notfound.portal': {
    tr: 'Tedarikçi kaydınız portal erişimine açık değil.',
    en: 'Your supplier record is not open for portal access.',
    ja: '貴社の登録はポータルのご利用対象ではありません。',
  },
  'notfound.document': { tr: 'Belge bulunamadı.', en: 'Document not found.', ja: '書類が見つかりません。' },
  'notfound.file': {
    tr: 'Belge dosyası bulunamadı.',
    en: 'The document file could not be found.',
    ja: '書類のファイルが見つかりません。',
  },
  'notfound.ncr': {
    tr: 'Uygunsuzluk kaydı bulunamadı.',
    en: 'Non-conformance report not found.',
    ja: '不適合の記録が見つかりません。',
  },
  'notfound.application': {
    tr: 'Bu referans numarası ve e-posta ile eşleşen bir başvuru bulunamadı.',
    en: 'No application matches this reference number and email address.',
    ja: 'この受付番号とメールアドレスに一致する申請は見つかりませんでした。',
  },

  // --------------------------------- İşlemler -------------------------------
  'ncr.not.open': {
    tr: 'Bu uygunsuzluk kaydı cevaba açık değil.',
    en: 'This non-conformance is not open for a response.',
    ja: 'この不適合は現在回答を受け付けていません。',
  },
  'ncr.responded': {
    tr: 'Cevabınız iletildi. Kalite birimimiz inceleyecektir.',
    en: 'Your response has been submitted. Our quality team will review it.',
    ja: '回答を送信しました。品質部門にて確認いたします。',
  },
  'upload.empty': {
    tr: 'En az bir dosya seçiniz.',
    en: 'Please select at least one file.',
    ja: 'ファイルを1つ以上選択してください。',
  },
  'ncr.closed': {
    tr: 'Bu uygunsuzluk kaydı kapatılmış.',
    en: 'This non-conformance has been closed.',
    ja: 'この不適合はすでに完了しています。',
  },
  'notfound.mail': { tr: 'Bildirim bulunamadı.', en: 'Notification not found.', ja: '通知が見つかりません。' },
} satisfies Record<string, Entry>;

export type UiTextKey = keyof typeof text;

/** İsteğin dilini `X-Lang` başlığından okur; tanınmazsa Türkçeye düşer. */
export function langOf(req: Request): MailLang {
  const raw = String(req.headers['x-lang'] ?? '').toLowerCase();
  return raw === 'en' || raw === 'ja' ? raw : 'tr';
}

/** İstek dilindeki kullanıcı mesajı. */
export function ut(req: Request, key: UiTextKey): string {
  return text[key][langOf(req)];
}
