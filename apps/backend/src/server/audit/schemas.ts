import { z } from 'zod';
import { AUDIT_ACTIONS, type AuditAction } from './events';

export const AUDIT_ACTION_CODES = Object.keys(AUDIT_ACTIONS).sort() as AuditAction[];
const date = z.iso.datetime().transform((value) => new Date(value).toISOString());
const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.int().positive());
const filters = {
  user: z.string().trim().min(1).max(128).optional(),
  action: z.array(z.enum(AUDIT_ACTION_CODES)).min(1).max(AUDIT_ACTION_CODES.length).optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
  from: date.optional(),
  to: date.optional(),
};
const validRange = ({ from, to }: { from?: string; to?: string }) => !from || !to || from <= to;

export const AuditListQuery = z
  .strictObject({
    ...filters,
    action: z.preprocess(
      (input) => (typeof input === 'string' ? input.split(',') : input),
      filters.action,
    ),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.pipe(z.number().max(100)).default(20),
  })
  .refine(validRange)
  .refine(({ page, pageSize }) => Number.isSafeInteger((page - 1) * pageSize));

export const AuditSeqParams = z.strictObject({ seq: positiveInteger });

export const AuditExportBody = z
  .strictObject({ ...filters, format: z.enum(['csv', 'jsonl']) })
  .refine(validRange);

export type AuditExportRequest = z.output<typeof AuditExportBody>;
export type AuditFilters = Omit<AuditExportRequest, 'format'>;
export type AuditListRequest = z.output<typeof AuditListQuery>;
