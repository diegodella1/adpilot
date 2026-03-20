const { withRetry } = require('../../src/utils/retry');

describe('withRetry', () => {
  test('returns value on success', async () => {
    const result = await withRetry(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  test('retries on 429 and succeeds', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 2) {
        const err = new Error('rate limit');
        err.status = 429;
        throw err;
      }
      return 'ok';
    };
    const result = await withRetry(fn, { baseDelay: 10 });
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('retries on 503', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 2) {
        const err = new Error('service unavailable');
        err.status = 503;
        throw err;
      }
      return 'ok';
    };
    const result = await withRetry(fn, { baseDelay: 10 });
    expect(result).toBe('ok');
  });

  test('retries on ETIMEDOUT', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 2) {
        const err = new Error('timed out');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      return 'ok';
    };
    const result = await withRetry(fn, { baseDelay: 10 });
    expect(result).toBe('ok');
  });

  test('retries on ECONNRESET', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 2) {
        const err = new Error('reset');
        err.code = 'ECONNRESET';
        throw err;
      }
      return 'ok';
    };
    const result = await withRetry(fn, { baseDelay: 10 });
    expect(result).toBe('ok');
  });

  test('retries on timeout in message', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 2) throw new Error('request timeout');
      return 'ok';
    };
    const result = await withRetry(fn, { baseDelay: 10 });
    expect(result).toBe('ok');
  });

  test('does not retry non-retryable errors', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      throw new Error('bad request');
    };
    await expect(withRetry(fn, { baseDelay: 10 })).rejects.toThrow('bad request');
    expect(attempts).toBe(1);
  });

  test('throws after maxRetries exhausted', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      const err = new Error('rate limit');
      err.status = 429;
      throw err;
    };
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow('rate limit');
    expect(attempts).toBe(3); // initial + 2 retries
  });

  test('custom retryOn predicate', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 2) throw new Error('custom error');
      return 'ok';
    };
    const result = await withRetry(fn, {
      baseDelay: 10,
      retryOn: (err) => err.message === 'custom error',
    });
    expect(result).toBe('ok');
  });
});
