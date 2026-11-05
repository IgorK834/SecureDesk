export const MAX_REQUESTS_PER_SECOND = 20;
export const MAX_TOTAL_REQUESTS = 150;

export interface RequestBudgetOptions {
  requestsPerSecond?: number;
  maxTotal?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Fixed upper bounds plus pacing: the simulator cannot accidentally become a load generator. */
export class RequestBudget {
  private readonly intervalMs: number;
  private readonly maxTotal: number;
  private readonly now: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private count = 0;
  private nextAt = 0;

  constructor(options: RequestBudgetOptions = {}) {
    const requestsPerSecond = options.requestsPerSecond ?? MAX_REQUESTS_PER_SECOND;
    const maxTotal = options.maxTotal ?? MAX_TOTAL_REQUESTS;
    if (
      !Number.isInteger(requestsPerSecond) ||
      requestsPerSecond < 1 ||
      requestsPerSecond > MAX_REQUESTS_PER_SECOND
    ) {
      throw new Error(`requestsPerSecond must be between 1 and ${MAX_REQUESTS_PER_SECOND}.`);
    }
    if (!Number.isInteger(maxTotal) || maxTotal < 1 || maxTotal > MAX_TOTAL_REQUESTS) {
      throw new Error(`maxTotal must be between 1 and ${MAX_TOTAL_REQUESTS}.`);
    }
    this.intervalMs = 1_000 / requestsPerSecond;
    this.maxTotal = maxTotal;
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? sleep;
  }

  async claim(): Promise<void> {
    if (this.count >= this.maxTotal) {
      throw new Error(`Request budget exhausted at ${this.maxTotal} requests.`);
    }
    const delay = Math.max(0, this.nextAt - this.now());
    if (delay > 0) await this.wait(delay);
    const admittedAt = Math.max(this.now(), this.nextAt);
    this.nextAt = admittedAt + this.intervalMs;
    this.count += 1;
  }

  get used(): number {
    return this.count;
  }
}
