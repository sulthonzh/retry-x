import { retry, RetryError } from '../index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('retry-x - Basic Functionality', () => {
  
  it('should succeed on first attempt', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      return { success: true, data: 'test' };
    });

    assert.equal(callCount, 1);
    assert.deepEqual(result.value, { success: true, data: 'test' });
    assert.equal(result.stats.attempts, 1);
    assert.equal(result.stats.success, true);
    assert.equal(result.stats.retries, 0);
  });

  it('should retry and succeed on second attempt', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return { success: true, data: 'retry success' };
    });

    assert.equal(callCount, 2);
    assert.deepEqual(result.value, { success: true, data: 'retry success' });
    assert.equal(result.stats.attempts, 2);
    assert.equal(result.stats.success, true);
    assert.equal(result.stats.retries, 1);
  });

  it('should exhaust max attempts and throw error', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error(`Attempt ${callCount} failed`);
      }, {
        maxAttempts: 3
      });
    }, (error: unknown) => {
      assert.ok(error instanceof RetryError);
      const e = error as RetryError;
      assert.equal(e.attempt, 3);
      assert.equal(e.totalAttempts, 3);
      return true;
    });
    assert.equal(callCount, 3);
  });

  it('should respect custom delay between retries', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error('Failed');
      }, {
        maxAttempts: 3,
        delay: 500
      });
    });
    
    const totalTime = Date.now() - startTime;
    // Should be approximately 1000ms (2 retries * 500ms delay)
    assert.ok(totalTime > 900, `totalTime ${totalTime} should be > 900`);
    assert.ok(totalTime < 1200, `totalTime ${totalTime} should be < 1200`);
    assert.equal(callCount, 3);
  });

  it('should use fixed backoff strategy', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Failed');
        }
        return 'success';
      }, {
        maxAttempts: 3,
        delay: 200,
        backoff: 'fixed'
      });
      assert.fail('Should have thrown');
    } catch (error: unknown) {
      assert.ok(error instanceof RetryError);
      const e = error as RetryError;
      // Fixed backoff should have same delay each time
      assert.equal(e.delays[0], 200);
      assert.equal(e.delays[1], 200);
    }
  });

  it('should use exponential backoff strategy', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount < 4) {
          throw new Error('Failed');
        }
        return 'success';
      }, {
        maxAttempts: 4,
        delay: 100,
        backoff: 'exponential',
        maxDelay: 1000
      });
      assert.fail('Should have thrown');
    } catch (error: unknown) {
      assert.ok(error instanceof RetryError);
      const e = error as RetryError;
      // Exponential backoff: 100, 200, 400
      assert.equal(e.delays[0], 100);
      assert.equal(e.delays[1], 200);
      assert.equal(e.delays[2], 400);
    }
  });

  it('should use linear backoff strategy', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount < 4) {
          throw new Error('Failed');
        }
        return 'success';
      }, {
        maxAttempts: 4,
        delay: 100,
        backoff: 'linear',
        maxDelay: 500
      });
      assert.fail('Should have thrown');
    } catch (error: unknown) {
      assert.ok(error instanceof RetryError);
      const e = error as RetryError;
      // Linear backoff: 100, 200, 300
      assert.equal(e.delays[0], 100);
      assert.equal(e.delays[1], 200);
      assert.equal(e.delays[2], 300);
    }
  });

  it('should use fibonacci backoff strategy', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount < 5) {
          throw new Error('Failed');
        }
        return 'success';
      }, {
        maxAttempts: 5,
        delay: 100,
        backoff: 'fibonacci'
      });
      assert.fail('Should have thrown');
    } catch (error: unknown) {
      assert.ok(error instanceof RetryError);
      const e = error as RetryError;
      // Fibonacci backoff: 100, 100, 200, 300
      assert.equal(e.delays[0], 100);
      assert.equal(e.delays[1], 100);
      assert.equal(e.delays[2], 200);
      assert.equal(e.delays[3], 300);
    }
  });

  it('should apply jitter when enabled', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Failed');
        }
        return 'success';
      }, {
        maxAttempts: 3,
        delay: 100,
        backoff: 'fixed',
        jitter: true
      });
      assert.fail('Should have thrown');
    } catch (error: unknown) {
      assert.ok(error instanceof RetryError);
      const delays = (error as RetryError).delays;
      
      // With jitter, delays should be different (usually less than base delay)
      assert.ok(delays[0]! < 100, `delay[0] ${delays[0]} should be < 100`);
      assert.ok(delays[1]! < 100, `delay[1] ${delays[1]} should be < 100`);
      assert.ok(delays[0]! >= 0, `delay[0] ${delays[0]} should be >= 0`);
      assert.ok(delays[1]! >= 0, `delay[1] ${delays[1]} should be >= 0`);
    }
  });

  it('should respect maxDelay limit', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount < 5) {
          throw new Error('Failed');
        }
        return 'success';
      }, {
        maxAttempts: 5,
        delay: 1000,
        backoff: 'exponential',
        maxDelay: 2000
      });
      assert.fail('Should have thrown');
    } catch (error: unknown) {
      assert.ok(error instanceof RetryError);
      const delays = (error as RetryError).delays;
      
      // Should be capped at maxDelay: 1000, 2000, 2000, 2000
      assert.equal(delays[0], 1000);
      assert.equal(delays[1], 2000);
      assert.equal(delays[2], 2000);
      assert.equal(delays[3], 2000);
    }
  });

  it('should handle synchronous functions that return promises', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      return Promise.resolve({ success: true, count: callCount });
    });

    assert.equal(callCount, 1);
    assert.deepEqual(result.value, { success: true, count: 1 });
  });

  it('should provide correct retry statistics', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return { success: true, data: 'retry success' };
    });

    assert.equal(result.stats.attempts, 2);
    assert.equal(result.stats.retries, 1);
    assert.equal(result.stats.success, true);
    assert.equal(result.stats.delays.length, 1);
    assert.equal(result.stats.delays[0], 1000); // default delay
  });
});
