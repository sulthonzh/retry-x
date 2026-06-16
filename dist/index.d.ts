export interface RetryOptions {
    maxAttempts?: number;
    delay?: number;
    maxDelay?: number;
    backoff?: 'fixed' | 'exponential' | 'linear' | 'fibonacci';
    jitter?: boolean;
    jitterType?: 'full' | 'equal';
    retryOn?: (attempt: number, error?: Error) => boolean;
    shouldRetry?: (error: Error) => boolean;
    onAttempt?: (attempt: number, error?: Error) => void;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
    onSuccess?: (result: any, attempts: number, totalTime: number) => void;
    onFailure?: (error: Error, attempts: number, totalTime: number) => void;
    timeout?: number | undefined;
}
export interface RetryResult<T = any> {
    value: T;
    stats: RetryStats;
}
export interface RetryStats {
    attempts: number;
    totalTime: number;
    retries: number;
    delays: number[];
    success: boolean;
    lastError?: Error;
}
export declare class RetryError extends Error {
    readonly attempt: number;
    readonly totalAttempts: number;
    readonly delays: number[];
    constructor(message: string, attempt: number, totalAttempts: number, delays?: number[]);
}
export declare function retry<T = any>(fn: () => Promise<T>, options?: RetryOptions): Promise<RetryResult<T>>;
export declare function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
export declare function createRetry(options: RetryOptions): <T>(fn: () => Promise<T>) => Promise<RetryResult<T>>;
export declare const RetryStrategies: {
    retryOnErrors: (errorTypes: string[]) => (error: Error) => boolean;
    retryOnNetworkErrors: (error: Error) => boolean;
    retryOn5xxErrors: (error: Error) => boolean;
    retryOnRateLimit: (error: Error) => boolean;
};
export declare const BackoffStrategies: {
    exponential: (baseDelay: number, attempt: number, maxDelay: number) => number;
    linear: (baseDelay: number, attempt: number, maxDelay: number) => number;
    fibonacci: (baseDelay: number, attempt: number, maxDelay: number) => number;
};
export default retry;
//# sourceMappingURL=index.d.ts.map