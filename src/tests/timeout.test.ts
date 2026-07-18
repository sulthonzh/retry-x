import { retry, RetryError } from '../index.js';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Track timers so we can clean them up to prevent test runner hangs.
// When timeout fires via Promise.race, the underlying fn() promise keeps
// running in the background. We must clean up those lingering timers.
const pendingTimers: NodeJS.Timeout[] = [];

function trackTimer(timer: NodeJS.Timeout): NodeJS.Timeout {
  // unref prevents the timer from keeping the event loop alive
  // so the test runner can exit cleanly after tests complete
  timer.unref?.();
  pendingTimers.push(timer);
  return timer;
}

function cleanupTimers(): void {
  for (const timer of pendingTimers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  pendingTimers.length = 0;
}

afterEach(() => {
  cleanupTimers();
});

describe('retry-x - Timeout Functionality', () => {
  
  it('should respect timeout per attempt', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        // Use tracked timer so it's cleaned up after test
        await new Promise(resolve => {
          const t = setTimeout(resolve, 500);
          trackTimer(t);
        });
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 50
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
      await new Promise(resolve => setTimeout(resolve, 50));
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
        await new Promise(resolve => {
          const t = setTimeout(resolve, 300);
          trackTimer(t);
        });
        return 'success';
      }, {
        maxAttempts: 3,
        timeout: 50,
        delay: 10
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
        await new Promise(resolve => {
          const t = setTimeout(resolve, 500);
          trackTimer(t);
        });
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 50,
        delay: 20,
        backoff: 'exponential'
      });
    }, (error: unknown) => {
      assert.match((error as Error).message, /Operation failed after 2 attempts/);
      return true;
    });
    
    const totalTime = Date.now() - startTime;
    // 2 timeouts (50ms each) + exponential delay (20ms) = ~120ms
    assert.equal(callCount, 2);
    assert.ok(totalTime >= 100, `totalTime ${totalTime} should be >= 100`);
    assert.ok(totalTime < 400, `totalTime ${totalTime} should be < 400`);
  });

  it('should continue retrying after timeout', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        await new Promise(resolve => {
          const t = setTimeout(resolve, 300);
          trackTimer(t);
        });
      } else {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return 'success';
    }, {
      maxAttempts: 3,
      timeout: 50
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
        await new Promise(resolve => {
          const t = setTimeout(resolve, 300);
          trackTimer(t);
        });
        throw new Error('Operation took too long');
      }, {
        maxAttempts: 3,
        timeout: 50,
        shouldRetry: (error: Error) => {
          return error.message === 'Operation timed out after 50ms';
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
        await new Promise(resolve => {
          const t = setTimeout(resolve, 400);
          trackTimer(t);
        });
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 50,
        delay: 50
      });
    });
    
    assert.equal(callCount, 2);
    const totalTime = Date.now() - startTime;
    // 2 timeouts (50ms each) + 1 delay (50ms) = ~150ms
    assert.ok(totalTime >= 100, `totalTime ${totalTime} should be >= 100`);
  });

  it('should handle timeout with monitoring callbacks', async () => {
    const callbackOrder: string[] = [];
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        callbackOrder.push(`start-${callCount}`);
        await new Promise(resolve => {
          const t = setTimeout(resolve, 300);
          trackTimer(t);
        });
        callbackOrder.push(`end-${callCount}`);
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 50,
        onAttempt: (attempt: number) => {
          callbackOrder.push(`attempt-${attempt}`);
        }
      });
      assert.fail('Should have thrown');
    } catch {
      // expected
    }
    
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
        await new Promise(resolve => {
          const t = setTimeout(resolve, 300);
          trackTimer(t);
        });
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 50,
        delay: 50
      });
    });
    
    const totalTime = Date.now() - startTime;
    // Timeout is per-attempt; both attempts will timeout and retry continues
    // 2 timeouts (50ms each) + 1 delay (50ms) = ~150ms
    assert.equal(callCount, 2);
    assert.ok(totalTime >= 120, `totalTime ${totalTime} should be >= 120`);
    assert.ok(totalTime < 400, `totalTime ${totalTime} should be < 400`);
  });

  it('should throw RetryError with timeout info', async () => {
    await assert.rejects(async () => {
      await retry(async () => {
        await new Promise(resolve => {
          const t = setTimeout(resolve, 500);
          trackTimer(t);
        });
        return 'success';
      }, {
        maxAttempts: 1,
        timeout: 30
      });
    }, (error: unknown) => {
      assert.ok(error instanceof RetryError);
      assert.match((error as Error).message, /Operation failed after 1 attempts/);
      assert.match((error as Error).message, /Operation timed out after 30ms/);
      return true;
    });
  });
});
