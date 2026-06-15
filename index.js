'use strict';

/**
 * retry-x — Zero-dependency retry with composable backoff strategies.
 *
 * Exponential backoff, linear backoff, constant delay, decorrelated jitter,
 * full/decorrelated/equal jitter, per-retry timeout, max retry time budget,
 * retry-if predicates, onRetry hook, async support throughout.
 */

// ─── Backoff Strategies ────────────────────────────────────────────

/**
 * Exponential backoff: delay = base * multiplier^(attempt) capped at maxDelay.
 * @param {object} opts
 * @param {number} opts.base=100 — base delay in ms
 * @param {number} opts.multiplier=2 — growth factor
 * @param {number} opts.maxDelay=Infinity — cap
 */
function exponentialBackoff({ base = 100, multiplier = 2, maxDelay = Infinity } = {}) {
  return (attempt) => {
    const delay = base * Math.pow(multiplier, attempt);
    return Math.min(delay, maxDelay);
  };
}

/**
 * Linear backoff: delay = base + step * attempt capped at maxDelay.
 */
function linearBackoff({ base = 100, step = 100, maxDelay = Infinity } = {}) {
  return (attempt) => Math.min(base + step * attempt, maxDelay);
}

/**
 * Constant delay: same every time.
 */
function constantBackoff({ delay = 1000 } = {}) {
  return () => delay;
}

/**
 * Full jitter: random between 0 and exponential delay.
 * Recommended by AWS Architecture Blog.
 */
function fullJitter({ base = 100, multiplier = 2, maxDelay = Infinity } = {}) {
  const exp = exponentialBackoff({ base, multiplier, maxDelay });
  return (attempt) => {
    const ceiling = exp(attempt);
    return Math.random() * ceiling;
  };
}

/**
 * Equal jitter: half fixed + half random. Provides a floor.
 */
function equalJitter({ base = 100, multiplier = 2, maxDelay = Infinity } = {}) {
  const exp = exponentialBackoff({ base, multiplier, maxDelay });
  return (attempt) => {
    const ceiling = exp(attempt);
    return ceiling / 2 + Math.random() * (ceiling / 2);
  };
}

/**
 * Decorrelated jitter: delay = min(maxDelay, random(base, prev * 3)).
 * Prevents synchronization thundering herds better than other strategies.
 */
function decorrelatedJitter({ base = 100, maxDelay = Infinity } = {}) {
  let prev = base;
  return () => {
    const next = Math.min(maxDelay, base + Math.random() * (prev * 3 - base));
    prev = next;
    return next;
  };
}

// ─── Sleep helpers ─────────────────────────────────────────────────

/** Promise-based sleep. */
function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Core retry function ───────────────────────────────────────────

/**
 * Retry an async function with configurable backoff.
 *
 * @param {function} fn — async or sync function. Receives attempt number (0-based).
 * @param {object} [opts]
 * @param {number} [opts.retries=3] — max retry attempts (0 = no retries)
 * @param {function} [opts.backoff] — (attempt) => delay in ms. Default exponential.
 * @param {number} [opts.base=100] — base delay passed to default backoff
 * @param {number} [opts.multiplier=2]
 * @param {number} [opts.maxDelay=Infinity]
 * @param {number} [opts.maxTotalTime=Infinity] — total time budget in ms
 * @param {number} [opts.perTryTimeout=0] — timeout per attempt in ms (0 = disabled)
 * @param {function} [opts.retryIf] — (error, attempt) => boolean. Default: always retry.
 * @param {function} [opts.onRetry] — (error, attempt, delay) => void. Called before each retry sleep.
 * @param {AbortSignal} [opts.signal] — abort signal to cancel retries
 * @returns {Promise<*>} result of fn
 */
async function retry(fn, opts = {}) {
  const {
    retries = 3,
    base = 100,
    multiplier = 2,
    maxDelay = Infinity,
    maxTotalTime = Infinity,
    perTryTimeout = 0,
    retryIf = () => true,
    onRetry = null,
    signal = null,
  } = opts;

  const backoff = opts.backoff || exponentialBackoff({ base, multiplier, maxDelay });
  const startTime = Date.now();

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Check abort signal
    if (signal?.aborted) {
      throw new Error('Retry aborted');
    }

    // Check total time budget
    if (Date.now() - startTime >= maxTotalTime) {
      const err = new Error(`Max total time (${maxTotalTime}ms) exceeded`);
      err.lastError = lastError;
      throw err;
    }

    try {
      // Execute with optional per-try timeout
      let result;
      if (perTryTimeout > 0) {
        result = await withTimeout(fn(attempt), perTryTimeout);
      } else {
        result = await fn(attempt);
      }
      return result;
    } catch (err) {
      lastError = err;

      // No more retries left
      if (attempt >= retries) break;

      // Check predicate
      if (!retryIf(err, attempt)) break;

      // Calculate delay
      const delay = backoff(attempt);

      // Check if delay would exceed total time budget
      if (Date.now() + delay - startTime >= maxTotalTime) {
        const budgetErr = new Error(`Max total time (${maxTotalTime}ms) exceeded during backoff`);
        budgetErr.lastError = lastError;
        throw budgetErr;
      }

      // Notify
      if (onRetry) onRetry(err, attempt, delay);

      // Sleep
      await sleep(delay);
    }
  }

  throw lastError;
}

// ─── withTimeout ───────────────────────────────────────────────────

/**
 * Rejects a promise if it doesn't resolve within timeoutMs.
 * @param {Promise} promise
 * @param {number} timeoutMs
 * @param {string} [message='Operation timed out']
 * @returns {Promise}
 */
function withTimeout(promise, timeoutMs, message = `Operation timed out after ${timeoutMs}ms`) {
  if (timeoutMs <= 0) return promise;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ─── debounce ──────────────────────────────────────────────────────

/**
 * Debounce an async function. Only the last call within waitMs executes.
 * Returns a debounced function with `.cancel()` and `.flush()`.
 *
 * @param {function} fn
 * @param {number} waitMs
 * @returns {function} debounced
 */
function debounce(fn, waitMs) {
  let timer = null;
  let lastResolve = null;
  let lastReject = null;

  const debounced = function (...args) {
    return new Promise((resolve, reject) => {
      // Cancel previous
      if (timer) {
        clearTimeout(timer);
        lastReject?.(new Error('Debounced'));
      }

      lastResolve = resolve;
      lastReject = reject;

      timer = setTimeout(async () => {
        timer = null;
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }, waitMs);
    });
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      lastReject?.(new Error('Cancelled'));
    }
  };

  debounced.flush = async function (...args) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      const result = await fn(...args);
      lastResolve?.(result);
      return result;
    }
  };

  return debounced;
}

// ─── throttle ──────────────────────────────────────────────────────

/**
 * Throttle an async function to at most one execution per waitMs.
 * Leading + trailing edge execution. Returns throttled fn with `.cancel()`.
 *
 * @param {function} fn
 * @param {number} waitMs
 * @returns {function}
 */
function throttle(fn, waitMs) {
  let lastCall = 0;
  let timer = null;
  let lastArgs = null;
  let pending = false;

  const throttled = function (...args) {
    const now = Date.now();
    const remaining = waitMs - (now - lastCall);

    if (remaining <= 0) {
      lastCall = now;
      lastArgs = null;
      return fn(...args);
    }

    // Schedule trailing call
    lastArgs = args;
    if (!timer) {
      pending = true;
      timer = setTimeout(() => {
        timer = null;
        if (pending && lastArgs) {
          lastCall = Date.now();
          pending = false;
          fn(...lastArgs);
          lastArgs = null;
        }
      }, remaining);
    }

    return Promise.resolve();
  };

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      pending = false;
      lastArgs = null;
    }
  };

  return throttled;
}

// ─── delay ─────────────────────────────────────────────────────────

/** Alias for sleep with optional cancellation signal. */
function delay(ms, opts = {}) {
  const { signal } = opts;
  if (signal?.aborted) return Promise.reject(new Error('Cancelled'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Cancelled'));
      }, { once: true });
    }
  });
}

// ─── Exports ───────────────────────────────────────────────────────

export {
  retry,
  withTimeout,
  debounce,
  throttle,
  delay,
  sleep,
  exponentialBackoff,
  linearBackoff,
  constantBackoff,
  fullJitter,
  equalJitter,
  decorrelatedJitter,
};

export default {
  retry,
  withTimeout,
  debounce,
  throttle,
  delay,
  sleep,
  exponentialBackoff,
  linearBackoff,
  constantBackoff,
  fullJitter,
  equalJitter,
  decorrelatedJitter,
};
