import type { Connector } from './types.js';
import { worldbank } from './worldbank.js';
import { imf } from './imf.js';
import { eurostat } from './eurostat.js';
import { fred } from './fred.js';
import { eia } from './eia.js';
import { evds } from './evds.js';
import { tcmbKur } from './tcmbKur.js';
import { epias } from './epias.js';
import { seed } from './seed.js';
import { manual } from './manual.js';
import { csvUrl } from './csvUrl.js';

export const CONNECTORS: Record<string, Connector> = {
  worldbank: worldbank,
  imf: imf,
  eurostat: eurostat,
  fred: fred,
  eia: eia,
  evds: evds,
  tcmb_kur: tcmbKur,
  epias: epias,
  seed: seed,
  manual: manual,
  csvurl: csvUrl,
};

export function connectorFor(id: string): Connector {
  const c = CONNECTORS[id];
  if (!c) throw new Error(`Bilinmeyen bağlayıcı: ${id}`);
  return c;
}

export type { Connector, FetchContext } from './types.js';
