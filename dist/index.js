export class RetryError extends Error {
    constructor(message, attempt, totalAttempts, delays = []) {
        super(message);
        this.attempt = attempt;
        this.totalAttempts = totalAttempts;
        this.delays = delays;
        this.name = 'RetryError';
    }
}
export async function retry(fn, options = {}) {
    const { maxAttempts = 3, delay = 1000, maxDelay = 30000, backoff = 'fixed', jitter = false, jitterType = 'full', retryOn = () => true, shouldRetry = () => true, onAttempt, onRetry, onSuccess, onFailure, timeout } = options;
    let attempt = 0;
    let startTime = Date.now();
    let lastError;
    const delays = [];
    const calculateDelay = (attempt) => {
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
                const fib = [delay, delay];
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
        calculatedDelay = Math.min(calculatedDelay, maxDelay);
        if (jitter) {
            if (jitterType === 'full') {
                calculatedDelay = Math.random() * calculatedDelay;
            }
            else if (jitterType === 'equal') {
                calculatedDelay = delay / 2 + Math.random() * (calculatedDelay - delay / 2);
            }
        }
        return Math.max(0, calculatedDelay);
    };
    const executeAttempt = async (attemptNumber) => {
        attempt = attemptNumber;
        const attemptStartTime = Date.now();
        try {
            onAttempt?.(attempt, lastError);
        }
        catch {
        }
        if (timeout) {
            let timeoutId = null;
            try {
                const result = await Promise.race([
                    fn(),
                    new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(new Error(`Operation timed out after ${timeout}ms`));
                        }, timeout);
                    })
                ]);
                return result;
            }
            finally {
                if (timeoutId)
                    clearTimeout(timeoutId);
            }
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
        }
        catch (error) {
            lastError = error;
            if (i < maxAttempts) {
                const retryDelay = calculateDelay(i);
                delays.push(retryDelay);
                const shouldRetryNow = retryOn(i, lastError) && shouldRetry(lastError);
                if (shouldRetryNow) {
                    try {
                        onRetry?.(i + 1, lastError, retryDelay);
                    }
                    catch {
                    }
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
                else {
                    break;
                }
            }
        }
    }
    const totalTime = Date.now() - startTime;
    onFailure?.(lastError, attempt, totalTime);
    throw new RetryError(`Operation failed after ${attempt} attempts. Last error: ${lastError?.message}`, attempt, maxAttempts, delays);
}
export function withRetry(fn, options = {}) {
    return retry(fn, options).then(result => result.value);
}
export function createRetry(options) {
    return (fn) => retry(fn, options);
}
export const RetryStrategies = {
    retryOnErrors: (errorTypes) => (error) => {
        return errorTypes.some(type => error.message.includes(type) ||
            error.code === type);
    },
    retryOnNetworkErrors: (error) => {
        return error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNREFUSED' ||
            error.message.includes('Network') ||
            error.message.includes('fetch failed') ||
            error.message.includes('timeout');
    },
    retryOn5xxErrors: (error) => {
        return error.response?.status >= 500 &&
            error.response?.status < 600;
    },
    retryOnRateLimit: (error) => {
        return error.response?.status === 429;
    }
};
export const BackoffStrategies = {
    exponential: (baseDelay, attempt, maxDelay) => {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        return Math.min(delay, maxDelay);
    },
    linear: (baseDelay, attempt, maxDelay) => {
        const delay = baseDelay * attempt;
        return Math.min(delay, maxDelay);
    },
    fibonacci: (baseDelay, attempt, maxDelay) => {
        const fib = [baseDelay, baseDelay];
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
//# sourceMappingURL=index.js.map