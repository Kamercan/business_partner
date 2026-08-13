import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

/**
 * Sıra numarası üreticisinin regresyon testi.
 *
 * Geçmişte üretici en büyük numarayı **metin sıralamasıyla** buluyordu. Demo
 * verideki "NCR-2026-0001" (4 hane) ile üretilen "NCR-2026-00002" (5 hane)
 * karıştığında metinsel en büyük yanlış çıkıyor, üretici aynı numarayı tekrar
 * üretiyor ve UNIQUE kısıtına takılıyordu: ilk kayıttan sonra hiçbir yeni
 * uygunsuzluk/denetim/sözleşme açılamıyordu.
 */
// Test kendi geçici veritabanını kullanır. `.env` içindeki DB_FILE öncelikli
// olduğu için o da burada geçersiz kılınır; aksi halde geliştirme veritabanına
// yazılırdı.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ids-'));
process.env.DATA_DIR = dir;
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.STORAGE_DIR = path.join(dir, 'storage');
process.env.JWT_SECRET = 'x'.repeat(32);

const { db } = await import('../db/index.js');
const { nextNcrNo } = await import('./ids.js');

describe('sıra numarası üreticisi', () => {
  before(() => {
    db.exec('CREATE TABLE IF NOT EXISTS ncrs (id INTEGER PRIMARY KEY, ncr_no TEXT NOT NULL UNIQUE)');
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('boş tabloda 1 numaradan başlar', () => {
    assert.equal(nextNcrNo(new Date('2026-03-01T00:00:00Z')), 'NCR-2026-00001');
  });

  it('farklı dolgu uzunlukları karışsa da sayısal en büyüğü bulur', () => {
    // Demo verisi kısa dolgulu, üretilenler 5 hane — eski hata tam buradaydı.
    db.prepare('INSERT INTO ncrs (ncr_no) VALUES (?)').run('NCR-2026-0001');
    db.prepare('INSERT INTO ncrs (ncr_no) VALUES (?)').run('NCR-2026-00002');
    assert.equal(nextNcrNo(new Date('2026-03-01T00:00:00Z')), 'NCR-2026-00003');
  });

  it('ardışık çağrılarda numara tekrar etmez', () => {
    const insert = db.prepare('INSERT INTO ncrs (ncr_no) VALUES (?)');
    const produced: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const no = nextNcrNo(new Date('2026-03-01T00:00:00Z'));
      insert.run(no); // UNIQUE kısıtı çakışmada testi düşürür
      produced.push(no);
    }
    assert.equal(new Set(produced).size, produced.length);
    assert.equal(produced.at(-1), 'NCR-2026-00014');
  });

  it('yıl değişince sayaç sıfırlanır', () => {
    assert.equal(nextNcrNo(new Date('2027-01-05T00:00:00Z')), 'NCR-2027-00001');
  });
});
