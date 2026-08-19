import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkTaxNumber, isValidTCKN, isValidVKN } from './tax.js';

/** Verilen 9 haneli önek için geçerli VKN sağlama rakamını kaba kuvvetle bulur. */
function completeVKN(prefix9: string): string {
  for (let c = 0; c <= 9; c += 1) {
    const candidate = `${prefix9}${c}`;
    if (isValidVKN(candidate)) return candidate;
  }
  throw new Error(`önek için geçerli sağlama rakamı yok: ${prefix9}`);
}

/** Verilen 9 haneli önek için geçerli TCKN'yi üretir. */
function completeTCKN(prefix9: string): string {
  const d = [...prefix9].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = ((odd * 7 - even) % 10 + 10) % 10;
  const eleventh = (d.reduce((a, b) => a + b, 0) + tenth) % 10;
  return `${prefix9}${tenth}${eleventh}`;
}

describe('VKN (10 hane)', () => {
  it('her 9 haneli önek için tam olarak bir geçerli sağlama rakamı vardır', () => {
    // Sağlama rakamının tekilliği, algoritmanın doğru kurulduğunun göstergesidir.
    for (const prefix of ['123456789', '987654321', '100000000', '555555555', '294857361']) {
      const valid = [...'0123456789'].filter((c) => isValidVKN(`${prefix}${c}`));
      assert.equal(valid.length, 1, `${prefix} için geçerli rakam sayısı ${valid.length}`);
    }
  });

  it('üretilen numaraları kabul eder', () => {
    for (const prefix of ['123456789', '491038276', '800000001']) {
      assert.equal(isValidVKN(completeVKN(prefix)), true);
    }
  });

  it('tek hane değişince reddeder', () => {
    const valid = completeVKN('123456789');
    const broken = `${valid.slice(0, 4)}${(Number(valid[4]) + 1) % 10}${valid.slice(5)}`;
    assert.notEqual(valid, broken);
    assert.equal(isValidVKN(broken), false);
  });

  it('uzunluk ve karakter kontrolü yapar', () => {
    assert.equal(isValidVKN('123'), false);
    assert.equal(isValidVKN('12345678901'), false);
    assert.equal(isValidVKN('12345678a0'), false);
    assert.equal(isValidVKN(''), false);
  });
});

describe('TCKN (11 hane)', () => {
  it('üretilen numaraları kabul eder', () => {
    for (const prefix of ['123456789', '287654321', '100000000']) {
      assert.equal(isValidTCKN(completeTCKN(prefix)), true);
    }
  });

  it('sıfırla başlayamaz', () => {
    const valid = completeTCKN('123456789');
    assert.equal(isValidTCKN(`0${valid.slice(1)}`), false);
  });

  it('tek hane değişince reddeder', () => {
    const valid = completeTCKN('123456789');
    const broken = `${valid.slice(0, 2)}${(Number(valid[2]) + 1) % 10}${valid.slice(3)}`;
    assert.equal(isValidTCKN(broken), false);
  });

  it('rastgele 11 haneli sayıların çok azını kabul eder', () => {
    let accepted = 0;
    for (let i = 0; i < 2000; i += 1) {
      const n = String(10_000_000_000 + Math.floor(Math.random() * 89_999_999_999));
      if (isValidTCKN(n)) accepted += 1;
    }
    // Beklenen oran ~1/100; %3'ün üzerine çıkarsa sağlama çalışmıyordur.
    assert.ok(accepted / 2000 < 0.03, `kabul oranı yüksek: ${accepted}/2000`);
  });
});

describe('ülkeye göre kontrol', () => {
  it("Türkiye'de geçerli VKN ve TCKN kabul edilir", () => {
    assert.deepEqual(checkTaxNumber(completeVKN('123456789'), 'tr'), { ok: true });
    assert.deepEqual(checkTaxNumber(completeTCKN('123456789'), 'tr'), { ok: true });
  });

  it("Türkiye'de yanlış sağlama reddedilir", () => {
    // '1234567890' aslında geçerli bir VKN'dir; son haneyi bozarak geçersiz yapıyoruz.
    const valid = completeVKN('123456789');
    const broken = `${valid.slice(0, 9)}${(Number(valid[9]) + 1) % 10}`;
    assert.deepEqual(checkTaxNumber(broken, 'tr'), { ok: false, reason: 'checksum' });
  });

  it("Türkiye'de hane sayısı tutmuyorsa biçim hatası verir", () => {
    assert.deepEqual(checkTaxNumber('12345', 'tr'), { ok: false, reason: 'format' });
    assert.deepEqual(checkTaxNumber('ABC1234567', 'tr'), { ok: false, reason: 'format' });
  });

  it('boşluk ve tire yok sayılır', () => {
    const vkn = completeVKN('123456789');
    const spaced = `${vkn.slice(0, 3)} ${vkn.slice(3, 6)}-${vkn.slice(6)}`;
    assert.deepEqual(checkTaxNumber(spaced, 'tr'), { ok: true });
  });

  it('yurt dışında biçim kontrolüyle yetinilir', () => {
    assert.deepEqual(checkTaxNumber('DE123456789', 'de'), { ok: true });
    assert.deepEqual(checkTaxNumber('123456789', 'other'), { ok: true });
    assert.deepEqual(checkTaxNumber('12', 'other'), { ok: false, reason: 'format' });
    assert.deepEqual(checkTaxNumber('!!', 'jp'), { ok: false, reason: 'format' });
  });
});
