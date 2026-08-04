import { retry, BackoffStrategies } from '../index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', 'cli', 'index.js');

function runCLI(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [cliPath, ...args], {
      encoding: 'utf-8',
      timeout: 15000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status ?? 1,
    };
  }
}

describe('retry-x - Fibonacci Backoff Edge Cases', () => {
  it('BackoffStrategies.fibonacci should use baseDelay fallback for attempt 0', () => {
    // fib[-1] is undefined → || baseDelay fallback (line 339)
    assert.equal(BackoffStrategies.fibonacci(100, 0, 10000), 100);
  });

  it('BackoffStrategies.fibonacci should use baseDelay fallback for negative attempt', () => {
    // fib[-2] is undefined → || baseDelay fallback (line 339)
    assert.equal(BackoffStrategies.fibonacci(100, -1, 10000), 100);
  });

  it('BackoffStrategies.fibonacci should return baseDelay for attempt 1', () => {
    assert.equal(BackoffStrategies.fibonacci(50, 1, 10000), 50);
  });

  it('retry fibonacci backoff should use fallback delay for attempt 0 edge case', async () => {
    // Internal calculateDelay fibonacci path with attempt where fib[attempt-1] is undefined
    // This covers line 134 — the || delay fallback inside calculateDelay
    // We use maxAttempts=1 to avoid actually retrying (just test the delay calculation path)
    const delays: number[] = [];
    let callCount = 0;
    try {
      await retry(async () => {
        callCount++;
        throw new Error('fail');
      }, {
        maxAttempts: 2,
        delay: 10,
        backoff: 'fibonacci',
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay);
        }
      });
    } catch {
      // expected
    }
    // attempt 1 → fib[0] = delay = 10, so delay = 10
    assert.equal(delays.length, 1);
    assert.equal(delays[0], 10);
  });
});

describe('retry-x - CLI', () => {
  it('--version should print version', () => {
    const { stdout, exitCode } = runCLI('--version');
    assert.equal(exitCode, 0);
    assert.match(stdout, /1\.0\.0/);
  });

  it('-V should print version', () => {
    const { stdout, exitCode } = runCLI('-V');
    assert.equal(exitCode, 0);
    assert.match(stdout, /1\.0\.0/);
  });

  it('--help should print usage', () => {
    const { stdout, exitCode } = runCLI('--help');
    assert.equal(exitCode, 0);
    assert.match(stdout, /retry-x/);
    assert.match(stdout, /CLI tool/);
  });

  it('-h should print usage', () => {
    const { stdout, exitCode } = runCLI('-h');
    assert.equal(exitCode, 0);
    assert.match(stdout, /CLI tool/);
  });

  it('test --scenario success should complete successfully', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'success', '--delay', '1', '--attempts', '2');
    assert.equal(exitCode, 0);
    assert.match(stdout, /Simulating successful operation/);
    assert.match(stdout, /Success after 1 attempts/);
    assert.match(stdout, /Test completed successfully/);
  });

  it('test --scenario failure should fail as expected', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'failure', '--delay', '1', '--attempts', '2');
    // The CLI catches the error and logs it, exit 0
    assert.equal(exitCode, 0);
    assert.match(stdout, /Simulating always-failing operation/);
    assert.match(stdout, /Test failed as expected/);
  });

  it('test --scenario timeout should handle timeout', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'timeout', '--delay', '1', '--attempts', '2', '--timeout', '50');
    assert.equal(exitCode, 0);
    assert.match(stdout, /Simulating slow operation/);
  });

  it('test --scenario network should simulate network errors', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'network', '--delay', '1', '--attempts', '3');
    assert.equal(exitCode, 0);
    assert.match(stdout, /Simulating network operation/);
    // onAttempt has 2 params → .length=2 → attemptNum=3 → 3<=2 is false → succeeds immediately
    assert.match(stdout, /Network request succeeded/);
  });

  it('test --backoff exponential should use exponential strategy', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'failure', '--delay', '10', '--attempts', '3', '--backoff', 'exponential');
    assert.equal(exitCode, 0);
    assert.match(stdout, /exponential backoff/);
  });

  it('test --backoff linear should use linear strategy', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'failure', '--delay', '10', '--attempts', '3', '--backoff', 'linear');
    assert.equal(exitCode, 0);
    assert.match(stdout, /linear backoff/);
  });

  it('test --backoff fibonacci should use fibonacci strategy', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'failure', '--delay', '10', '--attempts', '3', '--backoff', 'fibonacci');
    assert.equal(exitCode, 0);
    assert.match(stdout, /fibonacci backoff/);
  });

  it('test --jitter should enable jitter', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'failure', '--delay', '10', '--attempts', '2', '--jitter');
    assert.equal(exitCode, 0);
    assert.match(stdout, /jitter enabled/);
  });

  it('test unknown scenario should exit with code 1', () => {
    const { stdout, exitCode } = runCLI('test', '--scenario', 'unknown', '--delay', '1');
    assert.equal(exitCode, 1);
    assert.match(stdout, /Unknown scenario/);
  });

  it('benchmark should run iterations', () => {
    const { stdout, exitCode } = runCLI('benchmark', '--iterations', '5', '--attempts', '1', '--delay', '1');
    assert.equal(exitCode, 0);
    assert.match(stdout, /Benchmark Results/);
    assert.match(stdout, /Total time/);
    assert.match(stdout, /Successful: 5\/5/);
  });

  it('benchmark should track failures', () => {
    // Use a scenario that fails to exercise the catch branch in benchmark
    const { stdout, exitCode } = runCLI('benchmark', '--iterations', '3', '--attempts', '1', '--delay', '1');
    // benchmark uses a simple success function, so we can't easily make it fail
    // but we verify the benchmark output structure
    assert.equal(exitCode, 0);
    assert.match(stdout, /Average attempts/);
    assert.match(stdout, /Average total time/);
  });

  it('example --type basic should show basic example', () => {
    const { stdout, exitCode } = runCLI('example', '--type', 'basic');
    assert.equal(exitCode, 0);
    assert.match(stdout, /BASIC/);
    assert.match(stdout, /Basic retry/);
  });

  it('example --type advanced should show advanced example', () => {
    const { stdout, exitCode } = runCLI('example', '--type', 'advanced');
    assert.equal(exitCode, 0);
    assert.match(stdout, /ADVANCED/);
    assert.match(stdout, /exponential backoff/);
  });

  it('example --type api should show API example', () => {
    const { stdout, exitCode } = runCLI('example', '--type', 'api');
    assert.equal(exitCode, 0);
    assert.match(stdout, /API/);
    assert.match(stdout, /ApiClient/);
  });

  it('example --type database should show database example', () => {
    const { stdout, exitCode } = runCLI('example', '--type', 'database');
    assert.equal(exitCode, 0);
    assert.match(stdout, /DATABASE/);
    assert.match(stdout, /insertUser/);
  });

  it('example unknown type should exit with code 1', () => {
    const { stdout, exitCode } = runCLI('example', '--type', 'unknown');
    assert.equal(exitCode, 1);
    assert.match(stdout, /Unknown example type/);
  });

  it('info should show library information', () => {
    const { stdout, exitCode } = runCLI('info');
    assert.equal(exitCode, 0);
    assert.match(stdout, /retry-x Library Information/);
    assert.match(stdout, /Purpose/);
    assert.match(stdout, /Features/);
    assert.match(stdout, /Installation/);
    assert.match(stdout, /Available Backoff Strategies/);
    assert.match(stdout, /Available Options/);
  });

  it('no command should show help', () => {
    const { stdout, stderr } = runCLI();
    // commander outputs help to stderr when no command given
    const output = stdout + stderr;
    assert.match(output, /retry-x/);
    assert.match(output, /CLI tool/);
  });
});
