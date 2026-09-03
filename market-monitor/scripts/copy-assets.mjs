import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/server/db', { recursive: true });
cpSync('src/server/db/schema.sql', 'dist/server/db/schema.sql');
cpSync('seed', 'dist/seed', { recursive: true });
