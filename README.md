# retry-x - Zero-Dependency Retry Mechanism Library

A powerful, zero-dependency retry library for Node.js with multiple retry strategies, backoff algorithms, and comprehensive error handling.

## Why retry-x?

In distributed systems and network applications, failures are inevitable. `retry-x` provides a clean, configurable way to implement retry logic without adding heavy dependencies to your project.

Whether you're calling APIs, accessing databases, or handling any transient failures, `retry-x` has you covered with:

- **Multiple retry strategies**: Fixed delay, exponential backoff, jitter, Fibonacci
- **Advanced backoff algorithms**: Linear, exponential, full jitter, equal jitter
- **Flexible configuration**: Max attempts, delays, condition-based retry
- **Comprehensive error handling**: Retry only on specific errors, custom retry conditions
- **Monitoring and debugging**: Retry attempts tracking, logging hooks
- **TypeScript support**: Full type safety and IntelliSense

## Installation

```bash
npm install retry-x
# or
yarn add retry-x
# or (zero-dependency)
npm install retry-x --no-optional
```

## Quick Start

```javascript
const { retry } = require('retry-x');

// Simple retry with fixed delay
async function fetchUserData() {
  return retry(async () => {
    const response = await fetch('https://api.example.com/user');
    if (!response.ok) throw new Error('Network error');
    return response.json();
  }, {
    maxAttempts: 3,
    delay: 1000 // 1 second between retries
  });
}

// With exponential backoff
async function databaseQuery() {
  return retry(async () => {
    const result = await db.query('SELECT * FROM users');
    if (result.length === 0) throw new Error('No users found');
    return result;
  }, {
    maxAttempts: 5,
    backoff: 'exponential',
    delay: 500,
    maxDelay: 5000,
    jitter: true
  });
}
```

## API

### retry(fn, options)

Main function that wraps your async operation with retry logic.

```javascript
const result = await retry(async () => {
  // Your async operation here
  return someAsyncOperation();
}, {
  maxAttempts: 3,
  delay: 1000,
  backoff: 'exponential'
});
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | number | 3 | Maximum number of retry attempts |
| `delay` | number | 1000 | Base delay in milliseconds |
| `maxDelay` | number | 30000 | Maximum delay in milliseconds |
| `backoff` | string | 'fixed' | Backoff strategy: 'fixed', 'exponential', 'linear', 'fibonacci' |
| `jitter` | boolean | false | Add jitter to delay to prevent thundering herd |
| `jitterType` | string | 'full' | Jitter type: 'full', 'equal' |
| `retryOn` | function | `() => true` | Custom retry condition function |
| `shouldRetry` | function | `(error) => true` | Function to determine if error should be retried |
| `onAttempt` | function | `undefined` | Callback for each attempt |
| `onRetry` | function | `undefined` | Callback for each retry |
| `onSuccess` | function | `undefined` | Callback for successful operation |
| `onFailure` | function | `undefined` | Callback for final failure |
| `timeout` | number | `undefined` | Timeout for each attempt in milliseconds |

### Retry Strategies

#### Fixed Delay
```javascript
retry(fn, {
  backoff: 'fixed',
  delay: 1000 // Always wait 1 second
});
```

#### Exponential Backoff
```javascript
retry(fn, {
  backoff: 'exponential',
  delay: 500,    // Initial delay: 500ms
  maxDelay: 5000 // Maximum delay: 5000ms
});
// Delays: 500ms, 1000ms, 2000ms, 4000ms, 5000ms, 5000ms...
```

#### Linear Backoff
```javascript
retry(fn, {
  backoff: 'linear',
  delay: 1000,   // Base delay: 1000ms
  maxDelay: 10000 // Maximum delay: 10000ms
});
// Delays: 1000ms, 2000ms, 3000ms, 4000ms, 5000ms...
```

#### Fibonacci Backoff
```javascript
retry(fn, {
  backoff: 'fibonacci',
  delay: 1000 // Initial delay: 1000ms
});
// Delays: 1000ms, 1000ms, 2000ms, 3000ms, 5000ms, 8000ms...
```

### Jitter

Add randomness to delays to prevent multiple clients retrying simultaneously:

```javascript
retry(fn, {
  jitter: true,        // Full jitter
  jitterType: 'full', // or 'equal'
  backoff: 'exponential',
  delay: 1000
});
```

## Advanced Usage

#### Custom Retry Conditions

```javascript
retry(fn, {
  maxAttempts: 5,
  retryOn: (attempt, error) => {
    // Retry only on network errors, timeout errors
    return error.code === 'ECONNRESET' || 
           error.code === 'ETIMEDOUT' ||
           error.message.includes('Network Error');
  },
  shouldRetry: (error) => {
    // Don't retry on 4xx errors
    return !error.response || error.response.status >= 500;
  }
});
```

#### Monitoring and Debugging

```javascript
const result = await retry(fn, {
  maxAttempts: 3,
  delay: 1000,
  onAttempt: (attempt, error) => {
    console.log(`Attempt ${attempt} of 3`);
    if (error) console.log(`Error:`, error.message);
  },
  onRetry: (attempt, error, delay) => {
    console.log(`Retrying in ${delay}ms... (Attempt ${attempt})`);
  },
  onSuccess: (result, attempts, totalTime) => {
    console.log(`Success after ${attempts} attempts in ${totalTime}ms`);
  },
  onFailure: (error, attempts, totalTime) => {
    console.log(`Failed after ${attempts} attempts in ${totalTime}ms`);
  }
});
```

#### Timeout Protection

```javascript
retry(fn, {
  maxAttempts: 3,
  timeout: 5000, // 5 second timeout per attempt
  onAttempt: (attempt) => {
    console.log(`Attempt ${attempt} with 5s timeout`);
  }
});
```

## Error Handling

```javascript
try {
  const result = await retry(fn, {
    maxAttempts: 3,
    shouldRetry: (error) => {
      // Retry only on specific error types
      return error.type === 'NetworkError' || error.type === 'TimeoutError';
    }
  });
  console.log('Success:', result);
} catch (error) {
  console.log('Final failure:', error);
  // This is the error that couldn't be retried
}
```

## Retry Statistics

Access retry information through the result object:

```javascript
const result = await retry(fn, {
  maxAttempts: 3
});

console.log(result.stats);
// {
//   attempts: 3,
//   totalTime: 2500,
//   retries: 2,
//   delays: [1000, 1500],
//   success: true,
//   lastError: null
// }
```

## Examples

### API Client with Retry

```javascript
const { retry } = require('retry-x');

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async get(endpoint, options = {}) {
    return retry(async () => {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
        throw new Error(`Rate limited. Retry after ${delay}ms`);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    }, {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      maxDelay: 10000,
      jitter: true,
      shouldRetry: (error) => {
        // Retry only on 5xx errors and 429
        return error.message.includes('Rate limited') || 
               error.message.startsWith('HTTP 5');
      }
    });
  }
}

// Usage
const client = new ApiClient('https://api.example.com');
const data = await client.get('/users');
```

### Database Operations

```javascript
const { retry } = require('retry-x');

async function insertUser(userData) {
  return retry(async () => {
    const connection = await getConnection();
    const result = await connection.query(
      'INSERT INTO users SET ?', 
      userData
    );
    
    if (result.affectedRows === 0) {
      throw new Error('Failed to insert user');
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
}
```

### File Operations

```javascript
const { retry } = require('retry-x');
const fs = require('fs').promises;

async function readFileWithRetry(filePath) {
  return retry(async () => {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw error;
    }
  }, {
    maxAttempts: 5,
    delay: 100,
    maxDelay: 2000,
    backoff: 'linear'
  });
}
```

## Browser Usage

`retry-x` works in browsers too! Just import it directly:

```javascript
// ES Modules
import { retry } from './node_modules/retry-x/dist/retry-x.esm.js';

// or CommonJS
const { retry } = require('./node_modules/retry-x/dist/retry-x.cjs.js');
```

## Zero Dependencies

`retry-x` has zero external dependencies. It's built using only Node.js built-in modules and modern JavaScript features.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.