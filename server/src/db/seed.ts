/**
 * Veritabanını elle kurmak / doldurmak için komut satırı aracı.
 *
 *   npm run db:seed                 -> şema + referans veriler + admin (+ demo)
 *   SEED_DEMO=false npm run db:seed -> demo kayıtlar olmadan
 *
 * Not: Sunucu ilk açılışta aynı kurulumu kendiliğinden yapar; bu komut
 * yalnızca yerel geliştirme ve elle müdahale için gereklidir.
 */
import { config } from '../config.js';
import { db } from './index.js';
import { bootstrapDatabase } from './bootstrap.js';

bootstrapDatabase();

const count = (table: string) => (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c;

console.log('✓ Veritabanı hazır:', {
  users: count('users'),
  applications: count('applications'),
  suppliers: count('suppliers'),
  tasks: count('tasks'),
});
console.log(`  Demo modu: ${config.demoMode ? 'açık' : 'kapalı'}`);
