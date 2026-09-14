import { DEFAULT_RESPONSE_OPTIONS, ResponseOption } from '@/infra/domain/entities'

export interface ChecklistTemplate {
  id: string
  title: string
  tagLabels: string[]
  options: ResponseOption[]
  itemTitles: string[]
}

/**
 * Starting points offered in RF-03 when creating a checklist "a partir de um
 * modelo". These are plain data, not persisted entities - picking one just
 * prefills the New Checklist form for editing.
 */
export const checklistTemplates: ChecklistTemplate[] = [
  {
    id: 'template-vistoria-entrega',
    title: 'Vistoria de entrega',
    tagLabels: ['Entrega'],
    options: DEFAULT_RESPONSE_OPTIONS,
    itemTitles: [
      'Piso sem trincas ou manchas',
      'Paredes e pintura sem falhas',
      'Esquadrias niveladas e funcionando',
      'Portas e fechaduras funcionando',
      'Instalações elétricas testadas',
      'Instalações hidráulicas sem vazamento',
      'Limpeza geral do imóvel',
    ],
  },
  {
    id: 'template-areas-comuns',
    title: 'Áreas comuns',
    tagLabels: ['Áreas comuns'],
    options: DEFAULT_RESPONSE_OPTIONS,
    itemTitles: [
      'Hall de entrada limpo e conservado',
      'Elevadores funcionando',
      'Iluminação das áreas comuns',
      'Portão e interfone funcionando',
      'Jardim e paisagismo conservados',
      'Extintores dentro da validade',
    ],
  },
  {
    id: 'template-instalacao-hidraulica',
    title: 'Instalação hidráulica',
    tagLabels: ['Hidráulica'],
    options: DEFAULT_RESPONSE_OPTIONS,
    itemTitles: [
      'Torneiras sem vazamento',
      'Registros funcionando corretamente',
      'Ralos sem entupimento',
      "Caixa d'água limpa e vedada",
      'Pressão de água adequada',
    ],
  },
]
