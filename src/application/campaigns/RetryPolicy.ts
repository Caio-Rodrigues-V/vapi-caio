export type RetryPolicyOptions = {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

export class RetryPolicy {
  constructor(private readonly options: RetryPolicyOptions) {}

  nextAttempt(attempts: number, now = Date.now()): Date {
    const exponent = Math.max(0, attempts);
    const rawDelay = Math.min(this.options.maxDelayMs, this.options.baseDelayMs * 2 ** exponent);
    const jitter = rawDelay * this.options.jitterRatio * Math.random();
    return new Date(now + Math.round(rawDelay + jitter));
  }
}
