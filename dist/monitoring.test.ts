import { retry, RetryOptions } from '../index';
import { describe, it, expect } from 'node:test';

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
      onAttempt: (attempt) => {
        attemptCalls.push(attempt);
      }
    });

    expect(attemptCalls).toEqual([1, 2]);
    expect(callCount).toBe(2);
    expect(result.value).toBe('success');
  });

  it('should call onAttempt with errors', async () => {
    const attemptCalls: { attempt: number; error?: Error }[] = [];
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        const error = new Error(`Attempt ${callCount} failed`);
        throw error;
      }, {
        maxAttempts: 3,
        onAttempt: (attempt, error) => {
          attemptCalls.push({ attempt, error });
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(attemptCalls).toEqual([
        { attempt: 1, error: expect.any(Error) },
        { attempt: 2, error: expect.any(Error) },
        { attempt: 3, error: expect.any(Error) }
      ]);
      
      // Check error messages
      expect(attemptCalls[0].error?.message).toBe('Attempt 1 failed');
      expect(attemptCalls[1].error?.message).toBe('Attempt 2 failed');
      expect(attemptCalls[2].error?.message).toBe('Attempt 3 failed');
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
      delay: 500,
      onRetry: (attempt, error, delay) => {
        retryCalls.push({ attempt, error, delay });
      }
    });

    expect(retryCalls).toHaveLength(1);
    expect(retryCalls[0]).toEqual({
      attempt: 2,
      error: expect.any(Error),
      delay: 500
    });
    expect(retryCalls[0].error.message).toBe('First attempt failed');
  });

  it('should call onSuccess on successful completion', async () => {
    const successCalls: { result: any; attempts: number; totalTime: number }[] = [];
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Failed');
      }
      return { data: 'success' };
    }, {
      maxAttempts: 3,
      onSuccess: (result, attempts, totalTime) => {
        successCalls.push({ result, attempts, totalTime });
      }
    });

    expect(successCalls).toHaveLength(1);
    expect(successCalls[0]).toEqual({
      result: { data: 'success' },
      attempts: 2,
      totalTime: expect.any(Number)
    });
    expect(successCalls[0].totalTime).toBeGreaterThan(0);
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
        onFailure: (error, attempts, totalTime) => {
          failureCalls.push({ error, attempts, totalTime });
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(failureCalls).toHaveLength(1);
      expect(failureCalls[0]).toEqual({
        error: expect.any(Error),
        attempts: 3,
        totalTime: expect.any(Number)
      });
      expect(failureCalls[0].error.message).toBe('Always fails');
      expect(failureCalls[0].totalTime).toBeGreaterThan(0);
    }
  });

  it('should call all callbacks in correct order', async () => {
    const callbackOrder: string[] = [];
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    }, {
      maxAttempts: 3,
      delay: 100,
      onAttempt: (attempt) => {
        callbackOrder.push(`attempt-${attempt}`);
      },
      onRetry: (attempt, error, delay) => {
        callbackOrder.push(`retry-${attempt}`);
      },
      onSuccess: (result, attempts, totalTime) => {
        callbackOrder.push(`success-${attempts}`);
      }
    });

    // Order should be: attempt-1, retry-2, attempt-2, success-2
    expect(callbackOrder).toEqual(['attempt-1', 'retry-2', 'attempt-2', 'success-2']);
  });

  it('should provide accurate timing in callbacks', async () => {
    const timingCallbacks: { type: string; time: number }[] = [];
    let callCount = 0;
    const testStart = Date.now();
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Failed');
      }
      return 'success';
    }, {
      maxAttempts: 2,
      delay: 200,
      onAttempt: (attempt) => {
        timingCallbacks.push({
          type: `attempt-${attempt}`,
          time: Date.now() - testStart
        });
      },
      onSuccess: (result, attempts, totalTime) => {
        timingCallbacks.push({
          type: 'success',
          time: totalTime
        });
      }
    });

    expect(timingCallbacks.length).toBeGreaterThan(0);
    
    // First attempt should be near 0ms
    expect(timingCallbacks[0].time).toBeLessThan(50);
    
    // Success time should be > 200ms due to retry delay
    expect(timingCallbacks[1].time).toBeGreaterThan(150);
  });

  it('should handle callback errors gracefully', async () => {
    let callCount = 0;
    
    // This should not throw even if callback throws
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    }, {
      maxAttempts: 2,
      onAttempt: () => {
        throw new Error('Callback error');
      }
    });

    expect(callCount).toBe(2);
    expect(result.value).toBe('success');
  });

  it('should provide correct statistics in callbacks', async () => {
    const statsCollector: { type: string; stats?: any }[] = [];
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        throw new Error(`Attempt ${callCount} failed`);
      }, {
        maxAttempts: 3,
        onAttempt: (attempt, error) => {
          statsCollector.push({
            type: 'attempt',
            stats: { attempt, error: error?.message }
          });
        },
        onRetry: (attempt, error, delay) => {
          statsCollector.push({
            type: 'retry',
            stats: { attempt, error: error?.message, delay }
          });
        },
        onFailure: (error, attempts, totalTime) => {
          statsCollector.push({
            type: 'failure',
            stats: { attempts, totalTime, error: error?.message }
          });
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(statsCollector.length).toBeGreaterThan(0);
      
      // Check failure stats
      const failureStat = statsCollector.find(s => s.type === 'failure');
      expect(failureStat?.stats.attempts).toBe(3);
      expect(failureStat?.stats.totalTime).toBeGreaterThan(0);
      expect(failureStat?.stats.error).toBe('Attempt 3 failed');
    }
  });

  it('should work without any callbacks', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return 'success';
    });

    expect(callCount).toBe(2);
    expect(result.value).toBe('success');
    expect(result.stats.attempts).toBe(2);
  });
});