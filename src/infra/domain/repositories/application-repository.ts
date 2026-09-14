import { Application } from '../entities'

export interface ApplicationRepository {
  /** not logically deleted */
  listByChecklistId(checklistId: string): Promise<Application[]>
  /** not logically deleted, across every checklist, for the tag report */
  listAll(): Promise<Application[]>
  findById(id: string): Promise<Application | null>
  /** upsert */
  save(application: Application): Promise<Application>
  softDelete(id: string): Promise<void>
}
