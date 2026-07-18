import { retry } from '../index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('retry-x - Monitoring and Callbacks', () => {
  
  it('should call onAttempt for each attempt', async () => {
    const attemptCalls: number[] = [];
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    }, {
      maxAttempts: 3,
      delay: 10,
      onAttempt: (attempt: number) => {
        attemptCalls.push(attempt);
      }
    });

    assert.deepEqual(attemptCalls, [1, 2]);
    assert.equal(callCount, 2);
    assert.equal(result.value, 'success');
  });

  it('should call onAttempt with errors', async () => {
    const attemptCalls: { attempt: number; error?: Error }[] = [];
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        throw new Error(`Attempt ${callCount} failed`);
      }, {
        maxAttempts: 3,
        delay: 10,
        onAttempt: (attempt: number, error?: Error) => {
          if (error) {
            attemptCalls.push({ attempt, error });
          } else {
            attemptCalls.push({ attempt });
          }
        }
      });
      assert.fail('Should have thrown');
    } catch {
      // expected
    }
    
    assert.equal(attemptCalls.length, 3);
    assert.equal(attemptCalls[0]!.attempt, 1);
    assert.equal(attemptCalls[1]!.attempt, 2);
    assert.equal(attemptCalls[2]!.attempt, 3);
    // Errors are undefined on first attempt, set after each failure
    if (attemptCalls[1]!.error) {
      assert.equal(attemptCalls[1]!.error.message, 'Attempt 1 failed');
    }
  });

  it('should call onRetry for each retry', async () => {
    const retryCalls: { attempt: number; error: Error; delay: number }[] = [];
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    }, {
      maxAttempts: 3,
      delay: 50,
      onRetry: (attempt: number, error: Error, delay: number) => {
        retryCalls.push({ attempt, error, delay });
      }
    });

    assert.equal(retryCalls.length, 1);
    assert.equal(retryCalls[0]!.attempt, 2);
    assert.equal(retryCalls[0]!.delay, 50);
    assert.equal(retryCalls[0]!.error.message, 'First attempt failed');
    assert.equal(result.value, 'success');
  });

  it('should call onSuccess on successful completion', async () => {
    const successCalls: { result: unknown; attempts: number; totalTime: number }[] = [];
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Failed');
      }
      return { data: 'success' };
    }, {
      maxAttempts: 3,
      delay: 10,
      onSuccess: (result: unknown, attempts: number, totalTime: number) => {
        successCalls.push({ result, attempts, totalTime });
      }
    });

    assert.equal(successCalls.length, 1);
    assert.deepEqual(successCalls[0]!.result, { data: 'success' });
    assert.equal(successCalls[0]!.attempts, 2);
    assert.ok(successCalls[0]!.totalTime > 0);
    assert.deepEqual(result.value, { data: 'success' });
  });

  it('should call onFailure on final failure', async () => {
    const failureCalls: { error: Error; attempts: number; totalTime: number }[] = [];
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        throw new Error('Always fails');
      }, {
        maxAttempts: 3,
        delay: 10,
        onFailure: (error: Error, attempts: number, totalTime: number) => {
          failureCalls.push({ error, attempts, totalTime });
        }
      });
      assert.fail('Should have thrown');
    } catch {
      // expected
    }
    
    assert.equal(failureCalls.length, 1);
    assert.equal(failureCalls[0]!.error.message, 'Always fails');
    assert.equal(failureCalls[0]!.attempts, 3);
    assert.ok(failureCalls[0]!.totalTime > 0);
  });

  it('should call all callbacks in correct order', async () => {
    const callbackOrder: string[] = [];
    let callCount = 0;
    
    await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    }, {
      maxAttempts: 3,
      delay: 10,
      onAttempt: (attempt: number) => {
        callbackOrder.push(`attempt-${attempt}`);
      },
      onRetry: (attempt: number) => {
        callbackOrder.push(`retry-${attempt}`);
      },
      onSuccess: (_result: unknown, attempts: number) => {
        callbackOrder.push(`success-${attempts}`);
      }
    });

    // Order should be: attempt-1, retry-2, attempt-2, success-2
    assert.deepEqual(callbackOrder, ['attempt-1', 'retry-2', 'attempt-2', 'success-2']);
  });

  it('should provide accurate timing in callbacks', async () => {
    const timingCallbacks: { type: string; time: number }[] = [];
    let callCount = 0;
    const testStart = Date.now();
    
    await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Failed');
      }
      return 'success';
    }, {
      maxAttempts: 2,
      delay: 50,
      onAttempt: (attempt: number) => {
        timingCallbacks.push({
          type: `attempt-${attempt}`,
          time: Date.now() - testStart
        });
      },
      onSuccess: (_result: unknown, _attempts: number, totalTime: number) => {
        timingCallbacks.push({
          type: 'success',
          time: totalTime
        });
      }
    });

    assert.ok(timingCallbacks.length > 0);
    // First attempt should be near 0ms
    assert.ok(timingCallbacks[0]!.time < 30, `First attempt time ${timingCallbacks[0]!.time} should be < 30`);
    // Success time should be > 40ms due to retry delay
    assert.ok(timingCallbacks[1]!.time > 40, `Success time ${timingCallbacks[1]!.time} should be > 40`);
  });

  it('should handle callback errors gracefully', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    }, {
      maxAttempts: 2,
      delay: 10,
      onAttempt: () => {
        throw new Error('Callback error');
      }
    });

    assert.equal(callCount, 2);
    assert.equal(result.value, 'success');
  });

  it('should work without any callbacks', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    }, { delay: 10 });

    assert.equal(callCount, 2);
    assert.equal(result.value, 'success');
    assert.equal(result.stats.attempts, 2);
  });
});
