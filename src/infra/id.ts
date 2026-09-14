let sequence = 0

/**
 * Lightweight id generator: avoids depending on native crypto polyfills
 * (uuid needs `crypto.getRandomValues`, unavailable on Hermes without a
 * native polyfill) while this app is still frontend-only.
 */
export function generateId(prefix = ''): string {
  sequence += 1
  const time = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}${time}${random}${sequence.toString(36)}`
}
