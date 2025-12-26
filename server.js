#!/usr/bin/env node
/**
 * Next.js Standalone Server for Railway
 * Simple wrapper to ensure PORT is set correctly and static files are available
 */

const path = require('path');
const fs = require('fs');

// Save original directory before changing
const originalDir = __dirname;

// Set PORT from environment or default
const port = parseInt(process.env.PORT || '3000', 10);
process.env.PORT = port.toString();

// Railway requires binding to 0.0.0.0
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// Next.js standalone build creates server.js in .next/standalone
const standaloneDir = path.join(originalDir, '.next/standalone');
const standaloneServerPath = path.join(standaloneDir, 'server.js');

if (!fs.existsSync(standaloneServerPath)) {
  console.error(`❌ Standalone server not found at: ${standaloneServerPath}`);
  console.error('💡 Make sure you have run: npm run build');
  process.exit(1);
}

// Helper to copy directory recursively
function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((item) => {
      copyRecursiveSync(
        path.join(src, item),
        path.join(dest, item)
      );
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

// Copy static files if needed (using originalDir before chdir)
const staticSource = path.join(originalDir, '.next/static');
const staticDest = path.join(standaloneDir, '.next/static');

if (fs.existsSync(staticSource) && !fs.existsSync(staticDest)) {
  try {
    const staticDestDir = path.join(standaloneDir, '.next');
    if (!fs.existsSync(staticDestDir)) {
      fs.mkdirSync(staticDestDir, { recursive: true });
    }
    copyRecursiveSync(staticSource, staticDest);
    console.log('✅ Static files copied');
  } catch (error) {
    console.warn('⚠️  Could not copy static files:', error.message);
  }
}

// Copy public directory if it exists
const publicSource = path.join(originalDir, 'public');
const publicDest = path.join(standaloneDir, 'public');

if (fs.existsSync(publicSource) && !fs.existsSync(publicDest)) {
  try {
    copyRecursiveSync(publicSource, publicDest);
    console.log('✅ Public directory copied');
  } catch (error) {
    console.warn('⚠️  Could not copy public directory:', error.message);
  }
}

console.log(`🚀 Starting Next.js server on port ${port}`);

// Change to standalone directory (Next.js expects to run from there)
process.chdir(standaloneDir);

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
