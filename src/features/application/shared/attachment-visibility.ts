import { create } from 'zustand'

interface AttachmentVisibilityState {
  hiddenIds: Record<string, true>
  hide: (attachmentId: string) => void
  show: (attachmentId: string) => void
}

/**
 * The undo-toast window for photo deletion no longer enqueues anything (see
 * `use-attach-photos.ts`'s `removeAttachment`) — the delete op only fires on
 * commit, once "Desfazer" can no longer apply. Hiding the photo for those ~5s
 * is therefore local-only state, not routed through the outbox: killing the
 * app mid-window just shows the photo again on relaunch, which is an
 * acceptable loss for an in-progress "Desfazer".
 */
export const useAttachmentVisibility = create<AttachmentVisibilityState>((set) => ({
  hiddenIds: {},
  hide: (attachmentId) => set((state) => ({ hiddenIds: { ...state.hiddenIds, [attachmentId]: true } })),
  show: (attachmentId) =>
    set((state) => {
      const { [attachmentId]: _removed, ...hiddenIds } = state.hiddenIds
      return { hiddenIds }
    }),
}))
