import { useState } from 'react'
import {
  Checklist,
  ChecklistItem,
  DEFAULT_RESPONSE_OPTIONS,
  ResponseOption,
  ResponseSemantic,
} from '@/infra/domain/entities'
import { generateId } from '@/infra/id'

export interface ChecklistFormItemState {
  key: string
  id?: string
  title: string
  description: string
  tagsIds: string[]
}

function itemFromChecklist(item: ChecklistItem): ChecklistFormItemState {
  return {
    key: item.id,
    id: item.id,
    title: item.title,
    description: item.description,
    tagsIds: item.tagsIds,
  }
}

function emptyItem(): ChecklistFormItemState {
  return {
    key: generateId('formitem_'),
    title: '',
    description: '',
    tagsIds: [],
  }
}

export interface ApplyTemplateInput {
  title: string
  tagsIds: string[]
  options: ResponseOption[]
  itemTitles: string[]
}

export function useChecklistForm(initial?: Checklist) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [tagsIds, setTagsIds] = useState<string[]>(initial?.tagsIds ?? [])
  const [options, setOptions] = useState<ResponseOption[]>(
    initial?.options ?? DEFAULT_RESPONSE_OPTIONS,
  )
  const [items, setItems] = useState<ChecklistFormItemState[]>(
    initial && initial.items.length > 0
      ? initial.items.map(itemFromChecklist)
      : [emptyItem()],
  )

  function addOption() {
    setOptions((prev) => [...prev, { label: '', semantic: 'neutro' }])
  }
  function updateOptionLabel(index: number, label: string) {
    setOptions((prev) =>
      prev.map((option, i) => (i === index ? { ...option, label } : option)),
    )
  }
  function updateOptionSemantic(index: number, semantic: ResponseSemantic) {
    setOptions((prev) =>
      prev.map((option, i) => (i === index ? { ...option, semantic } : option)),
    )
  }
  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }
  function updateItem(key: string, patch: Partial<ChecklistFormItemState>) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }
  function removeItem(key: string) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((item) => item.key !== key) : prev,
    )
  }

  function applyTemplate(template: ApplyTemplateInput) {
    setTitle(template.title)
    setTagsIds(template.tagsIds)
    setOptions(template.options)
    setItems(
      template.itemTitles.map((itemTitle) => ({
        key: generateId('formitem_'),
        title: itemTitle,
        description: '',
        tagsIds: [],
      })),
    )
  }

  return {
    title,
    setTitle,
    tagsIds,
    setTagsIds,
    options,
    addOption,
    updateOptionLabel,
    updateOptionSemantic,
    removeOption,
    items,
    addItem,
    updateItem,
    removeItem,
    applyTemplate,
  }
}

export type ChecklistFormApi = ReturnType<typeof useChecklistForm>
