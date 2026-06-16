import { retry } from './dist/index.js';

console.log('Testing retry-x functionality...\n');

// Test 1: Basic success on first attempt
console.log('Test 1: Basic success');
(async () => {
  try {
    const result = await retry(async () => {
      return { success: true, data: 'test' };
    });
    
    console.log('✅ Success:', result.value);
    console.log('📊 Stats:', result.stats);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }
})();

// Test 2: Retry and succeed
console.log('\nTest 2: Retry and succeed');
(async () => {
  let callCount = 0;
  
  try {
    const result = await retry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt failed');
      }
      return { success: true, data: 'retry success' };
    });
    
    console.log('✅ Success:', result.value);
    console.log('📊 Stats:', result.stats);
    console.log('🔄 Attempts:', callCount);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }
})();

// Test 3: Exponential backoff
console.log('\nTest 3: Exponential backoff');
(async () => {
  let callCount = 0;
  const delays = [];
  
  try {
    await retry(async () => {
      callCount++;
      if (callCount < 4) {
        throw new Error('Failed');
      }
      return 'success';
    }, {
      maxAttempts: 4,
      delay: 100,
      backoff: 'exponential',
      maxDelay: 1000,
      onRetry: (attempt, error, delay) => {
        delays.push(delay);
        console.log(`🔄 Retrying attempt ${attempt} with delay ${delay}ms`);
      }
    });
  } catch (error) {
    console.log('Final delays:', delays);
    console.log('📊 Error stats:', error.delays);
  }
})();