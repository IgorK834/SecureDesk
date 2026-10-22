export const REDACTED = '[REDACTED]';

// Key names that can hold a credential: password, secret, token (also csrfToken, tokenHash),
// any hash (passwordHash), cookie / set-cookie, authorization, credential.
const SENSITIVE_KEY = /pass|secret|token|hash|cookie|authorization|credential/i;

const MAX_DEPTH = 8;

function walk(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  // An Error's message can embed query parameters (hashes, tokens), so only its name survives.
  if (value instanceof Error) return { name: value.name };
  if (typeof value !== 'object' || value === null) return value;
  if (ancestors.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';

  const prototype: unknown = Object.getPrototypeOf(value);
  const isPlainObject = prototype === Object.prototype || prototype === null;
  if (!Array.isArray(value) && !isPlainObject) return `[${value.constructor.name}]`;

  ancestors.add(value);
  const copy = Array.isArray(value)
    ? value.map((item) => walk(item, depth + 1, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? REDACTED : walk(item, depth + 1, ancestors),
        ]),
      );
  ancestors.delete(value);
  return copy;
}

/**
 * A copy of `value` that is safe to log: the value of every key that looks like a credential is
 * replaced by `[REDACTED]`, at any depth. Redaction is by key name only; a secret inside a free
 * text string cannot be detected, which is why callers must not log request bodies at all. The
 * input is never modified.
 */
export function redact(value: unknown): unknown {
  return walk(value, 0, new WeakSet());
}
