export type ResponseSemantic = 'positivo' | 'negativo' | 'neutro'

export interface ResponseOption {
  label: string
  semantic: ResponseSemantic
}

export const DEFAULT_RESPONSE_OPTIONS: ResponseOption[] = [
  { label: 'Sim', semantic: 'positivo' },
  { label: 'Não', semantic: 'negativo' },
  { label: 'Parcial', semantic: 'neutro' },
]
