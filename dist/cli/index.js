#!/usr/bin/env node
import { retry } from '../index.js';
import { program } from 'commander';
program
    .name('retry-x')
    .description('CLI tool for testing retry-x library')
    .version('1.0.0');
program
    .command('test')
    .description('Run retry tests with different scenarios')
    .option('-s, --scenario <type>', 'Test scenario (success, failure, network, timeout)', 'success')
    .option('-a, --attempts <number>', 'Max attempts', '3')
    .option('-d, --delay <number>', 'Base delay in ms', '1000')
    .option('-b, --backoff <type>', 'Backoff strategy (fixed, exponential, linear, fibonacci)', 'fixed')
    .option('-j, --jitter', 'Enable jitter', false)
    .option('-t, --timeout <number>', 'Timeout per attempt in ms')
    .action(async (options) => {
    const { scenario, attempts: maxAttempts, delay, backoff, jitter, timeout } = options;
    console.log(`\n🔄 Testing retry-x with scenario: ${scenario}`);
    console.log(`Configuration: ${maxAttempts} attempts, ${delay}ms delay, ${backoff} backoff${jitter ? ', jitter enabled' : ''}${timeout ? `, ${timeout}ms timeout` : ''}`);
    const retryOptions = {
        maxAttempts: parseInt(maxAttempts),
        delay: parseInt(delay),
        backoff: backoff,
        jitter: !!jitter,
        timeout: timeout ? parseInt(timeout) : undefined,
        onAttempt: (attempt, error) => {
            console.log(`📝 Attempt ${attempt}/${maxAttempts}${error ? ` (Error: ${error.message})` : ''}`);
        },
        onRetry: (attempt, error, retryDelay) => {
            console.log(`⏳ Retrying in ${retryDelay}ms... (Attempt ${attempt}/${maxAttempts})`);
        },
        onSuccess: (result, attempts, totalTime) => {
            console.log(`✅ Success after ${attempts} attempts in ${totalTime}ms`);
            console.log(`📊 Result:`, result);
        },
        onFailure: (error, attempts, totalTime) => {
            console.log(`❌ Failed after ${attempts} attempts in ${totalTime}ms`);
            console.log(`💀 Final error:`, error.message);
        }
    };
    let testFn;
    switch (scenario) {
        case 'success':
            testFn = async () => {
                console.log('🎯 Simulating successful operation');
                return { success: true, message: 'Operation completed' };
            };
            break;
        case 'failure':
            testFn = async () => {
                console.log('💥 Simulating always-failing operation');
                throw new Error('Always fails');
            };
            break;
        case 'network':
            testFn = async () => {
                console.log('🌐 Simulating network operation with intermittent failures');
                const attemptNum = retryOptions.onAttempt ? retryOptions.onAttempt.length + 1 : 1;
                if (attemptNum <= 2) {
                    throw new Error('Network timeout');
                }
                return { success: true, message: 'Network request succeeded' };
            };
            break;
        case 'timeout':
            testFn = async () => {
                console.log('⏱️ Simulating slow operation');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return { success: true, message: 'Operation completed (slow)' };
            };
            break;
        default:
            console.log(`❌ Unknown scenario: ${scenario}`);
            process.exit(1);
    }
    try {
        const result = await retry(testFn, retryOptions);
        console.log('\n🎉 Test completed successfully!');
        console.log(`📊 Stats:`, result.stats);
    }
    catch (error) {
        console.log('\n💥 Test failed as expected');
        console.log(`📊 Stats:`, error.stats);
    }
});
program
    .command('benchmark')
    .description('Run performance benchmarks')
    .option('-n, --iterations <number>', 'Number of iterations', '100')
    .option('-a, --attempts <number>', 'Max attempts per retry', '3')
    .option('-d, --delay <number>', 'Delay between attempts in ms', '100')
    .action(async (options) => {
    const { iterations, attempts, delay } = options;
    console.log(`🏃 Running benchmark: ${iterations} iterations, ${attempts} attempts, ${delay}ms delay`);
    const testFn = async () => {
        return { success: true, timestamp: Date.now() };
    };
    const retryOptions = {
        maxAttempts: parseInt(attempts),
        delay: parseInt(delay)
    };
    const startTime = Date.now();
    const results = [];
    for (let i = 0; i < parseInt(iterations); i++) {
        try {
            const result = await retry(testFn, retryOptions);
            results.push(result.stats);
        }
        catch (error) {
            results.push(error.stats);
        }
    }
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / results.length;
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    console.log(`\n📊 Benchmark Results:`);
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Average time per iteration: ${avgTime.toFixed(2)}ms`);
    console.log(`Successful: ${successful}/${results.length} (${(successful / results.length * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failed}/${results.length} (${(failed / results.length * 100).toFixed(1)}%)`);
    const avgAttempts = results.reduce((sum, r) => sum + r.attempts, 0) / results.length;
    const avgTotalTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
    console.log(`Average attempts: ${avgAttempts.toFixed(2)}`);
    console.log(`Average total time: ${avgTotalTime.toFixed(2)}ms`);
});
program
    .command('example')
    .description('Show usage examples')
    .option('-t, --type <type>', 'Example type (basic, advanced, api, database)', 'basic')
    .action((options) => {
    const { type } = options;
    console.log(`\n📚 ${type.toUpperCase()} Examples for retry-x\n`);
    switch (type) {
        case 'basic':
            console.log(`// Basic retry with fixed delay
const { retry } = require('retry-x');

async function fetchData() {
  return retry(async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  }, {
    maxAttempts: 3,
    delay: 1000
  });
}`);
            break;
        case 'advanced':
            console.log(`// Advanced retry with exponential backoff and custom conditions
const { retry } = require('retry-x');

async function resilientApiCall() {
  return retry(async () => {
    const response = await fetch('https://api.example.com/data');
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
      throw new Error('Rate limited');
    }
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return response.json();
  }, {
    maxAttempts: 5,
    backoff: 'exponential',
    delay: 500,
    maxDelay: 10000,
    jitter: true,
    shouldRetry: (error) => {
      return error.message.includes('Rate limited') || 
             error.message.startsWith('HTTP 5');
    }
  });
}`);
            break;
        case 'api':
            console.log(`// API client with retry
const { retry } = require('retry-x');

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async get(endpoint) {
    return retry(async () => {
      const response = await fetch(\`\${this.baseUrl}\${endpoint}\`);
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}\`);
      }
      return response.json();
    }, {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      shouldRetry: (error) => {
        return error.message.startsWith('HTTP 5') || 
               error.message.includes('Network');
      }
    });
  }
}

// Usage
const client = new ApiClient('https://api.example.com');
const data = await client.get('/users');
`);
            break;
        case 'database':
            console.log(`// Database operations with retry
const { retry } = require('retry-x');

async function insertUser(userData) {
  return retry(async () => {
    const connection = await getConnection();
    const result = await connection.query(
      'INSERT INTO users SET ?', 
      userData
    );
    
    if (result.affectedRows === 0) {
      throw new Error('Insert failed');
    }
    
    return result;
  }, {
    maxAttempts: 3,
    backoff: 'exponential',
    delay: 2000,
    retryOn: (attempt, error) => {
      // Retry on deadlock and connection errors
      return error.code === 'ER_LOCK_DEADLOCK' || 
             error.code === 'ECONNRESET';
    }
  });
}`);
            break;
        default:
            console.log(`❌ Unknown example type: ${type}`);
            process.exit(1);
    }
});
program
    .command('info')
    .description('Show library information and supported options')
    .action(() => {
    console.log(`
📚 retry-x Library Information

🎯 Purpose: Zero-dependency retry mechanism library for Node.js

🔧 Features:
• Multiple retry strategies: fixed, exponential, linear, fibonacci
• Advanced backoff algorithms with jitter support
• Flexible configuration with custom retry conditions
• Comprehensive error handling and monitoring
• TypeScript support with full type safety
• Zero external dependencies

📦 Installation:
npm install retry-x
# or
yarn add retry-x

🚀 Usage:
const { retry } = require('retry-x');

// Basic usage
const result = await retry(fn, {
  maxAttempts: 3,
  delay: 1000,
  backoff: 'exponential'
});

📚 Available Backoff Strategies:
• fixed - Constant delay between attempts
• exponential - Delay doubles each time (base * 2^(n-1))
• linear - Delay increases linearly (base * n)
• fibonacci - Delay follows Fibonacci sequence

🔧 Available Options:
• maxAttempts - Maximum number of retry attempts
• delay - Base delay in milliseconds
• maxDelay - Maximum delay in milliseconds  
• backoff - Backoff strategy
• jitter - Add randomness to delays
• jitterType - 'full' or 'equal' jitter
• retryOn - Custom retry condition function
• shouldRetry - Function to determine retry on errors
• onAttempt - Callback for each attempt
• onRetry - Callback for each retry
• onSuccess - Callback for successful operation
• onFailure - Callback for final failure
• timeout - Timeout per attempt in milliseconds

💡 Pro Tips:
• Use exponential backoff for network operations
• Add jitter to prevent thundering herd problems
• Combine with shouldRetry for smart error handling
• Use monitoring callbacks for debugging and observability

📖 For more examples, run: retry-x example --type <basic|advanced|api|database>
`);
});
program.parse();
//# sourceMappingURL=index.js.map