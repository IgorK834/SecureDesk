import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UNKNOWN_CLIENT_IP,
  clientIpConfigurationWarnings,
  resolveClientIp,
  warnAboutClientIpConfiguration,
} from './client-ip';

const TRUSTED: Record<string, string | undefined> = {
  TRUST_PROXY: 'true',
  TRUSTED_PROXY_HOPS: '1',
};

const headers = (forwarded?: string) =>
  new Headers(forwarded === undefined ? {} : { 'x-forwarded-for': forwarded });
const resolve = (
  forwarded: string | undefined,
  env: Record<string, string | undefined> = TRUSTED,
) => resolveClientIp(headers(forwarded), env);

describe('resolveClientIp without a trusted proxy', () => {
  it.each([
    ['TRUST_PROXY unset', {}],
    ['TRUST_PROXY=false', { TRUST_PROXY: 'false' }],
    ['TRUST_PROXY with another truthy-looking value', { TRUST_PROXY: '1' }],
  ])('ignores X-Forwarded-For entirely (%s)', (_label, env) => {
    expect(resolve('198.51.100.7', env)).toStrictEqual(UNKNOWN_CLIENT_IP);
    expect(resolve('1.2.3.4, 198.51.100.7', env)).toStrictEqual({ raw: 'unknown', key: 'unknown' });
  });
});

describe('resolveClientIp behind a trusted proxy', () => {
  it('SEC-56 takes the entry the proxy appended, not the one the client forged', () => {
    expect(resolve('1.2.3.4, 198.51.100.7')).toStrictEqual({
      raw: '198.51.100.7',
      key: '198.51.100.7',
    });
  });

  it('SEC-56 gives the same key however the forged left part is rotated', () => {
    const keys = new Set(
      ['1.2.3.4', '9.9.9.9', '::1', 'garbage', '', '10.0.0.1, 10.0.0.2', '198.51.100.8'].map(
        (forged) => resolve(`${forged}, 198.51.100.7`).key,
      ),
    );

    expect([...keys]).toStrictEqual(['198.51.100.7']);
  });

  it('counts TRUSTED_PROXY_HOPS entries from the right', () => {
    const env = { TRUST_PROXY: 'true', TRUSTED_PROXY_HOPS: '2' };

    expect(resolve('1.2.3.4, 198.51.100.7, 10.0.0.9', env).key).toBe('198.51.100.7');
  });

  it('defaults to one hop when TRUSTED_PROXY_HOPS is absent, empty or not a positive integer', () => {
    for (const hops of [undefined, '', '0', '-1', '1.5', 'two', '1000']) {
      expect(
        resolve('1.2.3.4, 198.51.100.7', { TRUST_PROXY: 'true', TRUSTED_PROXY_HOPS: hops }).key,
      ).toBe('198.51.100.7');
    }
  });

  it('uses the only entry when the proxy was the first hop', () => {
    expect(resolve('198.51.100.7').key).toBe('198.51.100.7');
  });

  it('trims whitespace around the entry', () => {
    expect(resolve('  1.2.3.4 ,\t198.51.100.7  ').key).toBe('198.51.100.7');
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['a name instead of an address', 'example.com'],
    ['an address with a port', '198.51.100.7:4711'],
    ['a bracketed IPv6 address', '[2001:db8::1]'],
    ['a trailing comma', '198.51.100.7,'],
    ['an octal-looking IPv4', '010.0.0.1'],
    ['an IPv4 with a missing octet', '1.2.3'],
    ['an IPv4 with an octet over 255', '1.2.3.256'],
    ['an IPv6 zone id', 'fe80::1%eth0'],
    ['an injected value', '1.2.3.4; DROP TABLE'],
  ])('falls back to unknown for %s, and never throws', (_label, forwarded) => {
    expect(resolve(forwarded)).toStrictEqual(UNKNOWN_CLIENT_IP);
  });

  it('falls back to unknown when the header has fewer entries than there are trusted hops', () => {
    const env = { TRUST_PROXY: 'true', TRUSTED_PROXY_HOPS: '2' };

    expect(resolve(undefined, env)).toStrictEqual(UNKNOWN_CLIENT_IP);
    expect(resolve('', env)).toStrictEqual(UNKNOWN_CLIENT_IP);
    expect(resolve('198.51.100.7', env)).toStrictEqual(UNKNOWN_CLIENT_IP);
  });

  it('falls back to unknown when the entry at the trusted position is itself invalid', () => {
    expect(resolve('198.51.100.7, not-an-ip')).toStrictEqual(UNKNOWN_CLIENT_IP);
  });
});

describe('address normalization', () => {
  it.each([
    ['::ffff:203.0.113.5', '203.0.113.5'],
    ['::FFFF:203.0.113.5', '203.0.113.5'],
    ['::ffff:cb00:7105', '203.0.113.5'],
    ['0:0:0:0:0:ffff:cb00:7105', '203.0.113.5'],
  ])('maps IPv4-mapped IPv6 %s to its IPv4 form', (mapped, ipv4) => {
    expect(resolve(mapped)).toStrictEqual({ raw: ipv4, key: ipv4 });
    expect(resolve(mapped).key).toBe(resolve(ipv4).key);
  });

  it('collapses IPv6 to its /64 prefix for the key, and keeps the full address as raw', () => {
    expect(resolve('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toStrictEqual({
      raw: '2001:db8:1:2:aaaa:bbbb:cccc:dddd',
      key: '2001:db8:1:2::/64',
    });
  });

  it('gives every address of one /64 the same key and another /64 another', () => {
    const inside = ['2001:db8:1:2::1', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:DB8:1:2:0:0:0:5'];
    const keys = new Set(inside.map((address) => resolve(address).key));

    expect([...keys]).toStrictEqual(['2001:db8:1:2::/64']);
    expect(resolve('2001:db8:1:3::1').key).not.toBe('2001:db8:1:2::/64');
  });

  it.each([
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:DB8::1', '2001:db8::1'],
    ['::1', '::1'],
    ['::', '::'],
    ['1:0:0:2:0:0:0:3', '1:0:0:2::3'],
    ['1:0:2:0:3:0:4:5', '1:0:2:0:3:0:4:5'],
    ['fe80:0:0:0:1:0:0:1', 'fe80::1:0:0:1'],
    ['::192.0.2.1', '::c000:201'],
  ])('writes %s as %s', (address, expected) => {
    expect(resolve(address).raw).toBe(expected);
  });

  it('keeps distinct IPv4 addresses distinct', () => {
    expect(resolve('203.0.113.5').key).not.toBe(resolve('203.0.113.6').key);
  });
});

describe('clientIpConfigurationWarnings', () => {
  it('is silent outside production, whatever the proxy settings', () => {
    expect(clientIpConfigurationWarnings({ NODE_ENV: 'development' })).toStrictEqual([]);
    expect(clientIpConfigurationWarnings({ NODE_ENV: 'test', TRUST_PROXY: 'false' })).toStrictEqual(
      [],
    );
  });

  it('warns in production when no proxy is trusted, because all clients then share one key', () => {
    const [warning, ...others] = clientIpConfigurationWarnings({ NODE_ENV: 'production' });

    expect(warning).toMatch(/TRUST_PROXY/);
    expect(warning).toMatch(/unknown/);
    expect(others).toStrictEqual([]);
  });

  it('warns in production about a hop count that is not a positive integer', () => {
    const [warning] = clientIpConfigurationWarnings({
      NODE_ENV: 'production',
      TRUST_PROXY: 'true',
      TRUSTED_PROXY_HOPS: 'many',
    });

    expect(warning).toMatch(/TRUSTED_PROXY_HOPS/);
  });

  it('is silent in production behind a configured proxy', () => {
    expect(
      clientIpConfigurationWarnings({
        NODE_ENV: 'production',
        TRUST_PROXY: 'true',
        TRUSTED_PROXY_HOPS: '2',
      }),
    ).toStrictEqual([]);
    expect(
      clientIpConfigurationWarnings({ NODE_ENV: 'production', TRUST_PROXY: 'true' }),
    ).toStrictEqual([]);
  });
});

describe('warnAboutClientIpConfiguration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints each warning once, prefixed, and nothing when the configuration is sound', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    warnAboutClientIpConfiguration({ NODE_ENV: 'production' });
    warnAboutClientIpConfiguration({ NODE_ENV: 'production', TRUST_PROXY: 'true' });
    warnAboutClientIpConfiguration({ NODE_ENV: 'development' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/^\[securedesk\] TRUST_PROXY/);
  });
});
