/**
 * Test runner for ParameterMapper
 * Handles path issues by changing directory programmatically
 */

const path = require('path');
const { spawn } = require('child_process');

// Get the script directory
const scriptDir = __dirname;

console.log('Test directory:', scriptDir);
console.log('Changing to script directory...\n');

// Change to the script directory
process.chdir(scriptDir);

console.log('Current working directory:', process.cwd());
console.log('Running ParameterMapper tests...\n');

// Spawn a new node process to run the test
const testProcess = spawn('node', ['tests/test-parameter-mapper-standalone.js'], {
  cwd: scriptDir,
  stdio: 'inherit',
  shell: true
});

testProcess.on('close', (code) => {
  console.log(`\nTest process exited with code ${code}`);
  process.exit(code);
});

testProcess.on('error', (err) => {
  console.error('Failed to start test process:', err);
  process.exit(1);
});
