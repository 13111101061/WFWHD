// Test runner for ParameterMapper
const path = require('path');
const { runTests } = require('./test-parameter-mapper');

console.log('Starting ParameterMapper tests...\n');

runTests()
  .then(success => {
    console.log('\nTests completed.');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
