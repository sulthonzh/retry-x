# retry-x

Zero-dependency retry with composable backoff strategies, timeout, debounce, and throttle.

## Install

```bash
npm install retry-x
```

## Why

Every project needs retry logic eventually. Most implementations are ad-hoc — a `for` loop with `setTimeout` and some magic numbers. `retry-x` gives you battle-tested backoff strategies in a tiny, zero-dependency package.

## Quick Start

```js
import { retry } from 'retry-x';

// Retry an async function with exponential backoff
const data = await retry(
  () => fetch('https://api.example.com/data').then(r => r.json()),
  { retries: 5, base: 200 }
);
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

Each delay depends on the previous one, reducing synchronization:

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
```

## CLI

```bash
# Retry a curl command with full jitter
retry-x -n 5 -s full-jitter -- curl -s https://api.example.com

# With per-try timeout
retry-x -n 3 -t 2000 -- node worker.js

# Verbose mode
retry-x -n 10 -s decorrelated -v -- npm run build
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

## License

MIT
