# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-08

### Added
- `signal` option (AbortSignal) for cancelling retry operations
- Comprehensive edge-case test suite (35 tests): strategy helpers, `withRetry`/`createRetry` curried APIs, `RetryStrategies` matchers, `BackoffStrategies` pure functions, callback error isolation, abort signal support
- Timer cleanup in timeout tests to prevent event loop hangs
- `RetryError` thrown on abort with clear message

### Fixed
- Removed dead `attemptStartTime` variable from `executeAttempt` (was assigned but never read)
- Timeout tests no longer hang the Node.js test runner — background timers are now tracked and cleaned up via `afterEach` hook

### Changed
- `RetryOptions` interface extended with optional `signal?: AbortSignal`
- Timeout tests rewritten with shorter delays (100ms vs 500ms) for faster CI

## [1.0.0] - 2026-07-05

### Added
- Core `retry()` function with configurable attempts, delay, and backoff strategies
- Four backoff strategies: `fixed`, `exponential`, `linear`, `fibonacci`
- Jitter support (`full` and `equal` types) for thundering herd prevention
- Per-attempt timeout with `Promise.race` and proper timer cleanup
- Custom retry conditions: `retryOn(attempt, error)` and `shouldRetry(error)`
- Monitoring callbacks: `onAttempt`, `onRetry`, `onSuccess`, `onFailure`
- `withRetry()` — simplified API that returns the value directly or throws
- `createRetry()` — curried function with preset options
- `RetryError` class with `attempt`, `totalAttempts`, `delays`, and `lastError`
- `RetryStrategies` — preset matchers (network errors, 5xx, rate limit, custom error lists)
- `BackoffStrategies` — pure strategy functions for custom delay calculation
- CLI tool (`retry-x`) with `test`, `benchmark`, `example`, and `info` commands
- Full TypeScript support with strict mode
- Zero runtime dependencies
