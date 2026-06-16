import { retry, RetryOptions, RetryError } from '../index';
import { describe, it, expect } from 'node:test';

describe('retry-x - Error Handling', () => {
  
  it('should retry only on specific errors using shouldRetry', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        if (callCount === 2) {
          throw new Error('Fatal error'); // Should not retry this
        }
        return 'success';
      }, {
        maxAttempts: 5,
        shouldRetry: (error) => {
          return error.message === 'Network error';
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(callCount).toBe(2); // Retried first error, but not second
      expect(error.message).toBe('Fatal error');
    }
  });

  it('should retry based on custom retryOn condition', async () => {
    let callCount = 0;
    const errors: Error[] = [];
    
    const result = await retry(async () => {
      callCount++;
      const error = new Error(`Attempt ${callCount} failed`);
      errors.push(error);
      
      if (callCount <= 2) {
        throw error;
      }
      
      return 'success';
    }, {
      maxAttempts: 5,
      retryOn: (attempt, error) => {
        // Only retry on attempts 1 and 2
        return attempt <= 2;
      }
    });

    expect(callCount).toBe(3); // Attempted 3 times, but only retried first 2
    expect(errors.length).toBe(3); // All attempts failed, but only first 2 were retried
    expect(result.value).toBe('success');
    expect(result.stats.attempts).toBe(3);
  });

  it('should combine retryOn and shouldRetry conditions', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        const error = new Error(`Attempt ${callCount} error`);
        
        if (callCount === 1) {
          throw new Error('Network error'); // Should retry (retryOn + shouldRetry)
        }
        if (callCount === 2) {
          throw new Error('HTTP 500 error'); // Should retry (retryOn + shouldRetry)
        }
        if (callCount === 3) {
          throw new Error('HTTP 400 error'); // Should not retry (retryOn ok, but shouldRetry fails)
        }
        
        return 'success';
      }, {
        maxAttempts: 5,
        retryOn: (attempt, error) => {
          return attempt <= 2;
        },
        shouldRetry: (error) => {
          return !error.message.includes('HTTP 400');
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(callCount).toBe(3);
      expect(error.message).toBe('HTTP 400 error');
    }
  });

  it('should handle non-error rejections', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount === 1) {
          throw 'string error';
        }
        if (callCount === 2) {
          throw null;
        }
        return 'success';
      }, {
        maxAttempts: 3,
        shouldRetry: (error) => {
          // Handle non-error objects
          if (error === null) return false;
          if (typeof error === 'string') return true;
          return true;
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(callCount).toBe(2);
      expect(error).toBe(null);
    }
  });

  it('should preserve original error properties', async () => {
    let callCount = 0;
    const originalError = new Error('Test error');
    originalError.code = 'TEST_ERROR';
    
    try {
      await retry(async () => {
        callCount++;
        throw originalError;
      }, {
        maxAttempts: 2
      });
    } catch (error) {
      expect(error).toBe(originalError);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error');
    }
  });

  it('should handle errors with custom properties', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        const error = new Error('Custom error');
        (error as any).customProp = 'test value';
        (error as any).status = 500;
        throw error;
      }, {
        maxAttempts: 2
      });
    } catch (error) {
      expect(callCount).toBe(2);
      expect((error as any).customProp).toBe('test value');
      expect((error as any).status).toBe(500);
    }
  });

  it('should not retry on thrown non-Error objects', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        if (callCount === 1) {
          throw { message: 'Object error' };
        }
        return 'success';
      }, {
        maxAttempts: 3,
        shouldRetry: (error) => {
          return typeof error === 'object' && error !== null;
        }
      });
      
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(callCount).toBe(1); // Should not retry on non-Error
      expect(error).toEqual({ message: 'Object error' });
    }
  });

  it('should handle error serialization and deserialization', async () => {
    let callCount = 0;
    
    try {
      await retry(async () => {
        callCount++;
        const error = new Error('Serialization test');
        throw error;
      }, {
        maxAttempts: 2
      });
    } catch (error) {
      // JSON.stringify and parse should preserve basic error structure
      const serialized = JSON.stringify(error);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.message).toBe('Serialization test');
      expect(deserialized.name).toBe('RetryError');
      expect(deserialized.attempt).toBe(2);
      expect(deserialized.totalAttempts).toBe(2);
      expect(Array.isArray(deserialized.delays)).toBe(true);
    }
  });
});