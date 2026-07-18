import { retry, RetryError } from '../index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('retry-x - Error Handling', () => {
  
  it('should throw RetryError on failure', async () => {
    await assert.rejects(async () => {
      await retry(async () => {
        throw new Error('Test error');
      }, { maxAttempts: 1 });
    }, (error: unknown) => {
      assert.ok(error instanceof RetryError);
      assert.match((error as Error).message, /Operation failed after 1 attempts/);
      return true;
    });
  });

  it('should include last error message in RetryError', async () => {
    await assert.rejects(async () => {
      await retry(async () => {
        throw new Error('Custom error message');
      }, { maxAttempts: 2, delay: 10 });
    }, (error: unknown) => {
      assert.ok(error instanceof RetryError);
      assert.match((error as Error).message, /Custom error message/);
      return true;
    });
  });

  it('should call onFailure with the correct error', async () => {
    let failureError: Error | undefined;
    
    await assert.rejects(async () => {
      await retry(async () => {
        throw new Error('Specific failure');
      }, {
        maxAttempts: 2,
        delay: 10,
        onFailure: (error: Error) => {
          failureError = error;
        }
      });
    });
    
    assert.ok(failureError);
    assert.equal(failureError!.message, 'Specific failure');
  });

  it('should respect shouldRetry condition', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error('Non-retryable error');
      }, {
        maxAttempts: 5,
        shouldRetry: (error: Error) => {
          return error.message.includes('RETRYABLE');
        }
      });
    });
    
    // shouldRetry returns false, so no retries should happen
    assert.equal(callCount, 1);
  });

  it('should respect retryOn condition', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error('Non-retryable error');
      }, {
        maxAttempts: 5,
        retryOn: () => false
      });
    });
    
    // retryOn returns false, so no retries should happen
    assert.equal(callCount, 1);
  });

  it('should handle non-Error throws', async () => {
    await assert.rejects(async () => {
      await retry(async () => {
        throw 'string error';
      }, { maxAttempts: 1 });
    });
  });

  it('should preserve error attempt count', async () => {
    let callCount = 0;
    
    await assert.rejects(async () => {
      await retry(async () => {
        callCount++;
        throw new Error(`Attempt ${callCount}`);
      }, { maxAttempts: 4, delay: 10 });
    }, (error: unknown) => {
      assert.ok(error instanceof RetryError);
      assert.equal((error as RetryError).attempt, 4);
      assert.equal((error as RetryError).totalAttempts, 4);
      return true;
    });
    assert.equal(callCount, 4);
  });
});
