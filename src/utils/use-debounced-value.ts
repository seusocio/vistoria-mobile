import { useEffect, useState } from "react";

/**
 * The value, settled — it follows `value` only after it has stopped changing
 * for `delayMs`.
 *
 * Used for search text that drives a *request* rather than a local filter: one
 * fetch per pause instead of one per keystroke, and — because the debounced
 * value is part of the query key — one cache entry per search the user actually
 * finished typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (value === settled) return;
    const timeout = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timeout);
    // `settled` is deliberately not a dependency: including it would restart
    // the timer when it lands, and the guard above already makes a settled
    // value a no-op.
  }, [value, delayMs, settled]);

  return settled;
}
