// Fixture for route-guard-conformance.test.ts: a handler NOT built with defineRoute. The scan
// must flag it, because nothing authenticates or authorizes it.
export const GET = async () => new Response('anyone can read this');
