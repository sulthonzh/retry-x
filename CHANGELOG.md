# Changelog

## 1.1.0 — 2026-06-20

### Fixed
- **`debounce().flush()` returned `undefined` instead of a Promise** when no timer was pending. Now always returns a Promise.
- **`debounce().flush()` didn't propagate errors** to the original caller's promise. Now rejects properly.
- **`throttle()` trailing calls returned `Promise.resolve()` (undefined result)** instead of the actual return value of `fn()`. Callers can now await the trailing result.
- **`throttle()` multiple overlapping trailing calls** could lose the resolve callback. Now properly chains.

### Added
- `--version` / `-V` / `version` CLI flag to print version
- `VERSION` export constant (`import { VERSION } from 'retry-x'`)
- `exports` field in package.json for clean ESM consumption
- `files` field (only ships index.js, cli.js, README, CHANGELOG, LICENSE)
- `engines` field (Node >=18)
- `test:core` script for running only core tests
- JSDoc on all backoff strategy factories documenting return types
- JSDoc on `decorrelatedJitter` documenting per-instance state

### Changed
- CLI now rejects unknown flags with exit code 2 instead of silently ignoring
- CLI `parseInt` now uses radix 10 explicitly
- CLI help text includes `-V, --version` option

## 1.0.0 — 2026-06-16

### Initial Release
- Core `retry()` function with configurable backoff
- 6 backoff strategies: exponential, linear, constant, full jitter, equal jitter, decorrelated jitter
- `withTimeout()` — reject promises after a deadline
- `debounce()` — trailing-edge debouncer with `.cancel()` and `.flush()`
- `throttle()` — rate limiter with leading + trailing edge
- `delay()` / `sleep()` — promise-based timers
- CLI tool for retrying shell commands
- `retryIf` predicate, `onRetry` callback, `AbortSignal` support
- `maxTotalTime` budget, `perTryTimeout` per-attempt deadline
- 32 tests covering all functionality
