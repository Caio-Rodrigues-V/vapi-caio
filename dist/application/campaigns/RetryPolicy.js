"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryPolicy = void 0;
class RetryPolicy {
    options;
    constructor(options) {
        this.options = options;
    }
    nextAttempt(attempts, now = Date.now()) {
        const exponent = Math.max(0, attempts);
        const rawDelay = Math.min(this.options.maxDelayMs, this.options.baseDelayMs * 2 ** exponent);
        const jitter = rawDelay * this.options.jitterRatio * Math.random();
        return new Date(now + Math.round(rawDelay + jitter));
    }
}
exports.RetryPolicy = RetryPolicy;
//# sourceMappingURL=RetryPolicy.js.map