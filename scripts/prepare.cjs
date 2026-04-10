#!/usr/bin/env node
/**
 * Cross-platform prepare script — builds the project if src/ exists.
 * Works on Linux, macOS, and Windows.
 */

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

function main() {
  // Check if src directory exists
  if (!existsSync('src')) {
    return;
  }

  try {
    console.log('Building project...');
    execSync('npm run build', {
      stdio: 'inherit',
      shell: true,
      cwd: path.resolve(__dirname, '..')
    });
  } catch (err) {
    // Build failure is non-fatal for prepare
    process.exit(0);
  }
}

main();
