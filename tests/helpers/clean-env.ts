// Runs before every test file, so the results do not depend on what a developer's shell has
// loaded from `.env`. `.env.example` sets NODE_ENV=development and COOKIE_SECURE=false, and with
// those two exported hundreds of tests fail: Vitest keeps an existing NODE_ENV instead of using
// 'test', and the cookie name and attributes follow COOKIE_SECURE. A test that needs another value
// sets it itself with `vi.stubEnv`.
//
// Assigned directly, not with `vi.stubEnv`: tests call `vi.unstubAllEnvs()`, which would put the
// shell's value back in the middle of a file.
//
// Through a plain record, because Next's types declare NODE_ENV read-only.
const env: Record<string, string | undefined> = process.env;
env.NODE_ENV = 'test';
delete env.COOKIE_SECURE;
