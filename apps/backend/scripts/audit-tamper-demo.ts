import { runAuditTamperDemo } from './audit-tamper-demo/demo';

runAuditTamperDemo(process.env, console.log).catch((error: unknown) => {
  console.error(
    'audit:tamper-demo failed:',
    error instanceof Error ? error.message : 'unexpected error',
  );
  process.exitCode = 1;
});
