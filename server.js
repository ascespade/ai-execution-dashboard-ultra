#!/usr/bin/env node
/**
 * Next.js Standalone Server for Railway
 * Ensures PORT is properly set before loading standalone server
 */

// Set PORT before requiring standalone server
const port = parseInt(process.env.PORT || '3000', 10);
process.env.PORT = port.toString();
process.env.HOSTNAME = '0.0.0.0';

// Load and start the standalone server
try {
  // Next.js standalone server expects PORT to be set
  require('./.next/standalone/server.js');
} catch (error) {
  console.error('❌ Failed to load standalone server:', error.message);
  console.error('Make sure you have run: npm run build');
  process.exit(1);
}
