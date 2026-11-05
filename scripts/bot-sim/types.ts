export const PROTECTIONS = ['captcha', 'accountLock', 'ipBlock', 'honeypot', 'honeytoken'] as const;

export type Protection = (typeof PROTECTIONS)[number];

export interface HttpEvidence {
  label: string;
  status: number;
  code?: string;
}

export interface ScenarioResult {
  id: string;
  name: string;
  evidence: HttpEvidence[];
  events: string[];
  protections: Record<Protection, boolean>;
}

export interface BotSimReport {
  version: 1;
  target: string;
  scenarios: ScenarioResult[];
}
