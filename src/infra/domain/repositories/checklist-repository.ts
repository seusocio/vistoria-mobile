import { Checklist } from '../entities'

export interface ChecklistRepository {
  /** not logically deleted */
  list(): Promise<Checklist[]>
  findById(id: string): Promise<Checklist | null>
  /** upsert */
  save(checklist: Checklist): Promise<Checklist>
  softDelete(id: string): Promise<void>
}
