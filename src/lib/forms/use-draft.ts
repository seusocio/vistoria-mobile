import { zodResolver } from '@hookform/resolvers/zod'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form'
import type { z } from 'zod'
import { haptics } from '@/utils/haptics'

const DRAFT_PREFIX = '@vistoria/draft/'
const DEFAULT_DEBOUNCE_MS = 800

/**
 * Debounce timers keyed by storage key, at module scope rather than in a
 * ref: this is what lets a debounce started right before the user
 * navigates away still fire afterwards, instead of being cancelled by
 * unmount. Same trick the deleted local-answers-store.ts used, and for the
 * same reason — the alternative (flushing on unmount) means calling
 * `form.handleSubmit` after the component is gone, which is the pattern
 * this sidesteps entirely.
 */
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
const commitTimers = new Map<string, ReturnType<typeof setTimeout>>()

export interface UseDraftOptions<Values extends FieldValues> {
  /** Unique per draft instance, e.g. `checklist:${checklistId ?? 'new'}`. */
  key: string
  schema: z.ZodType<Values>
  defaultValues: Values
  /**
   * Called with the validated values. In autoCommit mode this fires on
   * every valid change, debounced. In manual mode it only fires from
   * `commit()`.
   */
  onCommit?: (values: Values) => void
  /** Debounced write-behind on every valid change, no save button. Default true. */
  autoCommit?: boolean
  debounceMs?: number
}

export interface UseDraftResult<Values extends FieldValues> {
  form: UseFormReturn<Values>
  /** Validates and commits right now. Returns whether it was valid; fires haptics.error() when it wasn't. */
  commit: () => Promise<boolean>
  /** Removes the persisted draft — call once the entity is safely created/committed. */
  clearDraft: () => Promise<void>
  /** True once a persisted draft, if any, has been loaded and applied to the form. */
  hydrated: boolean
}

/**
 * react-hook-form + zod + a draft that survives an app kill. Two ways to use it:
 *
 * - `autoCommit: true` (default) — for a form editing something that
 *   already exists. Every valid change debounces into `onCommit`. There is
 *   no save button and nothing to discard, because nothing is ever
 *   half-saved.
 * - `autoCommit: false` — for a form creating something that doesn't exist
 *   yet. The draft still survives a kill (closing and reopening the screen
 *   restores it), but `onCommit` only fires when the caller calls
 *   `commit()` from the primary action ("Criar").
 */
export function useDraft<Values extends FieldValues>({
  key,
  schema,
  defaultValues,
  onCommit,
  autoCommit = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseDraftOptions<Values>): UseDraftResult<Values> {
  const storageKey = `${DRAFT_PREFIX}${key}`

  const form = useForm<Values>({
    resolver: zodResolver(schema as never) as Resolver<Values>,
    defaultValues: defaultValues as DefaultValues<Values>,
  })
  const [hydrated, setHydrated] = useState(false)
  const hydratedRef = useRef(false)
  // onCommit is typically an inline closure at the call site; reading the
  // latest one through a ref (ADR 0001-0008's established pattern in this
  // codebase for stable callback identity) keeps the watch subscription
  // below from tearing down and re-subscribing on every render.
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  useEffect(() => {
    let cancelled = false
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled || !raw) return
        form.reset(JSON.parse(raw) as Values)
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return
        hydratedRef.current = true
        setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [storageKey, form.reset])

  useEffect(() => {
    const subscription = form.watch((values) => {
      clearTimeout(persistTimers.get(storageKey))
      persistTimers.set(
        storageKey,
        setTimeout(() => {
          persistTimers.delete(storageKey)
          void AsyncStorage.setItem(storageKey, JSON.stringify(values)).catch(() => undefined)
        }, debounceMs),
      )

      // Skip the auto-commit scheduled by the reset() that hydration itself
      // triggers — nothing actually changed yet, so there is nothing to send.
      if (!autoCommit || !onCommitRef.current || !hydratedRef.current) return
      clearTimeout(commitTimers.get(storageKey))
      commitTimers.set(
        storageKey,
        setTimeout(() => {
          commitTimers.delete(storageKey)
          // Invalid mid-typing states are expected and silent here — only
          // an explicit commit() surfaces haptics.error() on invalid.
          void form.handleSubmit((valid) => onCommitRef.current?.(valid), () => {})()
        }, debounceMs),
      )
    })
    return () => subscription.unsubscribe()
  }, [storageKey, autoCommit, debounceMs, form.watch, form.handleSubmit])

  async function commit(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void form.handleSubmit(
        (values) => {
          onCommit?.(values)
          resolve(true)
        },
        () => {
          haptics.error()
          resolve(false)
        },
      )()
    })
  }

  async function clearDraft(): Promise<void> {
    clearTimeout(persistTimers.get(storageKey))
    clearTimeout(commitTimers.get(storageKey))
    persistTimers.delete(storageKey)
    commitTimers.delete(storageKey)
    await AsyncStorage.removeItem(storageKey).catch(() => undefined)
  }

  return { form, commit, clearDraft, hydrated }
}
