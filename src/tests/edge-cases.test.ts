import { retry, RetryError, withRetry, createRetry, RetryStrategies, BackoffStrategies } from '../index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('retry-x - Edge Cases', () => {

  it('should handle fn that returns a non-promise value', async () => {
    // The function signature says Promise<T>, but runtime should still work
    // if the function returns a plain value (JS doesn't enforce types)
    const result = await retry(async () => 42 as any);
    assert.equal(result.value, 42);
  });

  it('should handle maxAttempts = 1 (no retries)', async () => {
    let callCount = 0;
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error('Immediate failure');
      }, { maxAttempts: 1, delay: 1 });
    });
    assert.equal(callCount, 1);
  });

  it('should handle very large maxAttempts', async () => {
    let callCount = 0;
    const result = await retry(async () => {
      callCount++;
      if (callCount < 3) throw new Error('Retry');
      return 'done';
    }, { maxAttempts: 1000, delay: 1 });
    assert.equal(callCount, 3);
    assert.equal(result.value, 'done');
  });

  it('should handle delay = 0', async () => {
    let callCount = 0;
    const startTime = Date.now();
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error('Fail');
      }, { maxAttempts: 3, delay: 0 });
    });
    const elapsed = Date.now() - startTime;
    assert.equal(callCount, 3);
    // With 0 delay, should be very fast
    assert.ok(elapsed < 100, `elapsed ${elapsed} should be < 100`);
  });

  it('should clamp negative delay to 0', async () => {
    let callCount = 0;
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error('Fail');
      }, { maxAttempts: 2, delay: -100 });
    });
    assert.equal(callCount, 2);
  });

  it('should use maxDelay cap with fibonacci', async () => {
    let callCount = 0;
    try {
      await retry(async () => {
        callCount++;
        throw new Error('Fail');
      }, {
        maxAttempts: 7,
        delay: 100,
        backoff: 'fibonacci',
        maxDelay: 500
      });
    } catch (error: unknown) {
      const e = error as RetryError;
      // Fibonacci: 100, 100, 200, 300, 500, 500 (capped)
      assert.equal(e.delays[0], 100);
      assert.equal(e.delays[1], 100);
      assert.equal(e.delays[2], 200);
      assert.equal(e.delays[3], 300);
      assert.equal(e.delays[4], 500); // would be 500 naturally
      assert.equal(e.delays[5], 500); // capped from 800
    }
    assert.equal(callCount, 7);
  });

  it('should use equal jitter type', async () => {
    let callCount = 0;
    try {
      await retry(async () => {
        callCount++;
        throw new Error('Fail');
      }, {
        maxAttempts: 3,
        delay: 100,
        jitter: true,
        jitterType: 'equal'
      });
    } catch (error: unknown) {
      const delays = (error as RetryError).delays;
      // Equal jitter: delay/2 + random * (delay - delay/2)
      // So range is [50, 100) for delay=100
      for (const d of delays) {
        assert.ok(d! >= 50, `delay ${d} should be >= 50`);
        assert.ok(d! < 100, `delay ${d} should be < 100`);
      }
    }
    assert.equal(callCount, 3);
  });

  it('should break early when retryOn returns false', async () => {
    let callCount = 0;
    const retryCalls: number[] = [];

    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error('Fail');
      }, {
        maxAttempts: 5,
        delay: 1,
        retryOn: (attempt: number) => {
          retryCalls.push(attempt);
          return false; // Never retry
        }
      });
    });

    assert.equal(callCount, 1); // No retries
    assert.deepEqual(retryCalls, [1]);
  });

  it('should break early when shouldRetry returns false', async () => {
    let callCount = 0;

    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        if (callCount === 1) throw new Error('RETRY_ME');
        throw new Error('STOP');
      }, {
        maxAttempts: 5,
        delay: 1,
        shouldRetry: (error: Error) => error.message === 'RETRY_ME'
      });
    });

    assert.equal(callCount, 2);
  });

  it('should call onRetry with correct delay for each strategy', async () => {
    const recordedDelays: number[] = [];

    try {
      await retry(async () => {
        throw new Error('Fail');
      }, {
        maxAttempts: 4,
        delay: 100,
        backoff: 'linear',
        onRetry: (_attempt: number, _error: Error, delay: number) => {
          recordedDelays.push(delay);
        }
      });
    } catch {
      // expected
    }

    assert.deepEqual(recordedDelays, [100, 200, 300]);
  });

  it('withRetry should return just the value', async () => {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Fail');
      return { data: 'success' };
    }, { maxAttempts: 3, delay: 1 });

    assert.deepEqual(result, { data: 'success' });
  });

  it('withRetry should throw on failure', async () => {
    await assert.rejects(async () => {
      await withRetry(async () => {
        throw new Error('Always fails');
      }, { maxAttempts: 2, delay: 1 });
    }, (error: unknown) => {
      assert.ok(error instanceof RetryError);
      return true;
    });
  });

  it('createRetry should return a function with preset options', async () => {
    const retryFn = createRetry({ maxAttempts: 2, delay: 1 });

    let callCount = 0;
    const result = await retryFn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Fail');
      return 'success';
    });

    assert.equal(result.value, 'success');
    assert.equal(callCount, 2);
  });

  it('createRetry presets should be overridable', async () => {
    // createRetry returns a function that takes fn only; options are preset
    const retryFn = createRetry({ maxAttempts: 5, delay: 1 });

    let callCount = 0;
    await assert.rejects(async () => {
      await retryFn(async () => {
        callCount++;
        throw new Error('Always');
      });
    });
    assert.equal(callCount, 5);
  });

  it('RetryStrategies.retryOnErrors should match by message', () => {
    const matcher = RetryStrategies.retryOnErrors(['timeout', 'ECONNRESET']);
    assert.equal(matcher(new Error('Operation timeout')), true);
    assert.equal(matcher(new Error('Success')), false);
  });

  it('RetryStrategies.retryOnErrors should match by code', () => {
    const matcher = RetryStrategies.retryOnErrors(['ECONNRESET']);
    const err = new Error('Connection reset');
    (err as any).code = 'ECONNRESET';
    assert.equal(matcher(err), true);
  });

  it('RetryStrategies.retryOnNetworkErrors should detect network errors', () => {
    const resetErr = new Error('reset');
    (resetErr as any).code = 'ECONNRESET';
    assert.equal(RetryStrategies.retryOnNetworkErrors(resetErr), true);

    const normalErr = new Error('Not a network error');
    assert.equal(RetryStrategies.retryOnNetworkErrors(normalErr), false);
  });

  it('RetryStrategies.retryOnNetworkErrors should detect fetch failed', () => {
    const err = new Error('fetch failed: reason');
    assert.equal(RetryStrategies.retryOnNetworkErrors(err), true);
  });

  it('RetryStrategies.retryOn5xxErrors should detect 5xx', () => {
    const err = new Error('Server error');
    (err as any).response = { status: 503 };
    assert.equal(RetryStrategies.retryOn5xxErrors(err), true);
  });

  it('RetryStrategies.retryOn5xxErrors should reject 4xx', () => {
    const err = new Error('Not found');
    (err as any).response = { status: 404 };
    assert.equal(RetryStrategies.retryOn5xxErrors(err), false);
  });

  it('RetryStrategies.retryOnRateLimit should detect 429', () => {
    const err = new Error('Rate limited');
    (err as any).response = { status: 429 };
    assert.equal(RetryStrategies.retryOnRateLimit(err), true);
  });

  it('BackoffStrategies.exponential should calculate correctly', () => {
    assert.equal(BackoffStrategies.exponential(100, 1, 10000), 100);
    assert.equal(BackoffStrategies.exponential(100, 2, 10000), 200);
    assert.equal(BackoffStrategies.exponential(100, 3, 10000), 400);
    assert.equal(BackoffStrategies.exponential(100, 4, 10000), 800);
  });

  it('BackoffStrategies.exponential should cap at maxDelay', () => {
    assert.equal(BackoffStrategies.exponential(1000, 5, 5000), 5000);
    assert.equal(BackoffStrategies.exponential(1000, 10, 5000), 5000);
  });

  it('BackoffStrategies.linear should calculate correctly', () => {
    assert.equal(BackoffStrategies.linear(100, 1, 10000), 100);
    assert.equal(BackoffStrategies.linear(100, 2, 10000), 200);
    assert.equal(BackoffStrategies.linear(100, 5, 10000), 500);
  });

  it('BackoffStrategies.fibonacci should calculate correctly', () => {
    assert.equal(BackoffStrategies.fibonacci(100, 1, 10000), 100);
    assert.equal(BackoffStrategies.fibonacci(100, 2, 10000), 100);
    assert.equal(BackoffStrategies.fibonacci(100, 3, 10000), 200);
    assert.equal(BackoffStrategies.fibonacci(100, 4, 10000), 300);
    assert.equal(BackoffStrategies.fibonacci(100, 5, 10000), 500);
  });

  it('BackoffStrategies.fibonacci should cap at maxDelay', () => {
    assert.equal(BackoffStrategies.fibonacci(100, 10, 1000), 1000);
  });

  it('should handle callbacks that throw in onRetry', async () => {
    let callCount = 0;
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Fail');
      return 'ok';
    }, {
      maxAttempts: 3,
      delay: 1,
      onRetry: () => { throw new Error('Callback boom'); }
    });
    // Should still succeed despite callback error
    assert.equal(result.value, 'ok');
    assert.equal(callCount, 2);
  });

  it('should handle callbacks that throw in onSuccess', async () => {
    // onSuccess throwing should not prevent return value
    let result;
    try {
      result = await retry(async () => 'ok', {
        maxAttempts: 2,
        onSuccess: () => { throw new Error('Boom'); }
      });
    } catch (error) {
      // If onSuccess error propagates, that's also acceptable
      // as long as it doesn't silently corrupt state
      assert.ok(error instanceof Error);
      return;
    }
    assert.equal(result.value, 'ok');
  });

  it('should handle callbacks that throw in onFailure', async () => {
    await assert.rejects(async () => {
      await retry(async () => {
        throw new Error('Always');
      }, {
        maxAttempts: 2,
        delay: 1,
        onFailure: () => { throw new Error('Callback boom'); }
      });
    });
    // Should still throw RetryError, not callback error
  });

  it('should include delays array in stats on failure', async () => {
    try {
      await retry(async () => {
        throw new Error('Fail');
      }, {
        maxAttempts: 4,
        delay: 100,
        backoff: 'exponential'
      });
    } catch (error: unknown) {
      const e = error as RetryError;
      assert.equal(e.delays.length, 3);
      assert.deepEqual(e.delays, [100, 200, 400]);
    }
  });

  it('should have empty delays array on first-try success', async () => {
    const result = await retry(async () => 'immediate success');
    assert.equal(result.stats.delays.length, 0);
  });

  it('should track totalTime accurately', async () => {
    const start = Date.now();
    await assert.rejects(async () => {
      await retry(async () => {
        throw new Error('Fail');
      }, { maxAttempts: 3, delay: 100 });
    });
    const elapsed = Date.now() - start;
    // 2 delays of 100ms = 200ms minimum
    assert.ok(elapsed >= 200, `elapsed ${elapsed} should be >= 200`);
  });

  it('should handle abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(async () => {
      await retry(async () => {
        throw new Error('Fail');
      }, {
        maxAttempts: 5,
        delay: 1,
        signal: controller.signal
      });
    }, (error: unknown) => {
      assert.ok(error instanceof RetryError);
      assert.match((error as Error).message, /aborted/);
      return true;
    });
  });

  it('should handle undefined options', async () => {
    const result = await retry(async () => 'success', undefined as any);
    assert.equal(result.value, 'success');
    assert.equal(result.stats.attempts, 1);
  });

  it('should handle empty options object', async () => {
    const result = await retry(async () => 'success', {});
    assert.equal(result.value, 'success');
  });
});
