# retry-x

**Production-grade retry logic in 4KB. Zero dependencies.** Battle-tested backoff strategies (exponential, full jitter, decorrelated), per-try timeouts, AbortSignal support, and composable APIs.

## Install

```bash
npm install retry-x
```

## Why

Every project needs retry logic eventually. Most implementations are ad-hoc — a `for` loop with `setTimeout` and some magic numbers. `retry-x` gives you AWS-recommended backoff strategies, time budgets, and cancellation — all in a tiny, zero-dependency package.

## vs Alternatives

| Feature | retry-x | async-retry | p-retry | retry | backoff |
|---------|---------|-------------|---------|-------|---------|
| Zero dependencies | ✅ | ✅ | ❌ (3 deps) | ❌ (2 deps) | ❌ (1 dep) |
| Bundle size | ~4KB | ~3KB | ~5KB | ~8KB | ~12KB |
| Jitter strategies | 3 (full, equal, decorrelated) | 0 | 1 (decorrelated) | 0 | 2 |
| Per-try timeout | ✅ | ❌ | ❌ | ✅ | ✅ |
| Total time budget | ✅ | ❌ | ❌ | ❌ | ❌ |
| AbortSignal support | ✅ | ❌ | ✅ | ❌ | ❌ |
| retryIf predicate | ✅ | ✅ | ✅ | ❌ | ✅ |
| onRetry callback | ✅ | ✅ | ✅ | ❌ | ✅ |
| CLI tool | ✅ | ❌ | ❌ | ❌ | ❌ |
| Debounce/throttle | ✅ | ❌ | ❌ | ❌ | ❌ |

## Quick Start

```js
import { retry } from 'retry-x';

// Retry an async function with exponential backoff
const data = await retry(
  () => fetch('https://api.example.com/data').then(r => r.json()),
  { retries: 5, base: 200 }
);
```

## Real-World Examples

### 1. Resilient API Client (with Full Jitter)

```js
import { retry, fullJitter } from 'retry-x';

async function fetchUserData(userId) {
  return retry(
    async () => {
      const res = await fetch(`/api/users/${userId}`);
      if (res.status === 429) throw new Error('Rate limited');
      if (res.status >= 500) throw new Error('Server error');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    {
      retries: 5,
      backoff: fullJitter({ base: 100, multiplier: 2, maxDelay: 5000 }),
      retryIf: (err) => !err.message.includes('404'), // don't retry not-found
      onRetry: (err, attempt, delay) => {
        console.log(`Attempt ${attempt + 1} failed (${err.message}). Retrying in ${Math.round(delay)}ms`);
      },
    }
  );
}
```

### 2. Database Connection with Total Time Budget

```js
import { retry, decorrelatedJitter } from 'retry-x';

async function connectWithRetry(pool) {
  return retry(
    async () => {
      const conn = await pool.getConnection();
      await conn.ping(); // verify connection is alive
      return conn;
    },
    {
      retries: 10,
      backoff: decorrelatedJitter({ base: 200, maxDelay: 10000 }),
      maxTotalTime: 30000, // give up after 30s total
      perTryTimeout: 5000, // each connection attempt: 5s max
      retryIf: (err) => {
        // Retry connection errors, but not auth errors
        return !err.message.includes('ECONNREFUSED') ||
               err.code === 'ETIMEDOUT' ||
               err.code === 'EPIPE';
      },
    }
  );
}
```

### 3. CI/CD Deploy Pipeline (CLI)

```bash
# Deploy with retry — use full jitter to avoid hammering a recovering server
retry-x -n 10 -s full-jitter -b 500 -M 30000 -v -- npm run deploy

# Health check after deploy — bail after 30s total
retry-x -n 20 -s decorrelated -T 30000 -v -- curl -sf https://app.example.com/health

# Run flaky integration tests with per-try timeout
retry-x -n 3 -t 30000 -- npx playwright test --project=chrome
```

## Backoff Strategies

### Exponential (default)

```js
import { retry, exponentialBackoff } from 'retry-x';

await retry(fn, {
  retries: 5,
  base: 100,       // first delay
  multiplier: 2,   // double each time
  maxDelay: 5000,  // cap at 5s
});
// Delays: 100ms, 200ms, 400ms, 800ms, 1600ms...
```

### Full Jitter (AWS recommended)

Random delay between 0 and the exponential value. Prevents thundering herd:

```js
import { retry, fullJitter } from 'retry-x';

await retry(fn, {
  retries: 5,
  backoff: fullJitter({ base: 100, multiplier: 2, maxDelay: 5000 }),
});
```

### Equal Jitter

Half fixed + half random. Provides a floor so retries aren't too aggressive:

```js
import { equalJitter } from 'retry-x';
```

### Decorrelated Jitter

Each delay depends on the previous one, reducing synchronization. Each instance
maintains its own state — create a new instance per retry chain:

```js
import { decorrelatedJitter } from 'retry-x';
```

### Linear & Constant

```js
import { linearBackoff, constantBackoff } from 'retry-x';

linearBackoff({ base: 100, step: 50 });  // 100, 150, 200, 250...
constantBackoff({ delay: 1000 });         // 1000, 1000, 1000...
```

## Advanced Options

```js
await retry(fn, {
  retries: 10,
  base: 100,
  multiplier: 2,
  maxDelay: 30000,       // cap individual delay
  maxTotalTime: 60000,   // total time budget
  perTryTimeout: 5000,   // timeout per attempt
  retryIf: (err) => err.status >= 500,  // only retry 5xx
  onRetry: (err, attempt, delay) => {
    console.log(`Attempt ${attempt} failed, retrying in ${delay}ms`);
  },
  signal: abortController.signal,  // cancel mid-retry
});
```

## Utilities

### withTimeout

```js
import { withTimeout } from 'retry-x';

// Reject if operation takes >2s
const result = await withTimeout(longRunningOp(), 2000);
```

### debounce

```js
import { debounce } from 'retry-x';

const debounced = debounce(searchAPI, 300);
input.on('change', (e) => debounced(e.target.value));
```

### throttle

```js
import { throttle } from 'retry-x';

const throttled = throttle(scrollHandler, 16); // ~60fps
window.addEventListener('scroll', throttled);
```

### delay / sleep

```js
import { delay, sleep } from 'retry-x';

await sleep(1000); // wait 1s

// delay supports AbortSignal
await delay(5000, { signal: controller.signal });
```

## CLI

```bash
# Retry a curl command with full jitter
retry-x -n 5 -s full-jitter -- curl -s https://api.example.com

# With per-try timeout
retry-x -n 3 -t 2000 -- node worker.js

# Verbose mode
retry-x -n 10 -s decorrelated -v -- npm run build

# Print version
retry-x --version
```

## API Reference

### `retry(fn, opts) → Promise`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retries` | number | 3 | Max retry attempts |
| `base` | number | 100 | Base delay (ms) |
| `multiplier` | number | 2 | Exponential growth |
| `maxDelay` | number | Infinity | Cap on delay |
| `maxTotalTime` | number | Infinity | Total time budget |
| `perTryTimeout` | number | 0 | Timeout per attempt |
| `retryIf` | function | () => true | Predicate to decide retry |
| `onRetry` | function | null | Callback before each retry |
| `signal` | AbortSignal | null | Cancel signal |
| `backoff` | function | exponential | Custom strategy |

### Backoff Functions

Each returns `(attempt) => delayMs`:

- `exponentialBackoff({ base, multiplier, maxDelay })`
- `linearBackoff({ base, step, maxDelay })`
- `constantBackoff({ delay })`
- `fullJitter({ base, multiplier, maxDelay })`
- `equalJitter({ base, multiplier, maxDelay })`
- `decorrelatedJitter({ base, maxDelay })`

### Utility Functions

- `withTimeout(promise, ms, message?)`
- `debounce(fn, ms)` → debounced fn with `.cancel()`, `.flush()`
- `throttle(fn, ms)` → throttled fn with `.cancel()`
- `delay(ms, opts?)` / `sleep(ms)`
- `VERSION` — current version string

## License

MIT
