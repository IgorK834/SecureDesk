import { NextResponse } from 'next/server';
import { db } from '../../../../server/db/client';
import { AWS_DECOY_ID } from '../../../../server/db/seeds/honeytokens';
import { defineRoute } from '../../../../server/http/route-handler';
import { triggerHoneytoken } from '../../../../server/security/honeytokens';
import { getClientIp } from '../../../../server/security/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const placeholder = 'DECOY_CREDENTIAL_NOT_CONFIGURED';

export const GET = defineRoute({
  name: 'backup.config_decoy',
  auth: 'public',
  handler: ({ request, requestId }) => {
    triggerHoneytoken({
      tokenId: AWS_DECOY_ID,
      source: 'AWS_KEYS',
      ctx: {
        db,
        ipKey: getClientIp(request),
        requestId,
        userAgent: request.headers.get('user-agent'),
      },
    });

    return NextResponse.json(
      {
        service: 'securedesk-nightly-backup',
        database_host: 'backup-db.internal',
        object_store_host: 's3.eu-central-1.amazonaws.com',
        login: 'backup_admin',
        bucket: 'securedesk-production-backups',
        region: 'eu-central-1',
        aws_access_key_id: process.env.CANARY_DECOY_AWS_ACCESS_KEY_ID?.trim() || placeholder,
        aws_secret_access_key:
          process.env.CANARY_DECOY_AWS_SECRET_ACCESS_KEY?.trim() || placeholder,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  },
});
