#!/usr/bin/env node
/**
 * Next.js Standalone Server for Railway
 * Simple wrapper to ensure PORT is set correctly
 */

// Set PORT from environment or default
const port = parseInt(process.env.PORT || '3000', 10);
process.env.PORT = port.toString();

// Railway requires binding to 0.0.0.0
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// Next.js standalone build creates server.js in .next/standalone
// We need to change to that directory and run it
const path = require('path');
const fs = require('fs');

const standaloneDir = path.join(__dirname, '.next/standalone');
const standaloneServerPath = path.join(standaloneDir, 'server.js');

if (!fs.existsSync(standaloneServerPath)) {
  console.error(`❌ Standalone server not found at: ${standaloneServerPath}`);
  console.error('💡 Make sure you have run: npm run build');
  process.exit(1);
}

// Change to standalone directory (Next.js expects to run from there)
process.chdir(standaloneDir);

// Copy static files if needed
const staticSource = path.join(__dirname, '.next/static');
const staticDest = path.join(standaloneDir, '.next/static');

if (fs.existsSync(staticSource) && !fs.existsSync(staticDest)) {
  const { execSync } = require('child_process');
  try {
    execSync(`cp -r "${staticSource}" "${path.join(standaloneDir, '.next')}"`, { stdio: 'inherit' });
    console.log('✅ Static files copied');
  } catch (error) {
    console.warn('⚠️  Could not copy static files automatically');
  }
}

// Copy public directory if it exists
const publicSource = path.join(__dirname, 'public');
const publicDest = path.join(standaloneDir, 'public');

if (fs.existsSync(publicSource) && !fs.existsSync(publicDest)) {
  const { execSync } = require('child_process');
  try {
    execSync(`cp -r "${publicSource}" "${standaloneDir}"`, { stdio: 'inherit' });
    console.log('✅ Public directory copied');
  } catch (error) {
    console.warn('⚠️  Could not copy public directory automatically');
  }
}

console.log(`🚀 Starting Next.js server on port ${port}`);

// Load and start the standalone server
try {
  require('./server.js');
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
