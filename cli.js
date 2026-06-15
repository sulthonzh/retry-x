#!/usr/bin/env node
'use strict';

import { retry, exponentialBackoff, fullJitter, equalJitter, decorrelatedJitter, linearBackoff, constantBackoff } from './index.js';

function usage() {
  console.log(`
retry-x — retry commands with backoff

USAGE
  retry-x [options] -- <command> [args...]

OPTIONS
  -n, --retries <n>         Max retry attempts (default: 3)
  -b, --base <ms>           Base delay in ms (default: 100)
  -m, --multiplier <f>      Backoff multiplier (default: 2)
  -M, --max-delay <ms>      Max delay cap (default: Infinity)
  -T, --max-total <ms>      Total time budget (default: Infinity)
  -t, --timeout <ms>        Per-try timeout (default: 0 = off)
  -s, --strategy <name>     backoff|full-jitter|equal-jitter|decorrelated|linear|constant
  -v, --verbose             Print retry attempts

EXAMPLES
  retry-x -n 5 -s full-jitter -- curl -s https://api.example.com
  retry-x -n 3 -t 2000 -- node worker.js
`);
}

function parseArgs(argv) {
  const opts = {
    retries: 3,
    base: 100,
    multiplier: 2,
    maxDelay: Infinity,
    maxTotal: Infinity,
    timeout: 0,
    strategy: 'exponential',
    verbose: false,
  };
  const cmd = [];
  let inCmd = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (inCmd) {
      cmd.push(arg);
      continue;
    }
    if (arg === '--') { inCmd = true; continue; }
    switch (arg) {
      case '-n': case '--retries': opts.retries = parseInt(argv[++i]); break;
      case '-b': case '--base': opts.base = parseInt(argv[++i]); break;
      case '-m': case '--multiplier': opts.multiplier = parseFloat(argv[++i]); break;
      case '-M': case '--max-delay': opts.maxDelay = parseInt(argv[++i]); break;
      case '-T': case '--max-total': opts.maxTotal = parseInt(argv[++i]); break;
      case '-t': case '--timeout': opts.timeout = parseInt(argv[++i]); break;
      case '-s': case '--strategy': opts.strategy = argv[++i]; break;
      case '-v': case '--verbose': opts.verbose = true; break;
      case '-h': case '--help': usage(); process.exit(0);
      default:
        // If it looks like a flag we don't know, skip
        break;
    }
  }

  return { opts, cmd };
}

async function main() {
  const { opts, cmd } = parseArgs(process.argv);

  if (cmd.length === 0) {
    usage();
    process.exit(1);
  }

  const strategies = {
    exponential: exponentialBackoff({ base: opts.base, multiplier: opts.multiplier, maxDelay: opts.maxDelay }),
    'full-jitter': fullJitter({ base: opts.base, multiplier: opts.multiplier, maxDelay: opts.maxDelay }),
    'equal-jitter': equalJitter({ base: opts.base, multiplier: opts.multiplier, maxDelay: opts.maxDelay }),
    decorrelated: decorrelatedJitter({ base: opts.base, maxDelay: opts.maxDelay }),
    linear: linearBackoff({ base: opts.base, step: opts.base, maxDelay: opts.maxDelay }),
    constant: constantBackoff({ delay: opts.base }),
  };

  const backoff = strategies[opts.strategy] || strategies.exponential;

  const { spawn } = await import('child_process');

  let attempt = 0;
  const fn = async () => {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code === 0) resolve(0);
        else reject(new Error(`Exit code ${code}`));
      });
      child.on('error', reject);
    });
    return exitCode;
  };

  try {
    await retry(fn, {
      retries: opts.retries,
      backoff,
      maxTotalTime: opts.maxTotal,
      perTryTimeout: opts.timeout,
      onRetry: opts.verbose
        ? (err, attempt, delay) => {
            console.error(`[retry-x] attempt ${attempt + 1} failed: ${err.message}. Retrying in ${Math.round(delay)}ms...`);
          }
        : null,
    });
    process.exit(0);
  } catch (err) {
    if (opts.verbose) console.error(`[retry-x] all retries exhausted: ${err.message}`);
    process.exit(1);
  }
}

main();
