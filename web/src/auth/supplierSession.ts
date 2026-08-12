const KEY = 'bp_supplier_token';

/**
 * Tedarikçi portalı oturumu — Yanmar personeli oturumundan tamamen ayrı
 * saklanır. Aynı tarayıcıda ikisi bir arada bulunabilir ve birbirinin
 * yetkisini devralmaz.
 */
export const supplierToken = {
  get: () => localStorage.getItem(KEY),
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

export type SupplierSession = {
  id: number;
  supplier_code: string;
  company_name: string;
  email: string;
  status: string;
  grade: string | null;
};
