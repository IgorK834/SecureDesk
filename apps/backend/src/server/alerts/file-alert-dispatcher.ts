import { constants } from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { configuredAuditAnchorPath } from '../audit/anchor';
import { sanitizeForLog } from '../audit/sanitize';
import { detectionAlertDetails } from '../detection/details';
import type { AlertDispatcher, AlertResult, SecurityEventRecord } from '../security/alerts';
import { physicalPath, privateFilePath } from '../security/private-file';

export function assertAlertFileConfig(): void {
  const configured = process.env.ALERT_FILE_PATH?.trim();
  if (configured) privateFilePath(configured, 'ALERT_FILE_PATH');
}

export class FileAlertDispatcher implements AlertDispatcher {
  readonly id = 'detection-alert-file';

  constructor(private readonly database: string) {}

  async send(event: SecurityEventRecord): Promise<AlertResult> {
    if (event.type !== 'DETECTION_ALERT') return { outcome: 'SUPPRESSED' };

    const filename = privateFilePath(
      process.env.ALERT_FILE_PATH?.trim() ||
        path.join(path.dirname(this.database), 'alerts', 'security-alerts.jsonl'),
      'ALERT_FILE_PATH',
    );
    const anchor = configuredAuditAnchorPath(this.database);
    const anchorPath =
      anchor && path.join(physicalPath(path.dirname(anchor)), path.basename(anchor));
    if (
      ['', '-wal', '-shm', '-journal'].some(
        (suffix) => filename === physicalPath(this.database + suffix),
      ) ||
      filename === anchorPath
    ) {
      throw new Error('ALERT_FILE_PATH must be separate from the database and audit anchor.');
    }

    const directory = path.dirname(filename);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (((await stat(directory)).mode & 0o777) !== 0o700) {
      throw new Error('The alert directory must have mode 0700.');
    }

    const details = detectionAlertDetails.parse(event.details);
    const line =
      JSON.stringify({
        ...details,
        subject: details.subject === null ? null : sanitizeForLog(details.subject, 384),
        time: event.occurredAt.toISOString(),
      }) + '\n';
    const file = await open(
      filename,
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const status = await file.stat();
      if (!status.isFile() || (status.mode & 0o777) !== 0o600 || status.nlink !== 1) {
        throw new Error('The alert file must be private and have mode 0600.');
      }
      await file.appendFile(line);
    } finally {
      await file.close();
    }
    return { outcome: 'SENT' };
  }
}
