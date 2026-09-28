import ky, { HTTPError } from 'ky'
import { useSessionStore } from '@/lib/session/session.store'

/**
 * Thrown by `f` for every non-2xx response. This is load-bearing: it is what
 * lets the drain (a later seam) distinguish a permanent 4xx — stop retrying,
 * fail the op — from a 5xx/network blip worth a retry with backoff. A plain
 * `Error` gives it no `status` to branch on.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly body: unknown

  constructor(status: number, message: string, body: unknown, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

interface ApiErrorBody {
  code?: string
  message?: string
}

interface ApiEnvelope<T> {
  data: T
  meta?: unknown
}

/**
 * The one client that knows about transport. Orval's generated `getUrl`
 * helpers already prepend `EXPO_PUBLIC_BACKEND_BASE_URL` (configured as
 * `orval.config.ts`'s `baseUrl.runtime`), so `url` arrives here absolute —
 * this instance carries no `prefixUrl` of its own.
 *
 * The OpenAPI spec labels every endpoint `security: bearerAuth`, but this
 * deployment's `better-auth` only actually validates the signed session
 * cookie it issues (`__Secure-better-auth.session_token=<token>.<hmac>`) —
 * confirmed by hand: the same value 401s as `Authorization: Bearer`
 * (both the raw token and the full signed value) but succeeds as a `Cookie`
 * header. `token` in the session store is that full `<token>.<hmac>` value,
 * not a bearer credential.
 */
const client = ky.create({
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const { token } = useSessionStore.getState()
        if (token) request.headers.set('Cookie', `__Secure-better-auth.session_token=${token}`)
        // Every generated write (`createChecklist`, `updateChecklist`, ...)
        // hands `f` an already-`JSON.stringify`'d string as `body`, not ky's
        // own `json` option — so `Request` defaults it to
        // `text/plain;charset=UTF-8` *at construction*, before this hook
        // ever runs, which is why checking "is Content-Type missing" doesn't
        // catch it: it's already present, just wrong. The server can't parse
        // that as JSON and 422s even a request whose payload is
        // byte-for-byte identical to one sent with the right header. Only
        // that specific default gets corrected — a `multipart/form-data`
        // upload's auto-generated boundary must survive untouched.
        if (request.headers.get('Content-Type')?.startsWith('text/plain')) {
          request.headers.set('Content-Type', 'application/json')
        }
      },
    ],
  },
})

/**
 * The orval fetch-client mutator: every generated endpoint calls
 * `f<T>(url, options)` in place of its own fetch/parse/throw logic. Unwraps
 * the `{ data, meta }` envelope so call sites get `data` directly — except
 * for a list response (`data` is an array), where `meta.pagination` is kept
 * alongside it, since list screens need it and entity screens never do.
 */
export async function f<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await client(url, options)
  } catch (error) {
    if (error instanceof HTTPError) {
      const body = await error.response.json().catch(() => undefined)
      const parsed = (body ?? {}) as ApiErrorBody
      if (error.response.status === 401) useSessionStore.getState().clearSession()
      throw new ApiError(
        error.response.status,
        parsed.message ?? error.message,
        body,
        parsed.code,
      )
    }
    throw error
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T
  }

  const envelope = (await response.json()) as ApiEnvelope<unknown>
  if (Array.isArray(envelope.data)) {
    return { data: envelope.data, meta: envelope.meta } as T
  }
  return envelope.data as T
}
