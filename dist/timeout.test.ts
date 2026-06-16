import { retry, RetryOptions } from '../index';
import { describe, it, expect } from 'node:test';

describe('retry-x - Timeout Functionality', () => {
  
  it('should respect timeout per attempt', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500 // 500ms timeout per attempt
      });
      
      expect.fail('Should have thrown timeout error');
    } catch (error) {
      expect(callCount).toBe(1);
      expect(error.message).toBe('Operation timed out after 500ms');
    }
  });

  it('should complete successfully before timeout', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      // Simulate fast operation
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'success';
    }, {
      maxAttempts: 3,
      timeout: 1000 // 1000ms timeout per attempt
    });

    expect(callCount).toBe(1);
    expect(result.value).toBe('success');
  });

  it('should handle timeout with retries', async () => {
    let callCount = 0;
    const timeouts: number[] = [];
    
    try {
      await retry(async () => {
        callCount++;
        const startTime = Date.now();
        
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const endTime = Date.now();
        timeouts.push(endTime - startTime);
        
        return 'success';
      }, {
        maxAttempts: 3,
        timeout: 500, // 500ms timeout
        delay: 100   // 100ms delay between retries
      });
      
      expect.fail('Should have thrown timeout error');
    } catch (error) {
      expect(callCount).toBe(3); // Should timeout 3 times
      expect(timeouts.length).toBe(3);
      
      // Each attempt should timeout around 500ms
      timeouts.forEach(timeout => {
        expect(timeout).toBeGreaterThanOrEqual(450);
        expect(timeout).toBeLessThan(1000);
      });
    }
  });

  it('should combine timeout with backoff', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount === 1) {
          // Simulate slow operation
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500, // 500ms timeout per attempt
        delay: 100,  // 100ms delay between retries
        backoff: 'exponential'
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      expect(callCount).toBe(1); // Should timeout on first attempt
      expect(error.message).toBe('Operation timed out after 500ms');
      
      // Total time should be around 500ms (timeout) + small processing
      expect(totalTime).toBeGreaterThanOrEqual(450);
      expect(totalTime).toBeLessThan(700);
    }
  });

  it('should continue retrying after timeout', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      const attemptStartTime = Date.now();
      
      if (callCount === 1) {
        // First attempt times out
        await new Promise(resolve => setTimeout(resolve, 800));
      } else if (callCount === 2) {
        // Second attempt succeeds
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        return 'success';
      }
      
      return 'success';
    }, {
      maxAttempts: 3,
      timeout: 500 // 500ms timeout per attempt
    });

    expect(callCount).toBe(2);
    expect(result.value).toBe('success');
    expect(result.stats.attempts).toBe(2);
  });

  it('should handle timeout with custom retry conditions', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 800));
        throw new Error('Operation took too long');
      }, {
        maxAttempts: 3,
        timeout: 500,
        shouldRetry: (error) => {
          // Retry only on timeout errors
          return error.message === 'Operation timed out after 500ms';
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(callCount).toBe(3); // Should timeout 3 times but not retry
      expect(error.message).toBe('Operation timed out after 500ms');
    }
  });

  it('should provide accurate timing with timeout', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        // Simulate very slow operation
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500
      });
    } catch (error) {
      expect(callCount).toBe(1);
      expect(error.message).toBe('Operation timed out after 500ms');
    }
  });

  it('should work with zero timeout (immediate)', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        // Even sync operations should timeout if timeout is 0
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 0 // Immediate timeout
      });
      
      expect.fail('Should have thrown timeout error');
    } catch (error) {
      expect(callCount).toBe(1);
      expect(error.message).toBe('Operation timed out after 0ms');
    }
  });

  it('should handle timeout with monitoring callbacks', async () => {
    const callbackOrder: string[] = [];
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        callbackOrder.push(`start-${callCount}`);
        
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 800));
        
        callbackOrder.push(`end-${callCount}`);
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500,
        onAttempt: (attempt) => {
          callbackOrder.push(`attempt-${attempt}`);
        },
        onRetry: (attempt, error, delay) => {
          callbackOrder.push(`retry-${attempt}`);
        }
      });
    } catch (error) {
      expect(callbackOrder).toEqual(['start-1', 'attempt-1']);
      expect(callCount).toBe(1);
    }
  });

  it('should not delay after timeout', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    try {
      await retry(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 800));
        return 'success';
      }, {
        maxAttempts: 2,
        timeout: 500,
        delay: 200 // Should not be used after timeout
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      expect(callCount).toBe(1);
      expect(totalTime).toBeLessThan(600); // Should not add delay after timeout
      expect(error.message).toBe('Operation timed out after 500ms');
    }
  });
});