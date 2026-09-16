import { useMutation } from 'convex/react'
import type { OptimisticLocalStore } from 'convex/browser'
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

export function useApplicationMutations() {
  const create = useMutation(api.applications.create).withOptimisticUpdate(
    (store, { entity }) => seedApplicationEverywhere(store, entity as Application),
  )
  const patchItem = useMutation(api.applications.patchItem).withOptimisticUpdate(
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
  const patchItems = useMutation(api.applications.patchItems).withOptimisticUpdate(
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
  const addItem = useMutation(api.applications.addItem).withOptimisticUpdate(
    (store, { applicationId, item, updatedAt }) =>
      patchAppEverywhere(store, applicationId, (application) => ({
        ...application,
        items: [...application.items, item as Application['items'][number]],
        updatedAt,
      })),
  )
  const addAttachment = useMutation(api.applications.addAttachment).withOptimisticUpdate(
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
  const setAttachmentUploaded = useMutation(
    api.applications.setAttachmentUploaded,
  ).withOptimisticUpdate((store, { applicationId, attachmentId, storageId, updatedAt }) =>
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
  const setAttachmentDeletedAt = useMutation(
    api.applications.setAttachmentDeletedAt,
  ).withOptimisticUpdate((store, { applicationId, itemId, attachmentId, deletedAt, updatedAt }) =>
    patchAppEverywhere(store, applicationId, (application) =>
      itemId === null
        ? updateAttachment(application, attachmentId, (attachment) => ({ ...attachment, deletedAt }), updatedAt)
        : updateItemAttachment(application, itemId, attachmentId, (attachment) => ({ ...attachment, deletedAt }), updatedAt),
    ),
  )
  const purgeAttachment = useMutation(api.applications.purgeAttachment).withOptimisticUpdate(
    (store, { applicationId, itemId, attachmentId }) =>
      patchAppEverywhere(store, applicationId, (application) =>
        removeAttachmentFromApplication(application, itemId, attachmentId),
      ),
  )
  const updateMeta = useMutation(api.applications.updateMeta).withOptimisticUpdate(
    (store, { applicationId, updatedAt, ...meta }) =>
      patchAppEverywhere(store, applicationId, (application) => ({
        ...application,
        ...meta,
        updatedAt,
      })),
  )
  const setTagsForMany = useMutation(api.applications.setTagsForMany).withOptimisticUpdate(
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
  const softDelete = useMutation(api.applications.softDelete).withOptimisticUpdate(
    (store, { id, deletedAt }) =>
      patchAppEverywhere(store, id, (application) => ({ ...application, deletedAt })),
  )

  return {
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
  }
}

export type { AttachmentInput }
