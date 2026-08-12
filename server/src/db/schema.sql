-- ============================================================================
--  Business Partner Portal — veritabanı şeması / database schema
--  Faz 1: Başvuru formu + temel veri modeli
--  Faz 2: Moderatör paneli (liste, filtre, export)
--  Faz 3: İş akışı + kalite denetim modülü (A/B/C/D)
--  Faz 4: SRM (sözleşme, uygunsuzluk raporu, karşılıklı dosya paylaşımı)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Kullanıcılar ve yetkilendirme
-- Roller: ADMIN | MODERATOR (satınalma) | QUALITY (kalite birimi) | VIEWER
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('ADMIN','MODERATOR','QUALITY','VIEWER')),
  department     TEXT,
  phone          TEXT,
  locale         TEXT NOT NULL DEFAULT 'tr' CHECK (locale IN ('tr','en')),
  is_active      INTEGER NOT NULL DEFAULT 1,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Taksonomi: tedarik kategorileri (ürün grupları) ve kalite sertifikaları
-- Yönetilebilir olması önemli: yeni ürün grubu kod değişikliği gerektirmemeli.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name_tr     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  hint_tr     TEXT,
  hint_en     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS certifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description_tr TEXT,
  description_en TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sectors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name_tr     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- FAZ 1 — Tedarikçi başvuruları
-- status akışı:
--   NEW -> IN_REVIEW -> (NEEDS_INFO) -> AUDIT_PENDING -> AUDIT_PLANNED
--       -> AUDIT_IN_PROGRESS -> AUDIT_DONE -> APPROVED
--   herhangi bir noktada: REJECTED | ON_HOLD | DISQUALIFIED
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_no           TEXT NOT NULL UNIQUE,

  -- Firma bilgileri
  company_name     TEXT NOT NULL,
  company_key      TEXT NOT NULL,            -- normalize edilmiş ad (mükerrer tespiti)
  tax_id           TEXT NOT NULL,
  founded_year     INTEGER,
  employee_band    TEXT,
  revenue_band     TEXT,
  website          TEXT,
  sector           TEXT NOT NULL,
  sector_other     TEXT,

  -- İletişim
  contact_name     TEXT NOT NULL,
  contact_position TEXT,
  email            TEXT NOT NULL,
  phone            TEXT NOT NULL,
  country          TEXT NOT NULL,
  country_other    TEXT,
  city             TEXT NOT NULL,
  address          TEXT,

  -- Serbest metin
  references_text  TEXT,
  about            TEXT,
  category_other   TEXT,

  -- KVKK / GDPR kaydı (rıza metninin sürümü ve kanıtı ile birlikte)
  kvkk_consent     INTEGER NOT NULL DEFAULT 0,
  consent_version  TEXT,
  consent_ip       TEXT,
  consent_at       TEXT,

  -- Süreç
  status           TEXT NOT NULL DEFAULT 'NEW'
                   CHECK (status IN ('NEW','IN_REVIEW','NEEDS_INFO','AUDIT_PENDING','AUDIT_PLANNED',
                                     'AUDIT_IN_PROGRESS','AUDIT_DONE','APPROVED','REJECTED','ON_HOLD','DISQUALIFIED')),
  source           TEXT NOT NULL DEFAULT 'WEB_FORM'
                   CHECK (source IN ('WEB_FORM','EMAIL','LINKEDIN','EYDEP','TURKISHEXPORTER','FAIR','REFERRAL','IMPORT','OTHER')),
  priority         TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH')),
  assigned_to      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TEXT,
  decision_note    TEXT,
  rejection_reason TEXT,

  -- Otomatik ön değerlendirme
  completeness     INTEGER NOT NULL DEFAULT 0,   -- 0-100, form doluluk skoru
  duplicate_of     INTEGER REFERENCES applications(id) ON DELETE SET NULL,

  -- Anti-spam / iz
  submit_ip        TEXT,
  user_agent       TEXT,

  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_app_status   ON applications(status);
CREATE INDEX IF NOT EXISTS idx_app_created  ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_company  ON applications(company_key);
CREATE INDEX IF NOT EXISTS idx_app_tax      ON applications(tax_id);
CREATE INDEX IF NOT EXISTS idx_app_country  ON applications(country);
CREATE INDEX IF NOT EXISTS idx_app_sector   ON applications(sector);

-- Çoklu seçim: ürün grupları
CREATE TABLE IF NOT EXISTS application_categories (
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  category_code  TEXT NOT NULL,
  PRIMARY KEY (application_id, category_code)
);
CREATE INDEX IF NOT EXISTS idx_appcat_code ON application_categories(category_code);

-- Çoklu seçim: kalite sertifikaları
CREATE TABLE IF NOT EXISTS application_certifications (
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  cert_code      TEXT NOT NULL,
  valid_until    TEXT,
  PRIMARY KEY (application_id, cert_code)
);
CREATE INDEX IF NOT EXISTS idx_appcert_code ON application_certifications(cert_code);

-- ---------------------------------------------------------------------------
-- Belgeler — hem başvuru ekleri hem de Faz 4 karşılıklı dosya paylaşımı
-- owner_type: APPLICATION | SUPPLIER | AUDIT | CONTRACT | NCR
-- visibility: INTERNAL (sadece Yanmar) | SHARED (tedarikçi de görür/indirir)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type     TEXT NOT NULL CHECK (owner_type IN ('APPLICATION','SUPPLIER','AUDIT','CONTRACT','NCR')),
  owner_id       INTEGER NOT NULL,
  kind           TEXT NOT NULL,             -- PRESENTATION | CATALOG | ISO9001 | CERT_OTHER | FINANCIAL | NCR_RESPONSE | CONTRACT_FILE | AUDIT_REPORT | OTHER
  original_name  TEXT NOT NULL,
  stored_name    TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  visibility     TEXT NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL','SHARED')),
  uploaded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_supplier INTEGER NOT NULL DEFAULT 0,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doc_owner ON documents(owner_type, owner_id);

-- ---------------------------------------------------------------------------
-- FAZ 3 — İş sırası / görev kuyruğu
-- "Moderatör onayladığında talep Kalite Birimi'nin ekranına task olarak düşer"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  type           TEXT NOT NULL CHECK (type IN ('REVIEW_APPLICATION','PERFORM_AUDIT','REVIEW_NCR_RESPONSE',
                                               'CONTRACT_RENEWAL','SUPPLIER_INFO_REQUEST','REVIEW_DOCUMENT')),
  title          TEXT NOT NULL,
  description    TEXT,
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('APPLICATION','SUPPLIER','AUDIT','CONTRACT','NCR')),
  entity_id      INTEGER NOT NULL,
  assigned_role  TEXT NOT NULL CHECK (assigned_role IN ('ADMIN','MODERATOR','QUALITY','VIEWER')),
  assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  priority       TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH')),
  due_date       TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_queue  ON tasks(status, assigned_role);
CREATE INDEX IF NOT EXISTS idx_task_entity ON tasks(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- FAZ 3 — Kalite denetimleri
-- Ağırlıklı kontrol listesi -> toplam puan -> A/B/C/D notu
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name_tr     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_template_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id  INTEGER NOT NULL REFERENCES audit_templates(id) ON DELETE CASCADE,
  section_tr   TEXT NOT NULL,
  section_en   TEXT NOT NULL,
  question_tr  TEXT NOT NULL,
  question_en  TEXT NOT NULL,
  weight       REAL NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_no       TEXT NOT NULL UNIQUE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  supplier_id    INTEGER,
  template_id    INTEGER REFERENCES audit_templates(id) ON DELETE SET NULL,
  type           TEXT NOT NULL DEFAULT 'INITIAL' CHECK (type IN ('INITIAL','PERIODIC','FOLLOW_UP','SPECIAL')),
  status         TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  auditor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  planned_date   TEXT,
  completed_at   TEXT,
  method         TEXT CHECK (method IN ('ONSITE','REMOTE','DESKTOP')),
  score          REAL,                       -- 0-100 ağırlıklı toplam
  grade          TEXT CHECK (grade IN ('A','B','C','D')),
  strengths      TEXT,
  findings       TEXT,
  recommendation TEXT CHECK (recommendation IN ('APPROVE','APPROVE_WITH_CONDITIONS','REAUDIT','REJECT')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_audit_app    ON audits(application_id);

CREATE TABLE IF NOT EXISTS audit_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id   INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES audit_template_items(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  note       TEXT,
  UNIQUE (audit_id, item_id)
);

-- ---------------------------------------------------------------------------
-- FAZ 3/4 — Onaylı tedarikçi havuzu
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_code   TEXT NOT NULL UNIQUE,
  application_id  INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  company_name    TEXT NOT NULL,
  tax_id          TEXT NOT NULL,
  country         TEXT NOT NULL,
  city            TEXT,
  website         TEXT,
  contact_name    TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  grade           TEXT CHECK (grade IN ('A','B','C','D')),
  status          TEXT NOT NULL DEFAULT 'APPROVED'
                  CHECK (status IN ('APPROVED','CONDITIONAL','SUSPENDED','BLACKLISTED','INACTIVE')),
  approved_at     TEXT,
  next_audit_due  TEXT,
  otd_percent     REAL,                      -- zamanında teslimat (Faz 4 performans)
  ppm             REAL,                      -- kalite hata oranı
  notes           TEXT,

  -- Tedarikçi portalı girişi: parolayı tedarikçi kendisi belirler
  -- (onay e-postasındaki bağlantıyla). Parola yoksa henüz giriş açılmamıştır.
  password_hash   TEXT,
  portal_last_login_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_status ON suppliers(status);

CREATE TABLE IF NOT EXISTS supplier_categories (
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL,
  PRIMARY KEY (supplier_id, category_code)
);

-- ---------------------------------------------------------------------------
-- FAZ 4 — Sözleşme yönetimi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_no    TEXT NOT NULL UNIQUE,
  supplier_id    INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('NDA','FRAMEWORK','PRICE_AGREEMENT','QUALITY_AGREEMENT','LOGISTICS','OTHER')),
  status         TEXT NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT','SENT','SIGNED','ACTIVE','EXPIRED','TERMINATED')),
  start_date     TEXT,
  end_date       TEXT,
  currency       TEXT DEFAULT 'EUR',
  value          REAL,
  renewal_notice_days INTEGER DEFAULT 60,
  auto_renew     INTEGER NOT NULL DEFAULT 0,
  owner_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  signed_at      TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contract_supplier ON contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_contract_end      ON contracts(end_date);

-- ---------------------------------------------------------------------------
-- FAZ 4 — Uygunsuzluk raporları (NCR) — 8D benzeri akış
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ncrs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ncr_no          TEXT NOT NULL UNIQUE,
  supplier_id     INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('PRODUCT','PROCESS','DOCUMENTATION','DELIVERY','SYSTEM')),
  severity        TEXT NOT NULL CHECK (severity IN ('MINOR','MAJOR','CRITICAL')),
  description     TEXT NOT NULL,
  part_no         TEXT,
  qty_affected    INTEGER,
  detected_at     TEXT,
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','SUPPLIER_RESPONDED','UNDER_REVIEW','CLOSED','REJECTED')),
  containment     TEXT,
  root_cause      TEXT,
  corrective_action  TEXT,
  preventive_action  TEXT,
  responded_at    TEXT,
  opened_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at       TEXT,
  effectiveness   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ncr_supplier ON ncrs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ncr_status   ON ncrs(status);

-- ---------------------------------------------------------------------------
-- Notlar / yorumlar (her varlığa iliştirilebilir)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('APPLICATION','SUPPLIER','AUDIT','CONTRACT','NCR')),
  entity_id    INTEGER NOT NULL,
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_label TEXT,                        -- tedarikçi tarafından yazıldıysa firma adı
  body         TEXT NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL','SHARED')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_note_entity ON notes(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Denetim izi (ISO/IATF uyumu için: kim, ne zaman, neyi değiştirdi)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  action       TEXT NOT NULL,
  actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_label  TEXT NOT NULL DEFAULT 'system',
  from_value   TEXT,
  to_value     TEXT,
  detail       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_log_entity ON activity_log(entity_type, entity_id, id DESC);

-- ---------------------------------------------------------------------------
-- E-posta kutusu — SMTP yapılandırılmamışsa da her bildirim burada saklanır
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mail_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email     TEXT NOT NULL,
  -- Alıcı Yanmar personeli mi (INTERNAL) yoksa tedarikçi mi (SUPPLIER)?
  -- Kutunun "ekibe gelen" / "tedarikçilere gönderilen" ayrımı buna dayanır.
  audience     TEXT NOT NULL DEFAULT 'SUPPLIER' CHECK (audience IN ('INTERNAL','SUPPLIER')),
  subject      TEXT NOT NULL,
  body_html    TEXT NOT NULL,
  template     TEXT,
  entity_type  TEXT,
  entity_id    INTEGER,
  status       TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED','LOGGED')),
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at      TEXT
);

-- ---------------------------------------------------------------------------
-- Tedarikçi self-servis erişimi (hesap/şifre yok — imzalı tek kullanımlık bağlantı)
-- "Tedarikçinin panele ihtiyacı yok" gereksinimini bozmadan Faz 4 dosya
-- alışverişini ve NCR cevaplarını mümkün kılar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT NOT NULL UNIQUE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('TRACK','INFO_REQUEST','NCR_RESPONSE','DOC_EXCHANGE','SET_PASSWORD')),
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('APPLICATION','SUPPLIER','NCR')),
  entity_id    INTEGER NOT NULL,
  email        TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used_at      TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portal_entity ON portal_tokens(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Ayarlar (eşik değerler, kurum bilgileri, KVKK metin sürümü ...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kaydedilmiş filtreler (moderatörün sık kullandığı görünümler)
CREATE TABLE IF NOT EXISTS saved_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  query       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
