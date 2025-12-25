#!/usr/bin/env node
/**
 * Next.js Standalone Server Wrapper for Railway
 * Uses standalone build output with proper PORT binding
 */

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';

// Try to use standalone server first (production build)
try {
  const server = require('./.next/standalone/server.js');
  // Standalone server should handle PORT automatically
  // But we ensure it's set
  process.env.PORT = port;
  console.log(`🚀 Starting Next.js standalone server on ${hostname}:${port}`);
} catch (error) {
  // Fallback to custom server if standalone doesn't exist
  console.log('⚠️  Standalone server not found, using custom server...');
  const { createServer } = require('http');
  const { parse } = require('url');
  const next = require('next');

  const dev = process.env.NODE_ENV !== 'production';
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    }).listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  });
}

