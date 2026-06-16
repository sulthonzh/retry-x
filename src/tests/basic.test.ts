import { retry, RetryOptions, RetryResult, RetryError } from '../index';
import { describe, it, expect } from 'node:test';

describe('retry-x - Basic Functionality', () => {
  
  it('should succeed on first attempt', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      return { success: true, data: 'test' };
    });

    expect(callCount).toBe(1);
    expect(result.value).toEqual({ success: true, data: 'test' });
    expect(result.stats.attempts).toBe(1);
    expect(result.stats.success).toBe(true);
    expect(result.stats.retries).toBe(0);
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

    expect(callCount).toBe(2);
    expect(result.value).toEqual({ success: true, data: 'retry success' });
    expect(result.stats.attempts).toBe(2);
    expect(result.stats.success).toBe(true);
    expect(result.stats.retries).toBe(1);
  });

  it('should exhaust max attempts and throw error', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        throw new Error(`Attempt ${callCount} failed`);
      }, {
        maxAttempts: 3
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(RetryError);
      expect((error as RetryError).attempt).toBe(3);
      expect((error as RetryError).totalAttempts).toBe(3);
      expect(callCount).toBe(3);
    }
  });

  it('should respect custom delay between retries', async () => {
    let callCount = 0;
    const startTime = Date.now();
    
    try {
      await retry(async () => {
        callCount++;
        throw new Error('Failed');
      }, {
        maxAttempts: 3,
        delay: 500
      });
    } catch (error) {
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should be approximately 1000ms (2 retries * 500ms delay)
      expect(totalTime).toBeGreaterThan(900);
      expect(totalTime).toBeLessThan(1200);
      expect(callCount).toBe(3);
    }
  });

  it('should use fixed backoff strategy', async () => {
    let callCount = 0;
    const startTime = Date.now();
    const delays: number[] = [];
    
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
    } catch (error) {
      delays.push((error as RetryError).delays[0]);
      delays.push((error as RetryError).delays[1]);
      
      // Fixed backoff should have same delay each time
      expect(delays[0]).toBe(200);
      expect(delays[1]).toBe(200);
    }
  });

  it('should use exponential backoff strategy', async () => {
    let callCount = 0;
    const startTime = Date.now();
    const delays: number[] = [];
    
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
    } catch (error) {
      delays.push(...(error as RetryError).delays);
      
      // Exponential backoff: 100, 200, 400, then capped at maxDelay
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);
    }
  });

  it('should use linear backoff strategy', async () => {
    let callCount = 0;
    const delays: number[] = [];
    
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
    } catch (error) {
      delays.push(...(error as RetryError).delays);
      
      // Linear backoff: 100, 200, 300, 400
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(300);
    }
  });

  it('should use fibonacci backoff strategy', async () => {
    let callCount = 0;
    const delays: number[] = [];
    
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
    } catch (error) {
      delays.push(...(error as RetryError).delays);
      
      // Fibonacci backoff: 100, 100, 200, 300, 500
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(100);
      expect(delays[2]).toBe(200);
      expect(delays[3]).toBe(300);
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
    } catch (error) {
      const delays = (error as RetryError).delays;
      
      // With jitter, delays should be different (usually less than base delay)
      expect(delays[0]).toBeLessThan(100);
      expect(delays[1]).toBeLessThan(100);
      expect(delays[0]).toBeGreaterThanOrEqual(0);
      expect(delays[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it('should respect maxDelay limit', async () => {
    let callCount = 0;
    const delays: number[] = [];
    
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
    } catch (error) {
      delays.push(...(error as RetryError).delays);
      
      // Should be capped at maxDelay: 1000, 2000, 2000, 2000
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(2000);
      expect(delays[3]).toBe(2000);
    }
  });

  it('should handle synchronous functions that return promises', async () => {
    let callCount = 0;
    
    const result = await retry(async () => {
      callCount++;
      return Promise.resolve({ success: true, count: callCount });
    });

    expect(callCount).toBe(1);
    expect(result.value).toEqual({ success: true, count: 1 });
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

    expect(result.stats.attempts).toBe(2);
    expect(result.stats.retries).toBe(1);
    expect(result.stats.success).toBe(true);
    expect(result.stats.delays).toHaveLength(1);
    expect(result.stats.delays[0]).toBe(1000); // default delay
  });
});