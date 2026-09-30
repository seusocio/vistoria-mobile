/**
 * The plumbing shared by the two Convex -> REST migration scripts
 * (`migrate-convex-to-rest.ts` for the records, `migrate-convex-attachments.ts`
 * for the image bytes): how to reach the target, how to talk to it, and how to
 * checkpoint progress so an interrupted run resumes instead of restarting.
 *
 * These scripts talk to REST with plain `fetch` rather than the generated
 * orval client on purpose: that client's fetcher (`src/lib/api/fetcher.ts`)
 * pulls in the zustand/AsyncStorage session store, which only exists inside
 * the React Native app. The one thing copied from it is how auth actually
 * works on this deployment — a `Cookie: __Secure-better-auth.session_token=`
 * header, not `Authorization: Bearer` (see that file's comment).
 */

// ---------------------------------------------------------------- flags

export type Flags = Map<string, string>

export function parseFlags(argv: string[], known: string[]): Flags {
  const flags: Flags = new Map()
  for (const arg of argv) {
    if (!arg.startsWith('--')) throw new Error(`Argumento desconhecido: ${arg}`)
    const [name, value] = arg.slice(2).split('=')
    flags.set(name as string, value ?? 'true')
  }
  const allowed = new Set([...known, 'help'])
  for (const name of flags.keys()) {
    if (!allowed.has(name)) throw new Error(`Flag desconhecida: --${name}`)
  }
  return flags
}

/** The Convex deployment to read from and the REST org/project to write into. */
export interface Target {
  convexUrl: string
  baseUrl: string
  token: string
  orgId: string
  projectId: string
}

export const TARGET_FLAGS = ['convex-url', 'base-url', 'token', 'org', 'project']

export function resolveTarget(flags: Flags): Target {
  const env = process.env
  const required = (flag: string, envValue: string | undefined, envName: string) => {
    const value = flags.get(flag) ?? envValue
    if (!value) throw new Error(`Faltando --${flag} (ou ${envName} no .env.local)`)
    return value
  }
  return {
    convexUrl: required('convex-url', env.CONVEX_URL ?? env.EXPO_PUBLIC_CONVEX_URL, 'CONVEX_URL'),
    baseUrl: required(
      'base-url',
      env.EXPO_PUBLIC_BACKEND_BASE_URL,
      'EXPO_PUBLIC_BACKEND_BASE_URL',
    ).replace(/\/$/, ''),
    token: required('token', env.EXPO_PUBLIC_DEV_TOKEN, 'EXPO_PUBLIC_DEV_TOKEN'),
    orgId: required('org', env.EXPO_PUBLIC_DEV_ORG_ID, 'EXPO_PUBLIC_DEV_ORG_ID'),
    projectId: required('project', env.EXPO_PUBLIC_DEV_PROJECT_ID, 'EXPO_PUBLIC_DEV_PROJECT_ID'),
  }
}

// ---------------------------------------------------------------- retry

/**
 * Three attempts, 1s then 2s apart. Enough to ride out the brief storage
 * hiccups a migration provokes without turning a genuinely down backend into
 * a long silent stall.
 */
export const MAX_ATTEMPTS = 3

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------- rest

export class RestError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: unknown,
  ) {
    super(`${status} ${url} — ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    this.name = 'RestError'
  }
}

export class Rest {
  constructor(private readonly target: Target) {}

  /**
   * Unwraps the `{ data, meta }` envelope the same way `src/lib/api/fetcher.ts`
   * does, and retries a 5xx with backoff the same way the app's outbox drain
   * does — a migration run is long, and a blip has to cost a pause rather than
   * the whole run.
   *
   * This is not hypothetical: `PATCH /attachments/{id}` answers
   * `503 {"error":"armazenamento indisponível"}` when it cannot reach object
   * storage to confirm the blob, and storage does go away for a moment under a
   * migration uploading back to back. Verified on a real casualty of such an
   * abort: the bytes were already in storage under the row's own `storageKey`
   * (a `GET` on its `url` returned the image), and the identical PATCH
   * succeeded on the first try afterwards — nothing was wrong but the timing.
   *
   * A 4xx still throws immediately: that is the server permanently rejecting
   * what was sent, and retrying it only delays a real report.
   */
  async call<T>(method: string, path: string, body?: unknown): Promise<{ data: T; meta?: unknown }> {
    const url = `${this.target.baseUrl}${path}`
    let lastError: RestError | undefined
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(2 ** (attempt - 1) * 1000)
      let response: Response
      try {
        response = await fetch(url, {
          method,
          headers: {
            Cookie: `__Secure-better-auth.session_token=${this.target.token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      } catch (error) {
        // A dropped connection is the same class of problem as a 5xx.
        lastError = new RestError(0, url, (error as Error).message)
        continue
      }
      if (!response.ok) {
        const raw = await response.text()
        let parsed: unknown = raw
        try {
          parsed = JSON.parse(raw)
        } catch {
          // keep the raw text
        }
        const failure = new RestError(response.status, url, parsed)
        if (response.status < 500) throw failure
        lastError = failure
        continue
      }
      if (response.status === 204 || response.status === 205) return { data: undefined as T }
      return (await response.json()) as { data: T; meta?: unknown }
    }
    throw lastError ?? new RestError(0, url, 'falha desconhecida')
  }

  private scoped(path: string): string {
    return `/${this.target.orgId}/projects/${this.target.projectId}${path}`
  }

  /**
   * Walks every page instead of assuming one, unlike the app
   * (`APPLICATIONS_LIST_PARAMS`'s `pageSize=100` single-page assumption) — a
   * migration that reads a truncated "what already exists" list would re-POST
   * rows that are already there.
   */
  async listAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
    const rows: T[] = []
    let page = 1
    for (;;) {
      const search = new URLSearchParams({ ...params, page: String(page), pageSize: '100' })
      const { data, meta } = await this.call<T[]>('GET', `${this.scoped(path)}?${search}`)
      rows.push(...data)
      const pagination = (meta as { pagination?: { pageCount?: number } } | undefined)?.pagination
      if (!pagination?.pageCount || page >= pagination.pageCount) return rows
      page += 1
    }
  }

  get<T>(path: string) {
    return this.call<T>('GET', this.scoped(path))
  }

  post<T>(path: string, body: unknown) {
    return this.call<T>('POST', this.scoped(path), body)
  }

  patch<T>(path: string, body: unknown) {
    return this.call<T>('PATCH', this.scoped(path), body)
  }

  /** Fails before any write if the session cookie is expired or the org/project pair doesn't exist. */
  async assertReachable(): Promise<void> {
    await this.call('GET', `/${this.target.orgId}/projects/${this.target.projectId}`)
  }
}

// ---------------------------------------------------------------- checkpoint

/** Every checkpoint records which deployments it was written against — see `loadCheckpoint`. */
export interface Checkpoint {
  target: Target & { token?: never }
}

/**
 * A checkpoint is only meaningful for the exact pair of deployments it was
 * written against: replaying "already migrated" against a different target
 * would silently skip everything and report success. The session token is not
 * part of the identity (it rotates) and is deliberately never written to disk.
 */
export async function loadCheckpoint<T extends Checkpoint>(
  path: string,
  target: Target,
  fresh: () => T,
  reset: boolean,
): Promise<T> {
  const identity = () => {
    const { token: _token, ...rest } = target
    return rest
  }
  const blank = (): T => ({ ...fresh(), target: identity() as T['target'] })
  if (reset) return blank()

  const file = Bun.file(path)
  if (!(await file.exists())) return blank()

  const state = (await file.json()) as T
  const current = identity()
  for (const key of Object.keys(current) as Array<keyof typeof current>) {
    if (state.target?.[key] !== current[key]) {
      throw new Error(
        `O checkpoint em ${path} é de outro destino (${key}: ${state.target?.[key]} != ${current[key]}). ` +
          'Use --state com outro caminho ou --reset-state.',
      )
    }
  }
  return state
}

export async function saveCheckpoint(path: string, state: unknown, dryRun: boolean): Promise<void> {
  if (dryRun) return
  await Bun.write(path, `${JSON.stringify(state, null, 2)}\n`)
}

// ---------------------------------------------------------------- misc

/** Runs `task` over `items` with at most `limit` in flight. */
export async function pooled<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      await task(items[index] as T)
    }
  })
  await Promise.all(workers)
}
