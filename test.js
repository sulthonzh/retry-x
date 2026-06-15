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
} from './index.js';

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

// ─── constantBackoff ───────────────────────────────────────────────

test('constantBackoff: always returns same value', () => {
  const b = constantBackoff({ delay: 500 });
  assert.equal(b(0), 500);
  assert.equal(b(100), 500);
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

// ─── decorrelatedJitter ────────────────────────────────────────────

test('decorrelatedJitter: values within reasonable range', () => {
  const b = decorrelatedJitter({ base: 100, maxDelay: 5000 });
  for (let i = 0; i < 30; i++) {
    const v = b(i);
    assert.ok(v >= 0, `negative at ${i}`);
    assert.ok(v <= 5000, `exceeds maxDelay at ${i}`);
  }
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

// ─── sleep ─────────────────────────────────────────────────────────

test('sleep: resolves after time', async () => {
  const start = Date.now();
  await sleep(30);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 20);
});
