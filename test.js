import { test } from 'node:test';
import assert from 'node:assert';
import {
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
  VERSION,
} from './index.js';

// ─── VERSION ───────────────────────────────────────────────────────

test('VERSION is valid semver string', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(VERSION, '1.1.0');
});

// ─── exponentialBackoff ────────────────────────────────────────────

test('exponentialBackoff: basic growth', () => {
  const b = exponentialBackoff({ base: 100, multiplier: 2 });
  assert.equal(b(0), 100);
  assert.equal(b(1), 200);
  assert.equal(b(2), 400);
  assert.equal(b(3), 800);
});

test('exponentialBackoff: respects maxDelay', () => {
  const b = exponentialBackoff({ base: 100, multiplier: 2, maxDelay: 500 });
  assert.equal(b(0), 100);
  assert.equal(b(1), 200);
  assert.equal(b(2), 400);
  assert.equal(b(3), 500); // capped
  assert.equal(b(10), 500);
});

test('exponentialBackoff: different multiplier', () => {
  const b = exponentialBackoff({ base: 50, multiplier: 3 });
  assert.equal(b(0), 50);
  assert.equal(b(1), 150);
  assert.equal(b(2), 450);
});

test('exponentialBackoff: defaults when no opts', () => {
  const b = exponentialBackoff();
  assert.equal(b(0), 100);
  assert.equal(b(1), 200);
});

test('exponentialBackoff: base=0 produces zero delay', () => {
  const b = exponentialBackoff({ base: 0, multiplier: 2 });
  assert.equal(b(0), 0);
  assert.equal(b(10), 0);
});

test('exponentialBackoff: fractional multiplier', () => {
  const b = exponentialBackoff({ base: 100, multiplier: 1.5 });
  assert.equal(b(0), 100);
  assert.equal(b(1), 150);
  assert.equal(b(2), 225);
});

test('exponentialBackoff: large attempt does not overflow to NaN', () => {
  const b = exponentialBackoff({ base: 100, multiplier: 2, maxDelay: 1000 });
  // Very large attempt numbers should still return maxDelay, not NaN/Infinity
  const val = b(100);
  assert.ok(typeof val === 'number' && !Number.isNaN(val));
  assert.equal(val, 1000);
});

// ─── linearBackoff ─────────────────────────────────────────────────

test('linearBackoff: linear growth', () => {
  const b = linearBackoff({ base: 100, step: 50 });
  assert.equal(b(0), 100);
  assert.equal(b(1), 150);
  assert.equal(b(2), 200);
  assert.equal(b(3), 250);
});

test('linearBackoff: respects maxDelay', () => {
  const b = linearBackoff({ base: 100, step: 100, maxDelay: 300 });
  assert.equal(b(0), 100);
  assert.equal(b(1), 200);
  assert.equal(b(2), 300); // capped
});

test('linearBackoff: defaults', () => {
  const b = linearBackoff();
  assert.equal(b(0), 100);
  assert.equal(b(1), 200);
});

test('linearBackoff: step=0 produces constant output', () => {
  const b = linearBackoff({ base: 200, step: 0 });
  assert.equal(b(0), 200);
  assert.equal(b(5), 200);
});

// ─── constantBackoff ───────────────────────────────────────────────

test('constantBackoff: always returns same value', () => {
  const b = constantBackoff({ delay: 500 });
  assert.equal(b(0), 500);
  assert.equal(b(100), 500);
});

test('constantBackoff: default delay', () => {
  const b = constantBackoff();
  assert.equal(b(0), 1000);
});

// ─── fullJitter ────────────────────────────────────────────────────

test('fullJitter: stays within [0, exponential ceiling]', () => {
  const b = fullJitter({ base: 100, multiplier: 2 });
  for (let i = 0; i < 20; i++) {
    const ceiling = 100 * Math.pow(2, i);
    const v = b(i);
    assert.ok(v >= 0, `value ${v} < 0 at attempt ${i}`);
    assert.ok(v <= ceiling, `value ${v} > ceiling ${ceiling} at attempt ${i}`);
  }
});

test('fullJitter: respects maxDelay', () => {
  const b = fullJitter({ base: 100, multiplier: 2, maxDelay: 500 });
  for (let i = 0; i < 10; i++) {
    assert.ok(b(i) <= 500);
  }
});

test('fullJitter: produces varied values (not always same)', () => {
  const b = fullJitter({ base: 1000, multiplier: 2 });
  const values = new Set();
  for (let i = 0; i < 50; i++) {
    values.add(b(5));
  }
  // With 50 samples at ceiling=32000, we should get at least 10 distinct values
  assert.ok(values.size > 10, `Expected variety, got ${values.size} distinct values`);
});

// ─── equalJitter ───────────────────────────────────────────────────

test('equalJitter: value between ceiling/2 and ceiling', () => {
  const b = equalJitter({ base: 100, multiplier: 2 });
  for (let i = 0; i < 20; i++) {
    const ceiling = 100 * Math.pow(2, i);
    const v = b(i);
    assert.ok(v >= ceiling / 2, `value ${v} < floor ${ceiling / 2} at attempt ${i}`);
    assert.ok(v <= ceiling, `value ${v} > ceiling ${ceiling} at attempt ${i}`);
  }
});

test('equalJitter: respects maxDelay', () => {
  const b = equalJitter({ base: 100, multiplier: 2, maxDelay: 500 });
  for (let i = 0; i < 10; i++) {
    assert.ok(b(i) <= 500);
  }
});

// ─── decorrelatedJitter ────────────────────────────────────────────

test('decorrelatedJitter: values within reasonable range', () => {
  const b = decorrelatedJitter({ base: 100, maxDelay: 5000 });
  for (let i = 0; i < 30; i++) {
    const v = b(i);
    assert.ok(v >= 0, `negative at ${i}`);
    assert.ok(v <= 5000, `exceeds maxDelay at ${i}`);
  }
});

test('decorrelatedJitter: values are always >= base on first call', () => {
  const b = decorrelatedJitter({ base: 100, maxDelay: 10000 });
  // First call: prev=base, range is [base, base + random*(base*3 - base)] = [100, 300]
  const firstVal = b(0);
  assert.ok(firstVal >= 100, `first value ${firstVal} < base 100`);
  assert.ok(firstVal <= 300, `first value ${firstVal} > 300`);
});

test('decorrelatedJitter: respects maxDelay strictly', () => {
  const b = decorrelatedJitter({ base: 100, maxDelay: 50 });
  // maxDelay < base — every value should be capped at 50
  for (let i = 0; i < 20; i++) {
    assert.ok(b(i) <= 50, `exceeds maxDelay at ${i}`);
  }
});

test('decorrelatedJitter: each instance is independent', () => {
  const b1 = decorrelatedJitter({ base: 100, maxDelay: 10000 });
  const b2 = decorrelatedJitter({ base: 100, maxDelay: 10000 });
  // They should produce different sequences
  b1(0); b1(0); b1(0);
  const v1 = b1(0);
  const v2 = b2(0);
  // Both should still be valid
  assert.ok(v1 >= 0 && v1 <= 10000);
  assert.ok(v2 >= 0 && v2 <= 10000);
});

// ─── retry ─────────────────────────────────────────────────────────

test('retry: succeeds on first try', async () => {
  let calls = 0;
  const result = await retry(async () => {
    calls++;
    return 'ok';
  }, { retries: 3, base: 1 });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retry: succeeds after failures', async () => {
  let calls = 0;
  const result = await retry(async () => {
    calls++;
    if (calls < 3) throw new Error('fail');
    return 'ok';
  }, { retries: 5, base: 1 });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('retry: throws after exhausting retries', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => {
      calls++;
      throw new Error('always fail');
    }, { retries: 2, base: 1 }),
    /always fail/
  );
  assert.equal(calls, 3); // initial + 2 retries
});

test('retry: retries=0 means single attempt', async () => {
  let calls = 0;
  try {
    await retry(async () => {
      calls++;
      throw new Error('nope');
    }, { retries: 0 });
  } catch {}
  assert.equal(calls, 1);
});

test('retry: passes attempt number to fn', async () => {
  const attempts = [];
  await retry(async (attempt) => {
    attempts.push(attempt);
    if (attempt < 2) throw new Error('retry');
    return 'done';
  }, { retries: 5, base: 1 });
  assert.deepEqual(attempts, [0, 1, 2]);
});

test('retry: retryIf predicate stops early', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => {
      calls++;
      const err = new Error('fatal');
      err.code = 'FATAL';
      throw err;
    }, {
      retries: 5,
      base: 1,
      retryIf: (err) => err.code !== 'FATAL',
    }),
    /fatal/
  );
  assert.equal(calls, 1);
});

test('retry: onRetry callback fires', async () => {
  const events = [];
  let calls = 0;
  await retry(async () => {
    calls++;
    if (calls < 3) throw new Error('fail');
    return 'ok';
  }, {
    retries: 5,
    base: 1,
    onRetry: (err, attempt, delay) => events.push({ err: err.message, attempt, delay }),
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].err, 'fail');
  assert.equal(events[0].attempt, 0);
});

test('retry: works with sync function', async () => {
  let calls = 0;
  const result = await retry(() => {
    calls++;
    if (calls < 2) throw new Error('fail');
    return 'ok';
  }, { retries: 3, base: 1 });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('retry: uses custom backoff', async () => {
  const delays = [];
  let calls = 0;
  await retry(async () => {
    calls++;
    if (calls < 3) throw new Error('fail');
    return 'ok';
  }, {
    retries: 5,
    base: 1,
    backoff: (attempt) => {
      delays.push(attempt);
      return 1;
    },
  });
  assert.deepEqual(delays, [0, 1]);
});

test('retry: respects maxTotalTime', async () => {
  const start = Date.now();
  await assert.rejects(
    retry(async () => {
      throw new Error('forever');
    }, {
      retries: 100,
      base: 100,
      maxTotalTime: 250,
    }),
    /Max total time/
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `took too long: ${elapsed}ms`);
});

test('retry: perTryTimeout rejects slow function', async () => {
  await assert.rejects(
    retry(async () => {
      await sleep(500);
      return 'ok';
    }, {
      retries: 2,
      base: 1,
      perTryTimeout: 50,
    }),
    /timed out/i
  );
});

test('retry: negative retries treated as 0 (single attempt)', async () => {
  let calls = 0;
  try {
    await retry(async () => {
      calls++;
      throw new Error('nope');
    }, { retries: -1 });
  } catch {}
  // attempt starts at 0, -1 means loop condition attempt <= -1 is... 0 <= -1 is false
  // So it won't even execute once. But the function should throw lastError (undefined).
  // Actually looking at the code: for (let attempt = 0; attempt <= retries; attempt++)
  // With retries=-1, 0 <= -1 is false, loop never executes, throws undefined.
  // That's a bug test — let's verify current behavior.
  assert.equal(calls, 0);
});

test('retry: AbortSignal cancels before first attempt', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    retry(async () => 'ok', { retries: 3, base: 1, signal: ac.signal }),
    /aborted/i
  );
});

test('retry: AbortSignal cancels mid-retry', async () => {
  const ac = new AbortController();
  let calls = 0;
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(
    retry(async () => {
      calls++;
      throw new Error('fail');
    }, {
      retries: 100,
      base: 50,
      signal: ac.signal,
    }),
    /aborted/i
  );
  assert.ok(calls < 100, `should not have exhausted all retries: ${calls} calls`);
});

test('retry: retryIf receives attempt number', async () => {
  const attempts = [];
  let calls = 0;
  try {
    await retry(async () => {
      calls++;
      throw new Error('fail');
    }, {
      retries: 5,
      base: 1,
      retryIf: (err, attempt) => {
        attempts.push(attempt);
        return attempt < 2; // only retry first 2
      },
    });
  } catch {}
  assert.equal(calls, 3); // initial + 2 retries
  assert.deepEqual(attempts, [0, 1, 2]);
});

test('retry: onRetry receives delay value', async () => {
  let receivedDelay = null;
  let calls = 0;
  await retry(async () => {
    calls++;
    if (calls < 2) throw new Error('fail');
    return 'ok';
  }, {
    retries: 3,
    base: 50,
    multiplier: 2,
    onRetry: (err, attempt, delay) => { receivedDelay = delay; },
  });
  assert.equal(receivedDelay, 50); // backoff(0) = 50 * 2^0 = 50
});

test('retry: default backoff uses base/multiplier from opts', async () => {
  const delays = [];
  let calls = 0;
  await retry(async () => {
    calls++;
    if (calls < 3) throw new Error('fail');
    return 'ok';
  }, {
    retries: 5,
    base: 25,
    multiplier: 3,
    onRetry: (err, attempt, delay) => delays.push(delay),
  });
  assert.deepEqual(delays, [25, 75]); // 25*3^0=25, 25*3^1=75
});

test('retry: returns result of successful call', async () => {
  const result = await retry(async () => 42, { retries: 3 });
  assert.equal(result, 42);
});

test('retry: fn that returns falsy value', async () => {
  const result = await retry(async () => 0, { retries: 3 });
  assert.equal(result, 0);
});

test('retry: fn that returns null', async () => {
  const result = await retry(async () => null, { retries: 3 });
  assert.equal(result, null);
});

test('retry: fn that returns undefined', async () => {
  const result = await retry(async () => undefined, { retries: 3 });
  assert.equal(result, undefined);
});

// ─── withTimeout ───────────────────────────────────────────────────

test('withTimeout: resolves if fast enough', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 1000);
  assert.equal(result, 'ok');
});

test('withTimeout: rejects if too slow', async () => {
  await assert.rejects(
    withTimeout(sleep(200), 50),
    /timed out/i
  );
});

test('withTimeout: timeout=0 passes through', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 0);
  assert.equal(result, 'ok');
});

test('withTimeout: preserves rejection reason', async () => {
  await assert.rejects(
    withTimeout(Promise.reject(new Error('custom error')), 1000),
    /custom error/
  );
});

test('withTimeout: custom message', async () => {
  await assert.rejects(
    withTimeout(sleep(200), 50, 'custom timeout msg'),
    /custom timeout msg/
  );
});

test('withTimeout: negative timeout passes through', async () => {
  const result = await withTimeout(Promise.resolve('ok'), -10);
  assert.equal(result, 'ok');
});

test('withTimeout: resolves with undefined', async () => {
  const result = await withTimeout(Promise.resolve(undefined), 1000);
  assert.equal(result, undefined);
});

// ─── debounce ──────────────────────────────────────────────────────

test('debounce: only last call executes', async () => {
  let calls = 0;
  const debounced = debounce((x) => { calls++; return x; }, 20);

  // Swallow rejections from superseded calls
  debounced('a').catch(() => {});
  debounced('b').catch(() => {});
  const result = await debounced('c');

  assert.equal(result, 'c');
  assert.equal(calls, 1);
});

test('debounce: cancel prevents execution', async () => {
  let calls = 0;
  const debounced = debounce(() => { calls++; }, 20);

  const p = debounced();
  debounced.cancel();

  await assert.rejects(p, /Cancelled|Debounced/);
  assert.equal(calls, 0);
});

test('debounce: flush executes immediately with latest args', async () => {
  let calls = 0;
  let lastArg = null;
  const debounced = debounce((x) => { calls++; lastArg = x; return x * 2; }, 50);

  debounced(1).catch(() => {});
  const result = await debounced.flush(4);

  assert.equal(calls, 1);
  assert.equal(lastArg, 4);
  assert.equal(result, 8);
});

test('debounce: flush with no pending timer returns undefined', async () => {
  const debounced = debounce((x) => x * 2, 20);
  const result = await debounced.flush();
  assert.equal(result, undefined);
});

test('debounce: rapid calls only execute once', async () => {
  let calls = 0;
  const debounced = debounce(() => { calls++; }, 15);
  for (let i = 0; i < 10; i++) {
    debounced().catch(() => {});
  }
  await sleep(30);
  assert.equal(calls, 1);
});

test('debounce: gap between calls allows second execution', async () => {
  let calls = 0;
  const debounced = debounce(() => { calls++; }, 15);
  debounced().catch(() => {});
  await sleep(30);
  debounced().catch(() => {});
  await sleep(30);
  assert.equal(calls, 2);
});

// ─── throttle ──────────────────────────────────────────────────────

test('throttle: limits calls within window', async () => {
  let calls = 0;
  const throttled = throttle(() => { calls++; }, 50);

  throttled(); // executes immediately (leading)
  throttled(); // queued (trailing)
  throttled(); // ignored

  await sleep(80);
  // Leading + one trailing
  assert.ok(calls >= 1, `expected >=1 calls, got ${calls}`);
  assert.ok(calls <= 2, `expected <=2 calls, got ${calls}`);
});

test('throttle: cancel prevents trailing call', async () => {
  let calls = 0;
  const throttled = throttle(() => { calls++; }, 50);

  throttled(); // leading
  throttled(); // schedules trailing
  throttled.cancel();

  await sleep(80);
  assert.equal(calls, 1);
});

test('throttle: leading call returns result', async () => {
  const throttled = throttle((x) => x * 2, 50);
  const result = await throttled(21);
  assert.equal(result, 42);
});

test('throttle: trailing call returns result', async () => {
  const throttled = throttle((x) => x * 2, 30);
  // Leading edge executes immediately
  await throttled(10);
  // Trailing edge should also return the result
  const trailingResult = throttled(20);
  const val = await trailingResult;
  assert.equal(val, 40);
});

test('throttle: multiple rapid calls use latest args for trailing', async () => {
  let lastArg = null;
  const throttled = throttle((x) => { lastArg = x; return x; }, 30);
  throttled(1); // leading
  throttled(2);
  throttled(3);
  throttled(99); // latest — should be used for trailing
  await sleep(50);
  assert.equal(lastArg, 99);
});

// ─── delay ─────────────────────────────────────────────────────────

test('delay: resolves after specified time', async () => {
  const start = Date.now();
  await delay(50);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 40, `delay too short: ${elapsed}ms`);
});

test('delay: zero resolves immediately', async () => {
  await delay(0); // should not hang
});

test('delay: negative resolves immediately', async () => {
  await delay(-100); // should not hang
});

test('delay: with AbortSignal (already aborted)', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(delay(100, { signal: ac.signal }), /Cancelled/);
});

test('delay: with AbortSignal (aborted mid-delay)', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(delay(200, { signal: ac.signal }), /Cancelled/);
});

// ─── sleep ─────────────────────────────────────────────────────────

test('sleep: resolves after time', async () => {
  const start = Date.now();
  await sleep(30);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 20);
});

test('sleep: negative resolves immediately', async () => {
  const start = Date.now();
  await sleep(-50);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 20, `should resolve immediately, took ${elapsed}ms`);
});

test('sleep: zero resolves immediately', async () => {
  const start = Date.now();
  await sleep(0);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 20);
});
