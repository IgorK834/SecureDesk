import type { AppDb } from '../db/connection';
import { clock } from '../time/clock';
import { clearIpBlock, listIpBlocks } from './attempt-tracker';
import { recordSecurityEvent } from './events';
import { readSecuritySettings } from './settings';

export function getIpBlocks(db: AppDb) {
  return listIpBlocks(db, clock.now(), readSecuritySettings(db).ipFailedAttemptLimit);
}

export function clearAddressBlock(
  db: AppDb,
  ipKey: string,
  actor: { adminId: string; requestId: string },
): void {
  clearIpBlock(db, ipKey, clock.now());
  recordSecurityEvent(db, {
    type: 'IP_BLOCK_CLEARED_BY_ADMIN',
    requestId: actor.requestId,
    ipKey,
    details: { adminId: actor.adminId, clearedIpKey: ipKey },
  });
}
