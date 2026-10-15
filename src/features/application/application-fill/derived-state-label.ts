import type { ApplicationDerivedState } from '@/features/application/shared/application.utils'

export const DERIVED_STATE_LABEL: Record<ApplicationDerivedState, string> = {
  not_started: 'Não iniciada',
  in_progress: 'Executando',
  completed: 'Completa',
}
