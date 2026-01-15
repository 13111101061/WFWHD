// Test runner that handles directory changes
const path = require('path');

// Change to project root
process.chdir(path.join(__dirname, '..'));

console.log('Current directory:', process.cwd());
console.log('Starting ParameterMapper tests...\n');

// Now import and run the test
require('./quick-test-parameter-mapper');
