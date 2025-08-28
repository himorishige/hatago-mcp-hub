/**
 * tsdown configuration for Cloudflare Workers build
 */
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/entry.workers.ts'], // Use clean entry point
  outDir: 'dist/workers',
  format: 'esm',
  platform: 'browser', // Use browser platform for better tree-shaking
  target: 'es2022',
  clean: true,
  dts: false, // No type definitions needed for Workers bundle
  
  // Aggressive tree-shaking for minimal bundle
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
  },
  
  // External dependencies that should not be bundled
  external: [
    // All Node.js built-ins
    /^node:.*/,
    // Node.js modules without prefix
    'child_process',
    'fs',
    'fs/promises',
    'path',
    'crypto',
    'stream',
    'buffer',
    'events',
    'util',
    'os',
    'net',
    'tls',
    'http',
    'https',
    // MCP SDK stdio transport (Node.js only)
    '@modelcontextprotocol/sdk/client/stdio',
    '@modelcontextprotocol/sdk/client/stdio.js',
  ],
  
  // Environment variables to replace at build time
  env: {
    NODE_ENV: 'production',
    RUNTIME: 'workers',
  },
  
  // Custom esbuild options
  esbuildOptions: {
    // Ensure we're building for Workers environment
    conditions: ['workerd', 'worker', 'browser'],
    
    // Define globals for Workers
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.RUNTIME': '"workers"',
      // Explicitly mark Node.js globals as undefined
      'process': 'undefined',
      'Buffer': 'undefined',
      'global': 'self',
      '__dirname': 'undefined',
      '__filename': 'undefined',
    },
    
    // Aggressive minification for production
    minify: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    
    // Don't keep names in production for smaller bundle
    keepNames: false,
    
    // Bundle everything except Workers runtime APIs
    bundle: true,
    
    // Drop console logs in production
    drop: ['console', 'debugger'],
    
    // No source maps for production
    sourcemap: false,
    
    // Ensure proper module resolution
    mainFields: ['workerd', 'worker', 'browser', 'module', 'main'],
  },
  
  // Skip node polyfills and reduce bundle size
  // @ts-ignore - Options might not be in types yet
  skipNodeModulesBundle: true,
  replaceNodeEnv: false,
  shims: false,
  
  // Production optimizations
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});