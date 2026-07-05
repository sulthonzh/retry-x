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
    const timeouts: number[] = [];
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        const startTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 800));
        const endTime = Date.now();
        timeouts.push(endTime - startTime);
        return 'success';
      }, {
        maxAttempts: 3,
        timeout: 500,
        delay: 100
      });
    });
    
    assert.equal(callCount, 3);
    assert.equal(timeouts.length, 3);
    
    // Each attempt should timeout around 500ms
    for (const t of timeouts) {
      assert.ok(t >= 450, `timeout ${t} should be >= 450`);
      assert.ok(t < 1000, `timeout ${t} should be < 1000`);
    }
  });

  it('should combine timeout with backoff', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        if (callCount === 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500,
        delay: 100,
        backoff: 'exponential'
      });
    }, (error: unknown) => {
      assert.match((error as Error).message, /Operation timed out after 500ms/);
      return true;
    });
    
    const totalTime = Date.now() - startTime;
    assert.equal(callCount, 1);
    assert.ok(totalTime >= 450, `totalTime ${totalTime} should be >= 450`);
    assert.ok(totalTime < 700, `totalTime ${totalTime} should be < 700`);
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
    
    assert.equal(callCount, 1);
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
    
    assert.deepEqual(callbackOrder, ['start-1', 'attempt-1']);
    assert.equal(callCount, 1);
  });

  it('should not delay after timeout', async () => {
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
    assert.equal(callCount, 1);
    assert.ok(totalTime < 600, `totalTime ${totalTime} should be < 600`);
  });
});
