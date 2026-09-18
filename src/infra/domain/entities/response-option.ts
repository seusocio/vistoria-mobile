/** Not a closed set — checklists can have custom response options beyond these three canonical ones. */
export type ResponseSemantic = string

export interface ResponseOption {
  label: string
  semantic: ResponseSemantic
}

export const DEFAULT_RESPONSE_OPTIONS: ResponseOption[] = [
  { label: 'Sim', semantic: 'positivo' },
  { label: 'Não', semantic: 'negativo' },
  { label: 'Parcial', semantic: 'neutro' },
]
