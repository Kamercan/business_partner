import { db } from '../db/index.js';

export type EntityType = 'APPLICATION' | 'SUPPLIER' | 'AUDIT' | 'CONTRACT' | 'NCR' | 'USER' | 'SYSTEM';

export type Actor = { id: number | null; label: string };

/**
 * Denetim izi kaydı. ISO 9001 / IATF 16949 uyumu için her durum değişikliği
 * ve kritik işlem burada saklanır; kayıtlar hiçbir arayüzden silinemez.
 */
export function logActivity(params: {
  entityType: EntityType;
  entityId: number;
  action: string;
  actor: Actor;
  from?: string | null;
  to?: string | null;
  detail?: string | null;
}): void {
  db.prepare(
    `INSERT INTO activity_log (entity_type, entity_id, action, actor_id, actor_label, from_value, to_value, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.entityType,
    params.entityId,
    params.action,
    params.actor.id,
    params.actor.label,
    params.from ?? null,
    params.to ?? null,
    params.detail ?? null,
  );
}

export function getActivity(entityType: EntityType, entityId: number, limit = 200) {
  return db
    .prepare(
      `SELECT id, action, actor_label, from_value, to_value, detail, created_at
         FROM activity_log
        WHERE entity_type = ? AND entity_id = ?
        ORDER BY id DESC
        LIMIT ?`,
    )
    .all(entityType, entityId, limit);
}
