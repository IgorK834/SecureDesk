import { z } from 'zod';

export const integrityProblemKind = z.enum([
  'HASH_MISMATCH',
  'CHAIN_BROKEN',
  'SEQUENCE_GAP',
  'GENESIS_MISMATCH',
  'MALFORMED_ROW',
  'HEAD_MISMATCH',
]);
export const integrityProblem = z.strictObject({
  seq: z.int().nullable(),
  id: z.string().max(128).nullable(),
  kind: integrityProblemKind,
});
export type IntegrityProblem = z.output<typeof integrityProblem>;
export type IntegrityWarning = 'ANCHOR_MISSING';
const summary = {
  checkedEntries: z.int().nonnegative(),
  warnings: z.array(z.literal('ANCHOR_MISSING')).max(1),
};
export const intactVerificationDetails = z.strictObject(summary);
export const tamperedVerificationDetails = z.strictObject({
  ...summary,
  firstProblem: integrityProblem,
});
