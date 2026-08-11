/**
 * Taksonomi + demo veri yükleyici.
 *   npm run db:seed          -> referans veriler + admin + demo başvurular
 *   npm run db:seed -- --no-demo  -> sadece referans veriler ve admin
 */
import bcrypt from 'bcryptjs';
import { db, migrate, setSetting } from './index.js';
import { config } from '../config.js';
import { normalizeCompany } from '../lib/text.js';
import { computeCompleteness } from '../lib/scoring.js';
import { nextRefNo } from '../lib/ids.js';

const CATEGORIES = [
  {
    code: 'sac',
    name_tr: 'Sac Metal Şekillendirme',
    name_en: 'Sheet Metal Forming',
    hint_tr:
      'Şasi parçaları, motor kapakları, kabin panelleri, koruma plakaları, kaput, çamurluk — pres, lazer kesim, büküm, kaynaklı imalat vb. operasyonları',
    hint_en:
      'Chassis parts, engine covers, cabin panels, guard plates, hoods, fenders — pressing, laser cutting, bending, welded fabrication etc.',
  },
  {
    code: 'disli',
    name_tr: 'Güç Aktarım Elemanları',
    name_en: 'Power Transmission Components',
    hint_tr: 'Dişliler, şanzıman parçaları, kavramalar, kardan mili, diferansiyel ve tahrik elemanları',
    hint_en: 'Gears, transmission components, clutches, drive shafts, differentials and drive elements',
  },
  {
    code: 'dokum',
    name_tr: 'Hassas ve Endüstriyel Döküm',
    name_en: 'Precision & Industrial Casting',
    hint_tr:
      'Motor blokları, silindir kapakları, krank mili, dişli kutusu gövdeleri, manifoldlar — sfero, kır döküm ve hassas döküm parçaları',
    hint_en:
      'Engine blocks, cylinder heads, crankshafts, gearbox housings, manifolds — ductile, gray and precision casting parts',
  },
  {
    code: 'kaucuk',
    name_tr: 'Esnek Hortum ve Bağlantı Elemanları',
    name_en: 'Flexible Hoses & Connectors',
    hint_tr:
      'Yakıt hortumları, hidrolik hortumlar, soğutma hortumları, hava emiş hortumları ve bağlantı elemanları (kelepçe, rakor, conta)',
    hint_en:
      'Fuel hoses, hydraulic hoses, coolant hoses, air intake hoses and connectors (clamps, fittings, gaskets)',
  },
  {
    code: 'izolasyon',
    name_tr: 'Termal ve Akustik Yalıtım Çözümleri',
    name_en: 'Thermal & Acoustic Insulation Solutions',
    hint_tr:
      'Egzoz manifold ceketleri, motor ses yalıtım panelleri, kabin akustik yalıtımı, ısı yalıtım battaniyeleri',
    hint_en:
      'Exhaust manifold jackets, engine acoustic panels, cabin acoustic insulation, heat insulation blankets',
  },
  {
    code: 'hidrolik',
    name_tr: 'Hidrolik Güç ve Kontrol Üniteleri',
    name_en: 'Hydraulic Power & Control Units',
    hint_tr: 'Hidrolik pompalar, valfler, silindirler, manifoldlar, kontrol valfleri ve hidrolik tank üniteleri',
    hint_en: 'Hydraulic pumps, valves, cylinders, manifolds, control valves and hydraulic tank units',
  },
  {
    code: 'kimyasal',
    name_tr: 'Endüstriyel Sarf ve Kimyasallar',
    name_en: 'Industrial Consumables & Chemicals',
    hint_tr:
      'Motor / hidrolik / dişli yağları, gres, antifriz, sızdırmazlık ürünleri, endüstriyel temizleyici ve boyalar',
    hint_en: 'Engine / hydraulic / gear oils, greases, coolants, sealants, industrial cleaners and paints',
  },
  {
    code: 'elektrik',
    name_tr: 'Elektrik ve Kablo Donanımı',
    name_en: 'Electrical & Wiring Harness',
    hint_tr: 'Kablo demetleri, sensörler, gösterge panelleri, aydınlatma grupları, akü ve şarj sistemleri',
    hint_en: 'Wiring harnesses, sensors, instrument clusters, lighting groups, batteries and charging systems',
  },
  {
    code: 'islem',
    name_tr: 'Yüzey İşlem ve Isıl İşlem',
    name_en: 'Surface & Heat Treatment',
    hint_tr: 'Boyama, kaplama, galvaniz, fosfat, sementasyon, indüksiyon sertleştirme hizmetleri',
    hint_en: 'Painting, coating, galvanizing, phosphating, carburizing, induction hardening services',
  },
  {
    code: 'lojistik',
    name_tr: 'Ambalaj ve Lojistik Hizmetleri',
    name_en: 'Packaging & Logistics Services',
    hint_tr: 'Endüstriyel ambalaj, palet, kasa imalatı, iç/dış lojistik ve gümrükleme hizmetleri',
    hint_en: 'Industrial packaging, pallets, crates, inbound/outbound logistics and customs services',
  },
  { code: 'diger', name_tr: 'Diğer', name_en: 'Other', hint_tr: null, hint_en: null },
];

const CERTIFICATIONS = [
  { code: 'iso9001', name: 'ISO 9001', tr: 'Kalite Yönetim Sistemi', en: 'Quality Management System' },
  { code: 'iatf', name: 'IATF 16949', tr: 'Otomotiv Kalite Yönetim Sistemi', en: 'Automotive QMS' },
  { code: 'iso14001', name: 'ISO 14001', tr: 'Çevre Yönetim Sistemi', en: 'Environmental Management' },
  { code: 'iso45001', name: 'ISO 45001', tr: 'İş Sağlığı ve Güvenliği', en: 'Occupational Health & Safety' },
  { code: 'iso50001', name: 'ISO 50001', tr: 'Enerji Yönetim Sistemi', en: 'Energy Management' },
  { code: 'ce', name: 'CE', tr: 'Avrupa Uygunluk İşareti', en: 'European Conformity' },
  { code: 'en15085', name: 'EN 15085', tr: 'Demiryolu Kaynak Sertifikasyonu', en: 'Railway Welding Certification' },
  { code: 'iso3834', name: 'ISO 3834', tr: 'Kaynak Kalite Gereklilikleri', en: 'Welding Quality Requirements' },
  { code: 'as9100', name: 'AS 9100', tr: 'Havacılık Kalite Yönetimi', en: 'Aerospace Quality Management' },
  { code: 'iso27001', name: 'ISO 27001', tr: 'Bilgi Güvenliği Yönetimi', en: 'Information Security Management' },
];

const SECTORS = [
  ['otomotiv', 'Otomotiv', 'Automotive'],
  ['otomotiv_yan', 'Otomotiv Yan Sanayi', 'Automotive Components'],
  ['tarim', 'Tarım Makineleri', 'Agricultural Machinery'],
  ['insaat', 'İş ve İnşaat Makineleri', 'Construction & Earthmoving Equipment'],
  ['beyaz_esya', 'Beyaz Eşya', 'Home Appliances'],
  ['savunma', 'Savunma Sanayi', 'Defense Industry'],
  ['metalurji', 'Demir-Çelik ve Metalurji', 'Iron-Steel & Metallurgy'],
  ['makine', 'Makine İmalat', 'Machinery Manufacturing'],
  ['elektronik', 'Elektrik-Elektronik', 'Electrical & Electronics'],
  ['kimya', 'Kimya ve Petrokimya', 'Chemicals & Petrochemicals'],
  ['kaucuk_plastik', 'Kauçuk ve Plastik', 'Rubber & Plastics'],
  ['havacilik', 'Havacılık ve Uzay', 'Aerospace'],
  ['denizcilik', 'Denizcilik ve Tersane', 'Marine & Shipyard'],
  ['demiryolu', 'Demiryolu', 'Railway'],
  ['enerji', 'Enerji ve Güç Sistemleri', 'Energy & Power Systems'],
  ['diger', 'Diğer', 'Other'],
];

/** IATF 16949 esinli, ağırlıklı tedarikçi denetim kontrol listesi. */
const AUDIT_ITEMS: Array<[string, string, string, string, number]> = [
  // [section_tr, section_en, question_tr, question_en, weight]
  ['Kalite Yönetim Sistemi', 'Quality Management System', 'Belgelendirilmiş ve güncel bir kalite yönetim sistemi mevcut mu?', 'Is a certified and up-to-date quality management system in place?', 3],
  ['Kalite Yönetim Sistemi', 'Quality Management System', 'Doküman ve kayıt kontrolü etkin şekilde uygulanıyor mu?', 'Are document and record controls effectively applied?', 2],
  ['Kalite Yönetim Sistemi', 'Quality Management System', 'İç denetim ve yönetimin gözden geçirmesi düzenli yapılıyor mu?', 'Are internal audits and management reviews performed regularly?', 2],

  ['Üretim Süreç Yeterliliği', 'Production Process Capability', 'Süreç akış şeması, PFMEA ve kontrol planı üçlüsü uyumlu mu?', 'Are process flow, PFMEA and control plan mutually consistent?', 3],
  ['Üretim Süreç Yeterliliği', 'Production Process Capability', 'Kritik karakteristiklerde proses yeterliliği (Cp/Cpk) izleniyor mu?', 'Is process capability (Cp/Cpk) monitored for critical characteristics?', 3],
  ['Üretim Süreç Yeterliliği', 'Production Process Capability', 'Makine parkuru ve bakım planı üretim hacmini karşılıyor mu?', 'Do the machinery and maintenance plan support the required volume?', 2],
  ['Üretim Süreç Yeterliliği', 'Production Process Capability', 'İzlenebilirlik (lot/seri takibi) sağlanıyor mu?', 'Is traceability (lot/serial tracking) ensured?', 2],

  ['Ölçüm ve Test Yetkinliği', 'Measurement & Test Capability', 'Kalibrasyon planı ve izlenebilir kalibrasyon kayıtları var mı?', 'Is there a calibration plan with traceable calibration records?', 2],
  ['Ölçüm ve Test Yetkinliği', 'Measurement & Test Capability', 'Ölçüm sistemi analizi (MSA/GR&R) uygulanıyor mu?', 'Is measurement system analysis (MSA/GR&R) applied?', 2],
  ['Ölçüm ve Test Yetkinliği', 'Measurement & Test Capability', 'Girdi, ara ve son kontrol istasyonları tanımlı mı?', 'Are incoming, in-process and final inspection stations defined?', 2],

  ['Malzeme ve Tedarik Zinciri', 'Material & Supply Chain', 'Alt tedarikçi seçme ve değerlendirme süreci tanımlı mı?', 'Is there a defined sub-supplier selection and evaluation process?', 2],
  ['Malzeme ve Tedarik Zinciri', 'Material & Supply Chain', 'Malzeme sertifikaları ve menşe belgeleri saklanıyor mu?', 'Are material certificates and origin documents retained?', 2],
  ['Malzeme ve Tedarik Zinciri', 'Material & Supply Chain', 'Stok yönetimi ve FIFO uygulaması etkin mi?', 'Are inventory management and FIFO practices effective?', 1],

  ['Teslimat ve Kapasite', 'Delivery & Capacity', 'Zamanında teslimat performansı ölçülüyor ve raporlanıyor mu?', 'Is on-time delivery performance measured and reported?', 3],
  ['Teslimat ve Kapasite', 'Delivery & Capacity', 'Kapasite artırım ve acil durum (iş sürekliliği) planı var mı?', 'Is there a capacity expansion and business continuity plan?', 2],
  ['Teslimat ve Kapasite', 'Delivery & Capacity', 'Ambalajlama ve sevkiyat standartları müşteri şartlarını karşılıyor mu?', 'Do packaging and shipping standards meet customer requirements?', 2],

  ['İSG, Çevre ve Sürdürülebilirlik', 'HSE & Sustainability', 'İş sağlığı ve güvenliği yönetimi ile risk değerlendirmesi mevcut mu?', 'Are occupational health & safety management and risk assessment in place?', 2],
  ['İSG, Çevre ve Sürdürülebilirlik', 'HSE & Sustainability', 'Atık yönetimi ve çevresel izinler tam mı?', 'Is waste management complete with valid environmental permits?', 2],
  ['İSG, Çevre ve Sürdürülebilirlik', 'HSE & Sustainability', 'Karbon ayak izi / enerji verimliliği çalışmaları yürütülüyor mu?', 'Are carbon footprint / energy efficiency efforts being pursued?', 1],

  ['Finansal ve Kurumsal Sağlamlık', 'Financial & Corporate Strength', 'Son iki yılın mali tabloları sağlıklı ve sürdürülebilir mi?', 'Are the last two years of financial statements sound and sustainable?', 2],
  ['Finansal ve Kurumsal Sağlamlık', 'Financial & Corporate Strength', 'Müşteri portföyü tek müşteriye aşırı bağımlı olmayacak şekilde dengeli mi?', 'Is the customer portfolio balanced without over-dependence on one customer?', 1],
  ['Finansal ve Kurumsal Sağlamlık', 'Financial & Corporate Strength', 'Etik / uyum (rüşvet, çocuk işçiliği, yaptırım) taahhütleri mevcut mu?', 'Are ethics/compliance commitments (bribery, child labour, sanctions) in place?', 2],
];

function seedReference(): void {
  const cat = db.prepare(
    `INSERT INTO categories (code, name_tr, name_en, hint_tr, hint_en, sort_order)
     VALUES (@code, @name_tr, @name_en, @hint_tr, @hint_en, @sort_order)
     ON CONFLICT(code) DO UPDATE SET
       name_tr = excluded.name_tr, name_en = excluded.name_en,
       hint_tr = excluded.hint_tr, hint_en = excluded.hint_en,
       sort_order = excluded.sort_order`,
  );
  CATEGORIES.forEach((c, i) => cat.run({ ...c, hint_tr: c.hint_tr ?? null, hint_en: c.hint_en ?? null, sort_order: i }));

  const cert = db.prepare(
    `INSERT INTO certifications (code, name, description_tr, description_en, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`,
  );
  CERTIFICATIONS.forEach((c, i) => cert.run(c.code, c.name, c.tr, c.en, i));

  const sec = db.prepare(
    `INSERT INTO sectors (code, name_tr, name_en, sort_order) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name_tr = excluded.name_tr, name_en = excluded.name_en`,
  );
  SECTORS.forEach(([code, tr, en], i) => sec.run(code, tr, en, i));

  // Denetim şablonu
  const existing = db.prepare('SELECT id FROM audit_templates WHERE code = ?').get('SUPPLIER_STD_V1') as
    | { id: number }
    | undefined;
  if (!existing) {
    const res = db
      .prepare('INSERT INTO audit_templates (code, name_tr, name_en) VALUES (?, ?, ?)')
      .run('SUPPLIER_STD_V1', 'Standart Tedarikçi Denetimi (v1)', 'Standard Supplier Audit (v1)');
    const item = db.prepare(
      `INSERT INTO audit_template_items (template_id, section_tr, section_en, question_tr, question_en, weight, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    AUDIT_ITEMS.forEach(([sTr, sEn, qTr, qEn, w], i) =>
      item.run(res.lastInsertRowid as number, sTr, sEn, qTr, qEn, w, i),
    );
  }

  setSetting('grade.threshold.A', '85');
  setSetting('grade.threshold.B', '70');
  setSetting('grade.threshold.C', '55');
  setSetting('org.name', 'Yanmar Türkiye Makine Sanayi A.Ş.');
  setSetting('org.short', 'Yanmar Türkiye');
  setSetting('sla.review_days', '10');
  setSetting('sla.audit_days', '30');
  setSetting('sla.ncr_response_days', '14');
  setSetting('contract.renewal_notice_days', '60');
}

function seedUsers(): void {
  const insert = db.prepare(
    `INSERT INTO users (email, password_hash, full_name, role, department, locale)
     VALUES (?, ?, ?, ?, ?, 'tr')
     ON CONFLICT(email) DO NOTHING`,
  );
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  insert.run(config.seedAdminEmail, hash(config.seedAdminPassword), 'Sistem Yöneticisi', 'ADMIN', 'BT');
  insert.run('satinalma@yanmar.com.tr', hash('Moderator123!'), 'Kamercan Beşikci', 'MODERATOR', 'Teknik Satınalma');
  insert.run('kalite@yanmar.com.tr', hash('Kalite123!'), 'Kalite Birimi Uzmanı', 'QUALITY', 'Kalite Güvence');
  insert.run('izleme@yanmar.com.tr', hash('Viewer123!'), 'Yönetim Raporlama', 'VIEWER', 'Yönetim');
}

type DemoApp = {
  company: string;
  tax: string;
  sector: string;
  city: string;
  country: string;
  contact: string;
  email: string;
  cats: string[];
  certs: string[];
  status: string;
  source: string;
  employees: string;
  revenue: string;
  year: number;
  about: string;
  refs: string;
  daysAgo: number;
};

const DEMO_APPS: DemoApp[] = [
  {
    company: 'Ege Hidrolik Sistemleri San. Tic. A.Ş.', tax: '4560071234', sector: 'makine', city: 'İzmir', country: 'tr',
    contact: 'Serkan Aydın', email: 'serkan.aydin@egehidrolik.com.tr', cats: ['hidrolik', 'kaucuk'],
    certs: ['iso9001', 'iso14001'], status: 'APPROVED', source: 'WEB_FORM', employees: '51-250', revenue: '10-50M',
    year: 1998, about: 'Hidrolik pompa, valf ve silindir üretimi. 12.000 m² kapalı alan, yıllık 180.000 adet kapasite.',
    refs: 'Hidromek, Çukurova Ziraat, Erkunt Traktör', daysAgo: 96,
  },
  {
    company: 'Anadolu Döküm Sanayi Ltd. Şti.', tax: '0710453322', sector: 'metalurji', city: 'Konya', country: 'tr',
    contact: 'Mehmet Yılmaz', email: 'm.yilmaz@anadoludokum.com', cats: ['dokum'], certs: ['iso9001', 'iatf'],
    status: 'APPROVED', source: 'EYDEP', employees: '251-1000', revenue: '50M+', year: 1987,
    about: 'Sfero ve kır döküm; motor bloğu, şanzıman gövdesi ve manifold üretimi. Yıllık 24.000 ton kapasite.',
    refs: 'Ford Otosan, TÜMOSAN, BMC', daysAgo: 120,
  },
  {
    company: 'Marmara Sac İşleme A.Ş.', tax: '6120887744', sector: 'otomotiv_yan', city: 'Kocaeli', country: 'tr',
    contact: 'Elif Demir', email: 'elif.demir@marmarasac.com.tr', cats: ['sac', 'islem'], certs: ['iso9001', 'iatf', 'iso45001'],
    status: 'AUDIT_PENDING', source: 'WEB_FORM', employees: '251-1000', revenue: '10-50M', year: 2004,
    about: 'Lazer kesim, pres, robotik kaynak hatları ve toz boya tesisi. 2.000 ton/ay sac işleme kapasitesi.',
    refs: 'Otokar, Karsan, Anadolu Isuzu', daysAgo: 18,
  },
  {
    company: 'Trakya Dişli ve Şanzıman San.', tax: '8340112255', sector: 'makine', city: 'Tekirdağ', country: 'tr',
    contact: 'Burak Şahin', email: 'burak@trakyadisli.com', cats: ['disli'], certs: ['iso9001'],
    status: 'AUDIT_PLANNED', source: 'LINKEDIN', employees: '51-250', revenue: '1-10M', year: 2011,
    about: 'Helisel ve düz dişli, planet grubu ve şanzıman alt montaj üretimi. CNC dişli açma ve taşlama parkuru.',
    refs: 'Hema Endüstri, Başak Traktör', daysAgo: 25,
  },
  {
    company: 'Bursa Kauçuk Hortum Ltd.', tax: '2230667788', sector: 'kaucuk_plastik', city: 'Bursa', country: 'tr',
    contact: 'Ayşe Kaya', email: 'ayse.kaya@bursakaucuk.com', cats: ['kaucuk'], certs: ['iso9001', 'iatf'],
    status: 'IN_REVIEW', source: 'TURKISHEXPORTER', employees: '51-250', revenue: '1-10M', year: 2009,
    about: 'Yakıt, hidrolik ve soğutma hortumları; rakor ve kelepçe montajlı komple hatlar.',
    refs: 'Tofaş, Valeo, Mako', daysAgo: 6,
  },
  {
    company: 'Sofia Precision Casting EOOD', tax: 'BG203445566', sector: 'metalurji', city: 'Sofia', country: 'bg',
    contact: 'Ivan Petrov', email: 'i.petrov@sofiacasting.bg', cats: ['dokum', 'islem'], certs: ['iso9001', 'iso14001'],
    status: 'NEW', source: 'WEB_FORM', employees: '51-250', revenue: '10-50M', year: 1995,
    about: 'Investment casting and machining for agricultural and construction equipment.',
    refs: 'Caterpillar Bulgaria, Liebherr', daysAgo: 2,
  },
  {
    company: 'Ankara Termal Yalıtım Teknolojileri', tax: '0061223344', sector: 'makine', city: 'Ankara', country: 'tr',
    contact: 'Deniz Öztürk', email: 'deniz@ankaratermal.com.tr', cats: ['izolasyon'], certs: ['iso9001'],
    status: 'NEW', source: 'WEB_FORM', employees: '1-50', revenue: '<1M', year: 2016,
    about: 'Egzoz manifold ceketleri, motor akustik panelleri ve ısı yalıtım battaniyeleri.',
    refs: 'TÜMOSAN, Nurol Makina', daysAgo: 1,
  },
  {
    company: 'Gebze Kablo Donanım San. Tic.', tax: '3890554411', sector: 'elektronik', city: 'Kocaeli', country: 'tr',
    contact: 'Hakan Arslan', email: 'hakan.arslan@gebzekablo.com', cats: ['elektrik'], certs: ['iso9001', 'iatf'],
    status: 'NEEDS_INFO', source: 'EMAIL', employees: '51-250', revenue: '1-10M', year: 2013,
    about: 'Kablo demeti, sensör kablajı ve gösterge paneli montajı.',
    refs: 'Ford Otosan, Türk Traktör', daysAgo: 12,
  },
  {
    company: 'Adana Endüstriyel Kimya A.Ş.', tax: '0140998877', sector: 'kimya', city: 'Adana', country: 'tr',
    contact: 'Zeynep Aksoy', email: 'z.aksoy@adanakimya.com.tr', cats: ['kimyasal'], certs: ['iso9001', 'iso14001', 'iso45001'],
    status: 'REJECTED', source: 'WEB_FORM', employees: '51-250', revenue: '1-10M', year: 2007,
    about: 'Endüstriyel yağ, gres ve sızdırmazlık ürünleri üretimi.',
    refs: 'Petrol Ofisi, Opet', daysAgo: 45,
  },
  {
    company: 'Bucharest Hydraulic Components SRL', tax: 'RO40556677', sector: 'makine', city: 'Bucharest', country: 'ro',
    contact: 'Andrei Ionescu', email: 'andrei@bhc-ro.com', cats: ['hidrolik', 'disli'], certs: ['iso9001'],
    status: 'ON_HOLD', source: 'LINKEDIN', employees: '1-50', revenue: '1-10M', year: 2018,
    about: 'Hydraulic manifolds and control valve blocks, CNC machining.',
    refs: 'Bosch Rexroth RO', daysAgo: 60,
  },
  {
    company: 'Manisa Pres ve Kalıp Sanayi', tax: '4530221199', sector: 'otomotiv_yan', city: 'Manisa', country: 'tr',
    contact: 'Okan Çelik', email: 'okan.celik@manisapres.com', cats: ['sac'], certs: ['iso9001'],
    status: 'AUDIT_DONE', source: 'WEB_FORM', employees: '51-250', revenue: '1-10M', year: 2002,
    about: 'Progresif kalıp tasarımı, pres hatları ve kaynaklı montaj grupları.',
    refs: 'Vestel, Klimasan', daysAgo: 70,
  },
  {
    company: 'İzmir Yüzey İşlem Merkezi', tax: '4560334477', sector: 'makine', city: 'İzmir', country: 'tr',
    contact: 'Cem Bulut', email: 'cem@izmiryuzey.com.tr', cats: ['islem'], certs: ['iso9001', 'iso14001'],
    status: 'APPROVED', source: 'REFERRAL', employees: '1-50', revenue: '1-10M', year: 2010,
    about: 'Elektrostatik toz boya, KTL kaplama, fosfatlama ve ısıl işlem hizmetleri.',
    refs: 'Ege Hidrolik, Manisa Pres', daysAgo: 150,
  },
];

function seedDemo(): void {
  const already = db.prepare('SELECT COUNT(*) AS c FROM applications').get() as { c: number };
  if (already.c > 0) {
    console.log('· Demo veriler zaten mevcut, atlanıyor.');
    return;
  }

  const moderator = db.prepare("SELECT id FROM users WHERE role = 'MODERATOR'").get() as { id: number };
  const quality = db.prepare("SELECT id FROM users WHERE role = 'QUALITY'").get() as { id: number };
  const template = db.prepare('SELECT id FROM audit_templates WHERE code = ?').get('SUPPLIER_STD_V1') as { id: number };
  const items = db
    .prepare('SELECT id, weight FROM audit_template_items WHERE template_id = ?')
    .all(template.id) as Array<{ id: number; weight: number }>;

  const insertApp = db.prepare(`
    INSERT INTO applications (
      ref_no, company_name, company_key, tax_id, founded_year, employee_band, revenue_band, website,
      sector, contact_name, contact_position, email, phone, country, city, references_text, about,
      kvkk_consent, consent_version, consent_at, status, source, completeness, assigned_to,
      created_at, updated_at
    ) VALUES (
      @ref_no, @company_name, @company_key, @tax_id, @founded_year, @employee_band, @revenue_band, @website,
      @sector, @contact_name, @contact_position, @email, @phone, @country, @city, @references_text, @about,
      1, 'KVKK-2026-01', @created_at, @status, @source, @completeness, @assigned_to,
      @created_at, @created_at
    )`);
  const insertCat = db.prepare('INSERT INTO application_categories (application_id, category_code) VALUES (?, ?)');
  const insertCert = db.prepare('INSERT INTO application_certifications (application_id, cert_code) VALUES (?, ?)');
  const insertLog = db.prepare(
    `INSERT INTO activity_log (entity_type, entity_id, action, actor_label, to_value, created_at)
     VALUES ('APPLICATION', ?, ?, ?, ?, ?)`,
  );

  DEMO_APPS.forEach((d, idx) => {
    const createdAt = new Date(Date.now() - d.daysAgo * 86400_000).toISOString().replace('T', ' ').slice(0, 19);
    const payload = {
      ref_no: nextRefNo(new Date(createdAt.replace(' ', 'T') + 'Z')),
      company_name: d.company,
      company_key: normalizeCompany(d.company),
      tax_id: d.tax,
      founded_year: d.year,
      employee_band: d.employees,
      revenue_band: d.revenue,
      website: `https://www.${d.email.split('@')[1]}`,
      sector: d.sector,
      contact_name: d.contact,
      contact_position: 'Satış Müdürü',
      email: d.email,
      phone: `+90 5${(30 + idx).toString().padStart(2, '0')} ${100 + idx} ${20 + idx} ${10 + idx}`,
      country: d.country,
      city: d.city,
      references_text: d.refs,
      about: d.about,
      status: d.status,
      source: d.source,
      completeness: 0,
      assigned_to: ['NEW'].includes(d.status) ? null : moderator.id,
      created_at: createdAt,
    };
    payload.completeness = computeCompleteness(
      { ...payload, category_other: null, sector_other: null, country_other: null, address: null } as never,
      d.cats,
      d.certs,
      0,
    );

    const res = insertApp.run(payload);
    const appId = res.lastInsertRowid as number;
    d.cats.forEach((c) => insertCat.run(appId, c));
    d.certs.forEach((c) => insertCert.run(appId, c));
    insertLog.run(appId, 'CREATED', d.company, d.status, createdAt);

    // Kalite denetimi gereken durumlar için denetim kaydı + görev üret
    if (['AUDIT_PENDING', 'AUDIT_PLANNED', 'AUDIT_DONE', 'APPROVED'].includes(d.status)) {
      const auditNo = `DNT-${new Date(createdAt).getFullYear()}-${String(1000 + appId).slice(1)}`;
      const auditStatus =
        d.status === 'AUDIT_PENDING' ? 'PENDING' : d.status === 'AUDIT_PLANNED' ? 'PLANNED' : 'COMPLETED';
      const completed = auditStatus === 'COMPLETED';
      const score = completed ? (d.status === 'APPROVED' ? 88.4 : 72.6) : null;
      const grade = completed ? (d.status === 'APPROVED' ? 'A' : 'B') : null;

      const aRes = db
        .prepare(
          `INSERT INTO audits (audit_no, application_id, template_id, type, status, auditor_id, planned_date,
                               completed_at, method, score, grade, strengths, findings, recommendation, created_at, updated_at)
           VALUES (?, ?, ?, 'INITIAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          auditNo, appId, template.id, auditStatus, completed || auditStatus === 'PLANNED' ? quality.id : null,
          new Date(Date.now() + (completed ? -20 : 12) * 86400_000).toISOString().slice(0, 10),
          completed ? createdAt : null,
          completed ? 'ONSITE' : null,
          score, grade,
          completed ? 'Güçlü makine parkuru, deneyimli teknik kadro, düzenli iç denetim uygulaması.' : null,
          completed ? 'Kalibrasyon kayıtlarının bir kısmı güncel değil; MSA çalışmaları eksik.' : null,
          completed ? (d.status === 'APPROVED' ? 'APPROVE' : 'APPROVE_WITH_CONDITIONS') : null,
          createdAt, createdAt,
        );

      if (completed) {
        const insertScore = db.prepare('INSERT INTO audit_scores (audit_id, item_id, score) VALUES (?, ?, ?)');
        items.forEach((it, i) =>
          insertScore.run(aRes.lastInsertRowid as number, it.id, d.status === 'APPROVED' ? 80 + ((i * 7) % 21) : 60 + ((i * 5) % 25)),
        );
      } else {
        db.prepare(
          `INSERT INTO tasks (type, title, description, entity_type, entity_id, assigned_role, assigned_to, status, priority, due_date, created_at)
           VALUES ('PERFORM_AUDIT', ?, ?, 'AUDIT', ?, 'QUALITY', ?, ?, 'NORMAL', ?, ?)`,
        ).run(
          `Tedarikçi denetimi: ${d.company}`,
          'Moderatör onayı sonrası kalite denetimi bekleniyor.',
          aRes.lastInsertRowid as number,
          auditStatus === 'PLANNED' ? quality.id : null,
          auditStatus === 'PLANNED' ? 'IN_PROGRESS' : 'OPEN',
          new Date(Date.now() + 12 * 86400_000).toISOString().slice(0, 10),
          createdAt,
        );
      }
    }

    // Onaylı tedarikçi havuzu
    if (d.status === 'APPROVED') {
      const sRes = db
        .prepare(
          `INSERT INTO suppliers (supplier_code, application_id, company_name, tax_id, country, city, website,
                                  contact_name, email, phone, grade, status, approved_at, next_audit_due, otd_percent, ppm, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'A', 'APPROVED', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `TED-${String(appId).padStart(4, '0')}`, appId, d.company, d.tax, d.country, d.city,
          `https://www.${d.email.split('@')[1]}`, d.contact, d.email, payload.phone, createdAt,
          new Date(Date.now() + 300 * 86400_000).toISOString().slice(0, 10),
          95 + (idx % 5), 120 + idx * 10, createdAt, createdAt,
        );
      const supplierId = sRes.lastInsertRowid as number;
      d.cats.forEach((c) =>
        db.prepare('INSERT INTO supplier_categories (supplier_id, category_code) VALUES (?, ?)').run(supplierId, c),
      );
      db.prepare('UPDATE audits SET supplier_id = ? WHERE application_id = ?').run(supplierId, appId);

      // Faz 4 örnek verisi
      db.prepare(
        `INSERT INTO contracts (contract_no, supplier_id, title, type, status, start_date, end_date, currency, value, owner_id, signed_at, created_at, updated_at)
         VALUES (?, ?, ?, 'NDA', 'ACTIVE', ?, ?, 'EUR', NULL, ?, ?, ?, ?)`,
      ).run(
        `SZL-${String(2000 + supplierId).slice(1)}-NDA`, supplierId, 'Gizlilik Sözleşmesi (NDA)',
        createdAt.slice(0, 10), new Date(Date.now() + 400 * 86400_000).toISOString().slice(0, 10),
        moderator.id, createdAt.slice(0, 10), createdAt, createdAt,
      );
      db.prepare(
        `INSERT INTO contracts (contract_no, supplier_id, title, type, status, start_date, end_date, currency, value, renewal_notice_days, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, 'FRAMEWORK', 'ACTIVE', ?, ?, 'EUR', ?, 60, ?, ?, ?)`,
      ).run(
        `SZL-${String(2000 + supplierId).slice(1)}-CER`, supplierId, 'Çerçeve Tedarik Sözleşmesi',
        createdAt.slice(0, 10), new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10),
        850000 + idx * 25000, moderator.id, createdAt, createdAt,
      );
    }
  });

  // Örnek uygunsuzluk raporu
  const firstSupplier = db.prepare('SELECT id, company_name FROM suppliers ORDER BY id LIMIT 1').get() as
    | { id: number; company_name: string }
    | undefined;
  if (firstSupplier) {
    const ncr = db
      .prepare(
        `INSERT INTO ncrs (ncr_no, supplier_id, title, category, severity, description, part_no, qty_affected,
                           detected_at, due_date, status, opened_by, created_at, updated_at)
         VALUES (?, ?, ?, 'PRODUCT', 'MAJOR', ?, ?, ?, ?, ?, 'OPEN', ?, datetime('now','-9 days'), datetime('now','-9 days'))`,
      )
      .run(
        `NCR-${new Date().getFullYear()}-0001`, firstSupplier.id,
        'Hidrolik silindir mil yüzeyinde çizik tespiti',
        'Gelen kalite kontrolde 40 adetlik partide 7 adet üründe mil yüzeyinde derin çizik tespit edilmiştir. Montaj hattında sızdırmazlık riski oluşturmaktadır.',
        'HYD-CYL-80-450', 7,
        new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10),
        new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10),
        moderator.id,
      );
    db.prepare(
      `INSERT INTO tasks (type, title, description, entity_type, entity_id, assigned_role, status, priority, due_date, created_at)
       VALUES ('REVIEW_NCR_RESPONSE', ?, ?, 'NCR', ?, 'QUALITY', 'OPEN', 'HIGH', ?, datetime('now','-9 days'))`,
    ).run(
      `Uygunsuzluk takibi: ${firstSupplier.company_name}`,
      'Tedarikçinin 8D cevabı bekleniyor.',
      ncr.lastInsertRowid as number,
      new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10),
    );
  }

  // Moderatör kuyruğundaki bekleyen başvurular için görev üret
  const pendingReview = db
    .prepare("SELECT id, company_name FROM applications WHERE status IN ('NEW','NEEDS_INFO')")
    .all() as Array<{ id: number; company_name: string }>;
  const taskIns = db.prepare(
    `INSERT INTO tasks (type, title, description, entity_type, entity_id, assigned_role, status, priority, due_date)
     VALUES ('REVIEW_APPLICATION', ?, ?, 'APPLICATION', ?, 'MODERATOR', 'OPEN', 'NORMAL', ?)`,
  );
  pendingReview.forEach((a) =>
    taskIns.run(
      `Başvuru değerlendirmesi: ${a.company_name}`,
      'Yeni tedarikçi başvurusu ön değerlendirme bekliyor.',
      a.id,
      new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10),
    ),
  );
}

function main(): void {
  migrate();
  seedReference();
  seedUsers();
  if (!process.argv.includes('--no-demo')) seedDemo();

  const counts = {
    users: (db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c,
    applications: (db.prepare('SELECT COUNT(*) c FROM applications').get() as { c: number }).c,
    suppliers: (db.prepare('SELECT COUNT(*) c FROM suppliers').get() as { c: number }).c,
    tasks: (db.prepare('SELECT COUNT(*) c FROM tasks').get() as { c: number }).c,
  };
  console.log('✓ Veritabanı hazır:', counts);
  console.log(`  Giriş: ${config.seedAdminEmail} / ${config.seedAdminPassword}`);
}

main();
