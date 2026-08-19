import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APPLICATION_STATUSES,
  REQUIRED_DOCUMENT_KINDS,
  STATUS_ROLES,
  STATUS_TRANSITIONS,
  type ApplicationStatus,
} from './constants.js';

/**
 * Satınalma ile kalite biriminin sorumlulukları ayrıdır. Durum makinesi ile
 * rol matrisi elle tutulan iki tablo olduğu için, biri değiştiğinde diğerinin
 * unutulması en olası hatadır; aşağıdaki testler o boşluğu kapatır.
 */
describe('durum makinesi ile rol matrisi tutarlı', () => {
  it('her durumun bir sahibi vardır', () => {
    for (const status of APPLICATION_STATUSES) {
      const roles = STATUS_ROLES[status];
      assert.ok(roles && roles.length > 0, `${status} için sorumlu birim tanımlı değil`);
    }
  });

  it('rol matrisi ile durum listesi birebir örtüşür', () => {
    assert.deepEqual(Object.keys(STATUS_ROLES).sort(), [...APPLICATION_STATUSES].sort());
    assert.deepEqual(Object.keys(STATUS_TRANSITIONS).sort(), [...APPLICATION_STATUSES].sort());
  });

  it('hiçbir durum iki birimin ortak kararı değildir', () => {
    // İki birim aynı kararı verebiliyorsa "birbirinin alanını değiştirmesin"
    // kuralı delinmiş olur.
    for (const status of APPLICATION_STATUSES) {
      const roles = STATUS_ROLES[status];
      assert.equal(roles.length, 1, `${status} için birden fazla birim yetkili: ${roles.join(', ')}`);
      assert.ok(['MODERATOR', 'QUALITY'].includes(roles[0]), `${status} için beklenmeyen birim: ${roles[0]}`);
    }
  });

  it('satınalma ve kalite kararları beklenen aşamalara ayrılmıştır', () => {
    const owner = (s: ApplicationStatus) => STATUS_ROLES[s][0];
    // Kaliteye gönderme ve onaylı tedarikçi yapma satınalmanın kararıdır.
    assert.equal(owner('AUDIT_PENDING'), 'MODERATOR');
    assert.equal(owner('APPROVED'), 'MODERATOR');
    assert.equal(owner('REJECTED'), 'MODERATOR');
    // Denetimin yürütülmesi kalitenindir.
    assert.equal(owner('AUDIT_PLANNED'), 'QUALITY');
    assert.equal(owner('AUDIT_IN_PROGRESS'), 'QUALITY');
    assert.equal(owner('AUDIT_DONE'), 'QUALITY');
  });

  it('geçişlerin hedefi her zaman geçerli bir durumdur', () => {
    for (const [from, targets] of Object.entries(STATUS_TRANSITIONS)) {
      for (const to of targets) {
        assert.ok(APPLICATION_STATUSES.includes(to), `${from} → ${to}: tanımsız durum`);
        assert.notEqual(from, to, `${from} kendine geçiş içeremez`);
      }
    }
  });

  it('her durum başlangıçtan erişilebilir', () => {
    // Ulaşılamayan bir durum, kullanıcıya asla görünmeyecek ölü koddur.
    const seen = new Set<ApplicationStatus>(['NEW']);
    const queue: ApplicationStatus[] = ['NEW'];
    while (queue.length) {
      for (const next of STATUS_TRANSITIONS[queue.shift()!]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const status of APPLICATION_STATUSES) {
      assert.ok(seen.has(status), `${status} durumuna hiçbir yoldan ulaşılamıyor`);
    }
  });
});

describe('zorunlu belgeler', () => {
  it('boş değildir ve tekrar içermez', () => {
    assert.ok(REQUIRED_DOCUMENT_KINDS.length > 0);
    assert.equal(new Set(REQUIRED_DOCUMENT_KINDS).size, REQUIRED_DOCUMENT_KINDS.length);
  });
});
