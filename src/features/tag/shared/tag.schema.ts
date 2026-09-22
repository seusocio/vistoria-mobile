import { z } from 'zod'

export const tagLabelSchema = z
  .string()
  .trim()
  .min(1, 'Nome da tag não pode ser vazio')
