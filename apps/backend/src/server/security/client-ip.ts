import { isIP } from 'node:net';

/**
 * The address a request is attributed to. `raw` is the normalized address (for logs and the
 * administrator's view), `key` is what limits and counters are keyed on: the same as `raw` for
 * IPv4, the /64 prefix for IPv6 (one subscriber usually controls a whole /64, so keying on the
 * full address would let a client rotate through 2^64 of them).
 */
export interface ClientIp {
  raw: string;
  key: string;
}

/** Used whenever no trustworthy address is available. All such requests share one bucket. */
export const UNKNOWN_CLIENT_IP: ClientIp = { raw: 'unknown', key: 'unknown' };

/** The part of the environment this module reads; `process.env` fits, and so does a literal in a test. */
type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/** `TRUSTED_PROXY_HOPS` as a positive integer, or undefined when it is set to something else. */
function configuredHops(env: Env): number | undefined {
  const value = env.TRUSTED_PROXY_HOPS;
  if (value === undefined || value === '') return DEFAULT_TRUSTED_PROXY_HOPS;
  return /^[1-9]\d{0,2}$/.test(value) ? Number(value) : undefined;
}

/** Eight 16-bit groups of an IPv6 address that `net.isIP` has already accepted. */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase();
  const embedded = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (embedded) text = `${text.slice(0, embedded.index)}0:0`;

  const [head = '', rest] = text.split('::');
  const groups = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  const front = groups(head);
  const back = rest === undefined ? [] : groups(rest);
  const result =
    rest === undefined
      ? front
      : [...front, ...Array(8 - front.length - back.length).fill(0), ...back];

  if (embedded) {
    const octets = embedded.slice(1, 5).map(Number) as [number, number, number, number];
    result[6] = octets[0] * 256 + octets[1];
    result[7] = octets[2] * 256 + octets[3];
  }
  return result;
}

/** RFC 5952 text of eight groups: lower case, the longest run of zero groups (two or more) as `::`. */
function ipv6Text(groups: number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < 8;) {
    let end = start;
    while (end < 8 && groups[end] === 0) end++;
    if (end - start > bestLength) [bestStart, bestLength] = [start, end - start];
    start = end === start ? start + 1 : end;
  }
  const hex = (slice: number[]) => slice.map((group) => group.toString(16)).join(':');
  if (bestLength < 2) return hex(groups);
  return `${hex(groups.slice(0, bestStart))}::${hex(groups.slice(bestStart + bestLength))}`;
}

/** Normalizes a syntactically valid address; undefined for anything `net.isIP` refuses. */
function normalize(candidate: string): ClientIp | undefined {
  // `%` is an IPv6 zone id: link-local scope, never what a proxy reports for a remote client.
  if (candidate.includes('%')) return undefined;
  const version = isIP(candidate);
  if (version === 4) return { raw: candidate, key: candidate };
  if (version !== 6) return undefined;

  const groups = ipv6Groups(candidate);
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const ipv4 = [groups[6], groups[7]]
      .flatMap((pair) => [(pair as number) >> 8, (pair as number) & 255])
      .join('.');
    return { raw: ipv4, key: ipv4 };
  }
  return {
    raw: ipv6Text(groups),
    key: `${groups
      .slice(0, 4)
      .map((group) => group.toString(16))
      .join(':')}::/64`,
  };
}

/**
 * The client address of a request.
 *
 * Without `TRUST_PROXY=true` the forwarding headers are ignored entirely: anything a client sends
 * is as good as nothing, and every request gets the fixed `unknown` key. With it, the address is
 * the entry `TRUSTED_PROXY_HOPS` places from the RIGHT of `X-Forwarded-For`: each trusted proxy
 * appends the address it received the connection from, so the right end is written by our own
 * infrastructure and the left part by whoever the client claims to be. Deployment rule: the edge
 * reverse proxy overwrites `X-Forwarded-For` with the address it saw instead of appending to what
 * the client sent; further trusted proxies in a chain append, and `TRUSTED_PROXY_HOPS` counts them.
 *
 * Never throws: a missing, short or malformed header gives `unknown`.
 */
export function resolveClientIp(headers: Pick<Headers, 'get'>, env: Env = process.env): ClientIp {
  if (env.TRUST_PROXY !== 'true') return UNKNOWN_CLIENT_IP;

  const hops = configuredHops(env) ?? DEFAULT_TRUSTED_PROXY_HOPS;
  const entries = headers.get('x-forwarded-for')?.split(',') ?? [];
  const entry = entries[entries.length - hops];
  return (entry === undefined ? undefined : normalize(entry.trim())) ?? UNKNOWN_CLIENT_IP;
}

/**
 * Start-up warnings about a deployment whose per-IP limits cannot work. Called once from
 * `instrumentation.ts`; returns the messages so a test can see them.
 */
export function clientIpConfigurationWarnings(env: Env = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const warnings: string[] = [];
  if (env.TRUST_PROXY !== 'true') {
    warnings.push(
      'TRUST_PROXY is not "true": every client shares the address key "unknown", so per-IP limits act on all clients together. Run behind a reverse proxy that overwrites X-Forwarded-For and set TRUST_PROXY=true.',
    );
  } else if (configuredHops(env) === undefined) {
    warnings.push(
      'TRUSTED_PROXY_HOPS is not a positive integer: falling back to 1. Set it to the number of trusted reverse proxies in front of the application.',
    );
  }
  return warnings;
}

/** Writes the start-up warnings to the console. Operational text only: no request data. */
export function warnAboutClientIpConfiguration(env: Env = process.env): void {
  for (const warning of clientIpConfigurationWarnings(env)) console.warn(`[securedesk] ${warning}`);
}
