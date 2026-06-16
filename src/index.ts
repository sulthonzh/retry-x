/**
 * retry-x - Zero-Dependency Retry Mechanism Library
 * 
 * A powerful, zero-dependency retry library for Node.js with multiple retry strategies,
 * backoff algorithms, and comprehensive error handling.
 * 
 * @author Sulthonzh
 * @license MIT
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 1000) */
  delay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff strategy: 'fixed', 'exponential', 'linear', 'fibonacci' (default: 'fixed') */
  backoff?: 'fixed' | 'exponential' | 'linear' | 'fibonacci';
  /** Add jitter to delay to prevent thundering herd (default: false) */
  jitter?: boolean;
  /** Jitter type: 'full' or 'equal' (default: 'full') */
  jitterType?: 'full' | 'equal';
  /** Custom retry condition function (default: () => true) */
  retryOn?: (attempt: number, error?: Error) => boolean;
  /** Function to determine if error should be retried (default: () => true) */
  shouldRetry?: (error: Error) => boolean;
  /** Callback for each attempt */
  onAttempt?: (attempt: number, error?: Error) => void;
  /** Callback for each retry */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  /** Callback for successful operation */
  onSuccess?: (result: any, attempts: number, totalTime: number) => void;
  /** Callback for final failure */
  onFailure?: (error: Error, attempts: number, totalTime: number) => void;
  /** Timeout for each attempt in milliseconds */
  timeout?: number | undefined;
}

export interface RetryResult<T = any> {
  /** The result value if successful */
  value: T;
  /** Retry statistics */
  stats: RetryStats;
}

export interface RetryStats {
  /** Total number of attempts made */
  attempts: number;
  /** Total time spent in milliseconds */
  totalTime: number;
  /** Number of retries (attempts - 1) */
  retries: number;
  /** Array of delays used for each retry */
  delays: number[];
  /** Whether the operation was successful */
  success: boolean;
  /** The final error if failed */
  lastError?: Error;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempt: number,
    public readonly totalAttempts: number,
    public readonly delays: number[] = []
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Execute an async function with retry logic
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise that resolves with the result or rejects with final error
 */
export async function retry<T = any>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    delay = 1000,
    maxDelay = 30000,
    backoff = 'fixed',
    jitter = false,
    jitterType = 'full',
    retryOn = () => true,
    shouldRetry = () => true,
    onAttempt,
    onRetry,
    onSuccess,
    onFailure,
    timeout
  } = options;

  let attempt = 0;
  let startTime = Date.now();
  let lastError: Error | undefined;
  const delays: number[] = [];

  const calculateDelay = (attempt: number): number => {
    let calculatedDelay = delay;

    switch (backoff) {
      case 'fixed':
        calculatedDelay = delay;
        break;
      
      case 'exponential':
        calculatedDelay = delay * Math.pow(2, attempt - 1);
        break;
      
      case 'linear':
        calculatedDelay = delay * attempt;
        break;
      
      case 'fibonacci':
        const fib: number[] = [delay, delay];
        for (let i = 2; i < attempt; i++) {
          const prev1 = fib[i - 1];
          const prev2 = fib[i - 2];
          if (prev1 !== undefined && prev2 !== undefined) {
            fib[i] = prev1 + prev2;
          }
        }
        calculatedDelay = fib[attempt - 1] || delay;
        break;
    }

    // Apply maxDelay cap
    calculatedDelay = Math.min(calculatedDelay, maxDelay);

    // Add jitter if enabled
    if (jitter) {
      if (jitterType === 'full') {
        calculatedDelay = Math.random() * calculatedDelay;
      } else if (jitterType === 'equal') {
        calculatedDelay = delay / 2 + Math.random() * (calculatedDelay - delay / 2);
      }
    }

    return Math.max(0, calculatedDelay);
  };

  const executeAttempt = async (attemptNumber: number): Promise<T> => {
    attempt = attemptNumber;
    const attemptStartTime = Date.now();

    onAttempt?.(attempt, lastError);

    // Handle timeout for this attempt
    if (timeout) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);
      });

      const operationPromise = fn();
      const result = await Promise.race([operationPromise, timeoutPromise]);
      return result;
    }

    return await fn();
  };

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const result = await executeAttempt(i);
      const totalTime = Date.now() - startTime;

      onSuccess?.(result, i, totalTime);

      return {
        value: result,
        stats: {
          attempts: i,
          totalTime,
          retries: i - 1,
          delays,
          success: true
        }
      };
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxAttempts) {
        const retryDelay = calculateDelay(i);
        delays.push(retryDelay);

        // Check if we should retry
        const shouldRetryNow = retryOn(i, lastError) && shouldRetry(lastError);
        
        if (shouldRetryNow) {
          onRetry?.(i, lastError, retryDelay);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          // Don't retry based on custom conditions
          break;
        }
      }
    }
  }

  // All attempts failed
  const totalTime = Date.now() - startTime;
  
  onFailure?.(lastError!, attempt, totalTime);

  throw new RetryError(
    `Operation failed after ${attempt} attempts. Last error: ${lastError?.message}`,
    attempt,
    maxAttempts,
    delays
  );
}

/**
 * Simple retry helper with default options
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retry(fn, options).then(result => result.value);
}

/**
 * Create a retry function with preset options
 */
export function createRetry(options: RetryOptions) {
  return <T>(fn: () => Promise<T>) => retry(fn, options);
}

/**
 * Retry strategies helpers
 */
export const RetryStrategies = {
  /**
   * Only retry on specific error types
   */
  retryOnErrors: (errorTypes: string[]) => (error: Error) => {
    return errorTypes.some(type => error.message.includes(type) || 
                                  (error as any).code === type);
  },

  /**
   * Only retry on network-related errors
   */
  retryOnNetworkErrors: (error: Error) => {
    return (error as any).code === 'ECONNRESET' ||
           (error as any).code === 'ETIMEDOUT' ||
           (error as any).code === 'ENOTFOUND' ||
           (error as any).code === 'ECONNREFUSED' ||
           error.message.includes('Network') ||
           error.message.includes('fetch failed') ||
           error.message.includes('timeout');
  },

  /**
   * Only retry on 5xx HTTP errors
   */
  retryOn5xxErrors: (error: Error) => {
    return (error as any).response?.status >= 500 && 
           (error as any).response?.status < 600;
  },

  /**
   * Only retry on rate limiting (429)
   */
  retryOnRateLimit: (error: Error) => {
    return (error as any).response?.status === 429;
  }
};

/**
 * Backoff algorithms helpers
 */
export const BackoffStrategies = {
  /**
   * Calculate exponential backoff delay
   */
  exponential: (baseDelay: number, attempt: number, maxDelay: number): number => {
    const delay = baseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, maxDelay);
  },

  /**
   * Calculate linear backoff delay
   */
  linear: (baseDelay: number, attempt: number, maxDelay: number): number => {
    const delay = baseDelay * attempt;
    return Math.min(delay, maxDelay);
  },

  /**
   * Calculate Fibonacci backoff delay
   */
  fibonacci: (baseDelay: number, attempt: number, maxDelay: number): number => {
    const fib: number[] = [baseDelay, baseDelay];
    for (let i = 2; i < attempt; i++) {
      const prev1 = fib[i - 1];
      const prev2 = fib[i - 2];
      if (prev1 !== undefined && prev2 !== undefined) {
        fib[i] = prev1 + prev2;
      }
    }
    const delay = fib[attempt - 1] || baseDelay;
    return Math.min(delay, maxDelay);
  }
};

export default retry;