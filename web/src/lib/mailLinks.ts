/**
 * E-posta gövdesindeki bağlantıları çıkarır.
 *
 * Önizleme, güvenlik gereği tam kısıtlı (sandbox) bir iframe içinde gösterilir;
 * bu da içerideki bağlantıların tıklanmasını engeller. Bağlantılar bu yüzden
 * ayrıştırılıp önizlemenin yanında gerçek butonlar olarak sunulur.
 */
export function extractLinks(html: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const seen = new Set<string>();
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    // Yalnızca http(s) — javascript:/data: gibi şemalar dışarıda bırakılır.
    if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
    seen.add(href);
    const text = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    links.push({ href, text: text || href });
  }
  return links;
}

/** Önizleme çerçevesinin altındaki açıklama metni. */
export const MAIL_LINK_NOTE =
  'Önizleme güvenlik için kısıtlı bir çerçevede gösterilir; bağlantıları buradan açabilirsiniz.';
