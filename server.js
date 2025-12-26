#!/usr/bin/env node
/**
 * Next.js Standalone Server for Railway
 * Ensures PORT is properly set and static files are served correctly
 */

const path = require('path');
const fs = require('fs');

// Set PORT before requiring standalone server
const port = parseInt(process.env.PORT || '3000', 10);
process.env.PORT = port.toString();
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// Paths
const standaloneServerPath = path.join(__dirname, '.next/standalone/server.js');
const staticPath = path.join(__dirname, '.next/static');
const standaloneStaticPath = path.join(__dirname, '.next/standalone/.next/static');

// Helper function to copy directory recursively
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  if (!exists) return;
  
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
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

// Ensure static files are copied to standalone directory if they exist
if (fs.existsSync(staticPath) && !fs.existsSync(standaloneStaticPath)) {
  console.log('📦 Copying static files to standalone directory...');
  try {
    copyRecursiveSync(staticPath, standaloneStaticPath);
    console.log('✅ Static files copied successfully');
  } catch (error) {
    console.warn('⚠️  Failed to copy static files:', error.message);
  }
}

// Copy public directory if it exists
const publicPath = path.join(__dirname, 'public');
const standalonePublicPath = path.join(__dirname, '.next/standalone/public');
if (fs.existsSync(publicPath) && !fs.existsSync(standalonePublicPath)) {
  console.log('📦 Copying public directory to standalone...');
  try {
    copyRecursiveSync(publicPath, standalonePublicPath);
    console.log('✅ Public directory copied successfully');
  } catch (error) {
    console.warn('⚠️  Failed to copy public directory:', error.message);
  }
}

// Load and start the standalone server
try {
  if (!fs.existsSync(standaloneServerPath)) {
    throw new Error(`Standalone server not found at ${standaloneServerPath}\nMake sure you have run: npm run build`);
  }
  
  console.log(`🚀 Starting Next.js standalone server`);
  console.log(`📡 Listening on ${process.env.HOSTNAME}:${port}`);
  console.log(`📁 Working directory: ${__dirname}`);
  
  // Change to standalone directory to ensure correct paths
  const standaloneDir = path.join(__dirname, '.next/standalone');
  const originalCwd = process.cwd();
  
  // Change directory before requiring
  process.chdir(standaloneDir);
  
  // Next.js standalone server expects PORT to be set and runs from standalone directory
  // The server.js in standalone directory will handle static files automatically
  // We need to require with the full path or relative to new cwd
  const serverPath = path.join(standaloneDir, 'server.js');
  require(serverPath);
  
  console.log(`✅ Server loaded successfully`);
  
} catch (error) {
  console.error('❌ Failed to load standalone server:', error.message);
  if (error.stack) {
    console.error('Stack:', error.stack);
  }
  console.error('\n💡 Make sure you have run: npm run build');
  process.exit(1);
}
