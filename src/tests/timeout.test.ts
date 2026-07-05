import { retry } from '../index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('retry-x - Timeout Functionality', () => {
  
  it('should respect timeout per attempt', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500
      });
    }, (error: unknown) => {
      assert.match((error as Error).message, /Operation failed after 2 attempts/);
      return true;
    });
    assert.equal(callCount, 2);
  });

  it('should complete successfully before timeout', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'success';
    }, {
      maxAttempts: 3,
      timeout: 1000
    });

    assert.equal(callCount, 1);
    assert.equal(result.value, 'success');
  });

  it('should handle timeout with retries', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 800));
        return 'success';
      }, {
        maxAttempts: 3,
        timeout: 500,
        delay: 100
      });
    });
    
    // All 3 attempts should be made (timeout is per-attempt, not a total limit)
    assert.equal(callCount, 3);
  });

  it('should combine timeout with backoff', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        // Always slow — both attempts will timeout
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500,
        delay: 100,
        backoff: 'exponential'
      });
    }, (error: unknown) => {
      assert.match((error as Error).message, /Operation failed after 2 attempts/);
      return true;
    });
    
    const totalTime = Date.now() - startTime;
    // 2 timeouts (500ms each) + exponential delay (100ms) = ~1100ms
    assert.equal(callCount, 2);
    assert.ok(totalTime >= 1000, `totalTime ${totalTime} should be >= 1000`);
    assert.ok(totalTime < 1500, `totalTime ${totalTime} should be < 1500`);
  });

  it('should continue retrying after timeout', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return 'success';
    }, {
      maxAttempts: 3,
      timeout: 500
    });

    assert.equal(callCount, 2);
    assert.equal(result.value, 'success');
    assert.equal(result.stats.attempts, 2);
  });

  it('should handle timeout with custom retry conditions', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 800));
        throw new Error('Operation took too long');
      }, {
        maxAttempts: 3,
        timeout: 500,
        shouldRetry: (error: Error) => {
          return error.message === 'Operation timed out after 500ms';
        }
      });
    });
    
    // All 3 attempts should timeout (shouldRetry matches timeout error)
    assert.equal(callCount, 3);
  });

  it('should provide accurate timing with timeout', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500
      });
    });
    
    // Both attempts timeout (no delay between retries by default = 1000ms delay)
    assert.equal(callCount, 2);
    const totalTime = Date.now() - startTime;
    // 2 timeouts (500ms each) + 1 default delay (1000ms) = ~2000ms
    assert.ok(totalTime >= 1500, `totalTime ${totalTime} should be >= 1500`);
  });

  it('should handle timeout with monitoring callbacks', async () => {
    const callbackOrder: string[] = [];
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        callbackOrder.push(`start-${callCount}`);
        await new Promise(resolve => setTimeout(resolve, 800));
        callbackOrder.push(`end-${callCount}`);
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500,
        onAttempt: (attempt: number) => {
          callbackOrder.push(`attempt-${attempt}`);
        }
      });
      assert.fail('Should have thrown');
    } catch {
      // expected
    }
    
    // Both attempts fire callbacks. The fn body runs synchronously up to the await,
    // so start-N is pushed before timeout fires. end-N may or may not be pushed
    // depending on timing (background promise completion).
    // onAttempt fires before fn starts (per implementation: onAttempt is called at
    // the start of executeAttempt, before fn()).
    assert.equal(callCount, 2);
    assert.ok(callbackOrder.includes('attempt-1'), 'should have attempt-1 callback');
    assert.ok(callbackOrder.includes('attempt-2'), 'should have attempt-2 callback');
    assert.ok(callbackOrder.includes('start-1'), 'should have start-1');
    assert.ok(callbackOrder.includes('start-2'), 'should have start-2');
  });

  it('should delay between retries after timeout', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 800));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500,
        delay: 200
      });
    });
    
    const totalTime = Date.now() - startTime;
    // Timeout is per-attempt; both attempts will timeout and retry continues
    // 2 timeouts (500ms each) + 1 delay (200ms) = ~1200ms
    assert.equal(callCount, 2);
    assert.ok(totalTime >= 1000, `totalTime ${totalTime} should be >= 1000`);
    assert.ok(totalTime < 1500, `totalTime ${totalTime} should be < 1500`);
  });
});
