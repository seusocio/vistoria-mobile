import { defineOp } from "@/lib/offline-queue/ops";
import type { Checklist } from "@/features/checklist/shared/checklist.types";
import {
  checklistsListQueryKey,
  createChecklistRest,
  updateChecklistRest,
  deleteChecklistRest,
} from "@/features/checklist/shared/checklist.rest";
import { getGetChecklistQueryKey } from "@/lib/api/endpoints/default/default";
import { convexClient } from "@/lib/convex/client";
import { useSessionStore } from "@/lib/session/session.store";
import { api } from "../../../../convex/_generated/api";

export interface ChecklistSaveArgs {
  id: string;
  entity: Checklist;
  /**
   * Set at the enqueue site, which is the only place that reliably knows
   * whether `entity` is brand new or an edit of one the server already has
   * — the queue itself can't infer that from a cache that might not have
   * caught up yet. REST needs the distinction (`POST` vs. `PUT`); Convex's
   * `checklists.save` upserts either way and ignores it.
   */
  isCreate?: boolean;
}

function requireActiveProject(): { orgId: string; projectId: string } {
  const { activeOrgId, activeProjectId } = useSessionStore.getState();

  if (!activeOrgId || !activeProjectId) {
    throw new Error("checklists: no active organization/project session");
  }
  return { orgId: activeOrgId, projectId: activeProjectId };
}

/**
 * One op covers both create and update: `checklists.save` on the server is
 * already a real upsert (replace if the external id exists, else insert),
 * so the local overlay is the same "replace wholesale with the new entity"
 * either way — there is no merge to get wrong between the two cases.
 */
export const checklistSave = defineOp<ChecklistSaveArgs, Checklist>(
  "checklists.save",
  {
    kind: "checklist",
    send: (args) => convexClient.mutation(api.checklists.save, args as never),
    sendRest: (args) => {
      const { orgId, projectId } = requireActiveProject();
      return args.isCreate
        ? createChecklistRest(orgId, projectId, args.entity)
        : updateChecklistRest(orgId, projectId, args.entity);
    },
    applyLocal: (_entity, args) => args.entity,
    entityId: (args) => args.id,
    onServerResponse: (queryClient, args, response) => {
      const { orgId, projectId } = requireActiveProject();
      queryClient.setQueryData(
        getGetChecklistQueryKey(orgId, projectId, args.id),
        response,
      );
    },
    invalidates: () => {
      const { orgId, projectId } = requireActiveProject();
      return [checklistsListQueryKey(orgId, projectId)];
    },
  },
);

/**
 * Deletes the checklist and every one of its applications in a single
 * server-side transaction. Queued like every other write, so deleting
 * offline is as durable as filling a vistoria offline — the previous
 * direct `convexClient.mutation` call simply hung with no network and was
 * lost on a kill.
 *
 * The overlay for this op only marks the *checklist* deleted; the
 * applications it cascades into are a different `kind` and stay visible
 * until the server confirms. `useChecklistLibrary` closes that gap by
 * dropping applications whose checklist is no longer in the list.
 */
export const checklistSoftDeleteCascade = defineOp<
  { id: string; deletedAt: string },
  Checklist
>("checklists.softDeleteCascade", {
  kind: "checklist",
  send: (args) =>
    convexClient.mutation(api.checklists.softDeleteCascade, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject();
    return deleteChecklistRest(orgId, projectId, args.id);
  },
  applyLocal: (entity, args) => {
    if (!entity) return null;
    return { ...entity, deletedAt: args.deletedAt };
  },
  entityId: (args) => args.id,
  onServerResponse: (queryClient, args) => {
    const { orgId, projectId } = requireActiveProject();
    queryClient.removeQueries({
      queryKey: getGetChecklistQueryKey(orgId, projectId, args.id),
    });
  },
  invalidates: () => {
    const { orgId, projectId } = requireActiveProject();
    return [checklistsListQueryKey(orgId, projectId)];
  },
});
