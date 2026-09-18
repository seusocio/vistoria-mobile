import { useMutation, type ReactMutation } from 'convex/react'
import type { OptimisticLocalStore, OptimisticUpdate } from 'convex/browser'
import type { FunctionArgs, FunctionReference } from 'convex/server'
import { useMemo, useRef } from 'react'
import type { Application, Attachment } from '@/infra/domain/entities'
import {
  applyApplicationItemPatch,
  createAttachment,
  type ApplicationItemPatch,
  type AttachmentInput,
} from '@/infra/services'
import { api } from '../../convex/_generated/api'

type ApplicationQuery = Application & {
  attachments: Array<Attachment & { url?: string }>
}

type ApplicationTransform = (application: Application) => Application

function patchAppEverywhere(
  store: OptimisticLocalStore,
  applicationId: string,
  transform: ApplicationTransform,
) {
  const one = store.getQuery(api.applications.findById, { id: applicationId })
  if (one) {
    store.setQuery(
      api.applications.findById,
      { id: applicationId },
      transform(one as ApplicationQuery) as never,
    )
  }

  const all = store.getQuery(api.applications.listAll, {})
  if (all) {
    store.setQuery(
      api.applications.listAll,
      {},
      (all as ApplicationQuery[]).map((application) =>
        application.id === applicationId ? transform(application) : application,
      ) as never,
    )
  }

  for (const query of store.getAllQueries(api.applications.listByChecklistId)) {
    if (!query.value) continue
    store.setQuery(
      api.applications.listByChecklistId,
      query.args,
      (query.value as ApplicationQuery[]).map((application) =>
        application.id === applicationId ? transform(application) : application,
      ) as never,
    )
  }
}

function addAttachmentToApplication(
  application: Application,
  itemId: string | null,
  attachment: Attachment,
  updatedAt: string,
): Application {
  if (itemId === null) {
    return {
      ...application,
      attachments: [...application.attachments, attachment],
      updatedAt,
    }
  }
  return {
    ...application,
    items: application.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            attachments: [...item.attachments, attachment],
            updatedAt,
          }
        : item,
    ),
    updatedAt,
  }
}

function updateAttachment(
  application: Application,
  attachmentId: string,
  update: (attachment: Attachment) => Attachment,
  updatedAt: string,
): Application {
  return {
    ...application,
    attachments: application.attachments.map((attachment) =>
      attachment.id === attachmentId ? update(attachment) : attachment,
    ),
    items: application.items.map((item) => ({
      ...item,
      attachments: item.attachments.map((attachment) =>
        attachment.id === attachmentId ? update(attachment) : attachment,
      ),
    })),
    updatedAt,
  }
}

function updateItemAttachment(
  application: Application,
  itemId: string,
  attachmentId: string,
  update: (attachment: Attachment) => Attachment,
  updatedAt: string,
): Application {
  return {
    ...application,
    items: application.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            attachments: item.attachments.map((attachment) =>
              attachment.id === attachmentId ? update(attachment) : attachment,
            ),
            updatedAt,
          }
        : item,
    ),
    updatedAt,
  }
}

function removeAttachmentFromApplication(
  application: Application,
  itemId: string | null,
  attachmentId: string,
): Application {
  if (itemId === null) {
    return {
      ...application,
      attachments: application.attachments.filter(
        (attachment) => attachment.id !== attachmentId,
      ),
    }
  }
  return {
    ...application,
    items: application.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            attachments: item.attachments.filter(
              (attachment) => attachment.id !== attachmentId,
            ),
          }
        : item,
    ),
  }
}

function seedApplicationEverywhere(
  store: OptimisticLocalStore,
  application: Application,
) {
  const existing = store.getQuery(api.applications.findById, { id: application.id })
  if (!existing) {
    store.setQuery(api.applications.findById, { id: application.id }, application as never)
  }

  const all = store.getQuery(api.applications.listAll, {})
  if (all && !(all as Application[]).some((item) => item.id === application.id)) {
    store.setQuery(api.applications.listAll, {}, [application, ...(all as Application[])] as never)
  }

  for (const query of store.getAllQueries(api.applications.listByChecklistId)) {
    if (!query.value || query.args.checklistId !== application.checklistId) continue
    const applications = query.value as Application[]
    if (applications.some((item) => item.id === application.id)) continue
    store.setQuery(api.applications.listByChecklistId, query.args, [application, ...applications] as never)
  }
}

/**
 * `useMutation(...)` is stable but `.withOptimisticUpdate(...)` returns a fresh
 * function on every call, so calling it during render hands consumers a new
 * mutation each time — which breaks any useCallback/memo built on top of it.
 * Bind the update once and read the latest closure through a ref instead.
 */
function useOptimisticMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  update: OptimisticUpdate<FunctionArgs<Mutation>>,
): ReactMutation<Mutation> {
  const base = useMutation(mutation)
  const updateRef = useRef(update)
  updateRef.current = update
  return useMemo(
    () => base.withOptimisticUpdate((store, args) => updateRef.current(store, args)),
    [base],
  )
}

export function useApplicationMutations() {
  const create = useOptimisticMutation(
    api.applications.create,
    (store, { entity }) => seedApplicationEverywhere(store, entity as Application),
  )
  const patchItem = useOptimisticMutation(
    api.applications.patchItem,
    (store, { applicationId, itemId, patch, updatedAt }) =>
      patchAppEverywhere(store, applicationId, (application) =>
        applyApplicationItemPatch(
          application,
          itemId,
          patch as ApplicationItemPatch,
          updatedAt,
        ),
      ),
  )
  const patchItems = useOptimisticMutation(
    api.applications.patchItems,
    (store, { applicationId, patches, updatedAt }) =>
      patchAppEverywhere(store, applicationId, (application) =>
        patches.reduce(
          (current, itemPatch) =>
            applyApplicationItemPatch(
              current,
              itemPatch.itemId,
              itemPatch.patch as ApplicationItemPatch,
              updatedAt,
            ),
          application,
        ),
      ),
  )
  const addItem = useOptimisticMutation(
    api.applications.addItem,
    (store, { applicationId, item, updatedAt }) =>
      patchAppEverywhere(store, applicationId, (application) => ({
        ...application,
        items: [...application.items, item as Application['items'][number]],
        updatedAt,
      })),
  )
  const addAttachment = useOptimisticMutation(
    api.applications.addAttachment,
    (store, { applicationId, itemId, attachment, updatedAt }) =>
      patchAppEverywhere(store, applicationId, (application) =>
        addAttachmentToApplication(
          application,
          itemId,
          attachment as Attachment,
          updatedAt,
        ),
      ),
  )
  const setAttachmentUploaded = useOptimisticMutation(
    api.applications.setAttachmentUploaded,
    (store, { applicationId, attachmentId, storageId, updatedAt }) =>
      patchAppEverywhere(store, applicationId, (application) =>
        updateAttachment(
          application,
          attachmentId,
          (attachment) => ({
            ...attachment,
            storageId,
            uploadStatus: 'uploaded',
          }),
          updatedAt,
        ),
      ),
  )
  const setAttachmentDeletedAt = useOptimisticMutation(
    api.applications.setAttachmentDeletedAt,
    (store, { applicationId, itemId, attachmentId, deletedAt, updatedAt }) =>
      patchAppEverywhere(store, applicationId, (application) =>
        itemId === null
          ? updateAttachment(application, attachmentId, (attachment) => ({ ...attachment, deletedAt }), updatedAt)
          : updateItemAttachment(application, itemId, attachmentId, (attachment) => ({ ...attachment, deletedAt }), updatedAt),
      ),
  )
  const purgeAttachment = useOptimisticMutation(
    api.applications.purgeAttachment,
    (store, { applicationId, itemId, attachmentId }) =>
      patchAppEverywhere(store, applicationId, (application) =>
        removeAttachmentFromApplication(application, itemId, attachmentId),
      ),
  )
  const updateMeta = useOptimisticMutation(
    api.applications.updateMeta,
    (store, { applicationId, updatedAt, ...meta }) =>
      patchAppEverywhere(store, applicationId, (application) => ({
        ...application,
        ...meta,
        updatedAt,
      })),
  )
  const setTagsForMany = useOptimisticMutation(
    api.applications.setTagsForMany,
    (store, { applicationIds, tagsIds, updatedAt }) => {
      for (const applicationId of applicationIds) {
        patchAppEverywhere(store, applicationId, (application) => ({
          ...application,
          tagsIds: [...tagsIds],
          updatedAt,
        }))
      }
    },
  )
  const softDelete = useOptimisticMutation(
    api.applications.softDelete,
    (store, { id, deletedAt }) =>
      patchAppEverywhere(store, id, (application) => ({ ...application, deletedAt })),
  )

  return useMemo(
    () => ({
      create,
      patchItem,
      patchItems,
      addItem,
      addAttachment,
      setAttachmentUploaded,
      setAttachmentDeletedAt,
      purgeAttachment,
      updateMeta,
      setTagsForMany,
      softDelete,
      createAttachment,
    }),
    [
      create,
      patchItem,
      patchItems,
      addItem,
      addAttachment,
      setAttachmentUploaded,
      setAttachmentDeletedAt,
      purgeAttachment,
      updateMeta,
      setTagsForMany,
      softDelete,
    ],
  )
}

export type { AttachmentInput }
