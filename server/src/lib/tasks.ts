import { db } from '../db/index.js';
import type { Role } from './constants.js';

export type TaskType =
  | 'REVIEW_APPLICATION'
  | 'PERFORM_AUDIT'
  | 'REVIEW_NCR_RESPONSE'
  | 'CONTRACT_RENEWAL'
  | 'SUPPLIER_INFO_REQUEST'
  | 'REVIEW_DOCUMENT';

/**
 * İş sırası üretir. Faz 3'ün çekirdeği: moderatör bir başvuruyu onayladığında
 * kalite biriminin ekranına düşen "denetim bekliyor" görevi buradan doğar.
 * Aynı varlık için açık bir görev varsa yenisi üretilmez.
 */
export function createTask(params: {
  type: TaskType;
  /** Türkçe başlık — dışa aktarım ve eski kayıtlarla uyum için saklanır. */
  title: string;
  description?: string | null;
  /**
   * Başlığın veri kısmı (genellikle firma adı). Arayüz başlığı
   * "<görev türü seçili dilde>: <subject>" olarak kurar.
   */
  subject?: string | null;
  /** Açıklamanın çeviri anahtarı ve yerine konacak değerler. */
  detailKey?: string | null;
  detailParams?: Record<string, string | number> | null;
  entityType: 'APPLICATION' | 'SUPPLIER' | 'AUDIT' | 'CONTRACT' | 'NCR';
  entityId: number;
  assignedRole: Role;
  assignedTo?: number | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  dueInDays?: number;
  createdBy?: number | null;
}): number | null {
  const existing = db
    .prepare(
      `SELECT id FROM tasks
        WHERE type = ? AND entity_type = ? AND entity_id = ? AND status IN ('OPEN','IN_PROGRESS')`,
    )
    .get(params.type, params.entityType, params.entityId) as { id: number } | undefined;
  if (existing) return existing.id;

  const dueDate =
    params.dueInDays === undefined
      ? null
      : new Date(Date.now() + params.dueInDays * 86400_000).toISOString().slice(0, 10);

  const res = db
    .prepare(
      `INSERT INTO tasks (type, title, description, subject, detail_key, detail_params,
                          entity_type, entity_id, assigned_role, assigned_to, priority, due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.type,
      params.title,
      params.description ?? null,
      params.subject ?? null,
      params.detailKey ?? null,
      params.detailParams ? JSON.stringify(params.detailParams) : null,
      params.entityType,
      params.entityId,
      params.assignedRole,
      params.assignedTo ?? null,
      params.priority ?? 'NORMAL',
      dueDate,
      params.createdBy ?? null,
    );
  return res.lastInsertRowid as number;
}

/** Bir varlığa bağlı açık görevleri kapatır (iş akışı ilerlediğinde). */
export function closeTasksFor(
  entityType: string,
  entityId: number,
  completedBy: number | null,
  types?: TaskType[],
): void {
  const typeClause = types?.length ? ` AND type IN (${types.map(() => '?').join(',')})` : '';
  db.prepare(
    `UPDATE tasks
        SET status = 'DONE', completed_by = ?, completed_at = datetime('now')
      WHERE entity_type = ? AND entity_id = ? AND status IN ('OPEN','IN_PROGRESS')${typeClause}`,
  ).run(completedBy, entityType, entityId, ...(types ?? []));
}
