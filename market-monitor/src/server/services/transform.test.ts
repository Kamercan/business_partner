import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyTransform, convertCurrency, summarize } from './transform.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { parseCsvObjects, toCsv } from '../lib/csv.js';

const monthly = [
  { period: '2023-01-01', value: 100 },
  { period: '2023-07-01', value: 110 },
  { period: '2024-01-01', value: 150 },
  { period: '2024-07-01', value: 165 },
];

test('yoy aylık seride tam bir yıl öncesini kullanır', () => {
  const out = applyTransform(monthly, 'yoy', 'monthly');
  assert.deepEqual(out.map((o) => o.period), ['2024-01-01', '2024-07-01']);
  assert.equal(Math.round(out[0]!.value), 50);
  assert.equal(Math.round(out[1]!.value), 50);
});

test('yoy bir yıl öncesi eksikse o noktayı üretmez', () => {
  const gappy = [
    { period: '2023-01-01', value: 100 },
    { period: '2024-03-01', value: 150 },
  ];
  assert.equal(applyTransform(gappy, 'yoy', 'monthly').length, 0);
});

test('günlük seride yoy en yakın önceki gözlemi 45 gün toleransla bulur', () => {
  const daily = [
    { period: '2023-03-10', value: 20 },
    { period: '2024-03-11', value: 25 },
  ];
  const out = applyTransform(daily, 'yoy', 'daily');
  assert.equal(out.length, 1);
  assert.equal(Math.round(out[0]!.value), 25);
});

test('index dönüşümü ilk gözlemi 100 yapar', () => {
  const out = applyTransform(monthly, 'index', 'monthly');
  assert.equal(out[0]!.value, 100);
  assert.equal(out[2]!.value, 150);
});

test('cumulative birikimli yüzde değişim verir', () => {
  const out = applyTransform(monthly, 'cumulative', 'monthly');
  assert.equal(out[0]!.value, 0);
  assert.equal(out[3]!.value, 65);
});

test('para birimi çevrimi kuru dönemine göre taşır', () => {
  const fx = {
    usdTry: [{ period: '2024-01-01', value: 30 }, { period: '2024-07-01', value: 33 }],
    eurTry: [{ period: '2024-01-01', value: 33 }, { period: '2024-07-01', value: 36 }],
  };
  const usd = [{ period: '2024-03-15', value: 100 }, { period: '2024-08-01', value: 100 }];
  const res = convertCurrency(usd, 'USD', 'TRY', fx);
  assert.equal(res.ok, true);
  assert.equal(res.observations[0]!.value, 3000); // Mart → Ocak kuru taşındı
  assert.equal(res.observations[1]!.value, 3300); // Ağustos → Temmuz kuru
});

test('desteklenmeyen para biriminde çevrim sessizce bozulmaz', () => {
  const res = convertCurrency([{ period: '2024-01-01', value: 5 }], 'GBP', 'TRY', { usdTry: [], eurTry: [] });
  assert.equal(res.ok, false);
  assert.match(res.reason ?? '', /kur verisi yok/);
});

test('summarize son değer ve yıllık değişimi verir', () => {
  const s = summarize(monthly, 'monthly');
  assert.equal(s.last?.value, 165);
  assert.equal(Math.round(s.yoyPct ?? 0), 50);
});

test('dönem biçimleri tek biçime indirgenir', () => {
  assert.equal(normalizePeriod('2024', 'annual'), '2024-01-01');
  assert.equal(normalizePeriod('2024M05', 'monthly'), '2024-05-01');
  assert.equal(normalizePeriod('2024-Q3', 'quarterly'), '2024-07-01');
  assert.equal(normalizePeriod('2024S2', 'semiannual'), '2024-07-01');
  assert.equal(normalizePeriod('13-05-2024', 'daily'), '2024-05-13');
  assert.equal(normalizePeriod('05-2024', 'monthly'), '2024-05-01');
});

test('sayı ayrıştırma TR ve EN biçimlerini ayırır', () => {
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('1,234.56'), 1234.56);
  assert.equal(parseNumber('.'), null);
  assert.equal(parseNumber(':'), null);
});

test('CSV ayrıştırıcı tırnak içi virgülü korur', () => {
  const rows = parseCsvObjects('donem,deger,kaynak\n2024,17002,"Resmî Gazete, 30.12.2023"');
  assert.equal(rows[0]!['kaynak'], 'Resmî Gazete, 30.12.2023');
  assert.equal(toCsv(['a'], [['x,y']]), 'a\n"x,y"');
});
