import { z } from 'zod';
import { SECURITY_EVENT_SEVERITIES } from '../db/schema';

export const detectionAlertDetails = z.strictObject({
  alertId: z.uuid(),
  ruleId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9_]+$/),
  severity: z.enum(SECURITY_EVENT_SEVERITIES),
  subject: z.string().max(384).nullable(),
  count: z.int().positive(),
  windowMinutes: z.int().nonnegative(),
  auditSeq: z.int().positive(),
  firstSeq: z.int().positive().optional(),
  lastSeq: z.int().positive().optional(),
  elapsedMs: z.int().nonnegative().optional(),
});

export type DetectionAlertDetails = z.output<typeof detectionAlertDetails>;
