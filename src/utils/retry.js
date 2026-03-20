const RETRYABLE_CODES = new Set(['ETIMEDOUT', 'ECONNRESET']);
const RETRYABLE_STATUSES = new Set([429, 503]);

async function withRetry(fn, { maxRetries = 2, baseDelay = 1000, retryOn } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt >= maxRetries;
      const isRetryable = retryOn
        ? retryOn(err)
        : RETRYABLE_STATUSES.has(err.status) ||
          RETRYABLE_CODES.has(err.code) ||
          (err.message && err.message.includes('timeout'));

      if (isLast || !isRetryable) throw err;

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = { withRetry };
