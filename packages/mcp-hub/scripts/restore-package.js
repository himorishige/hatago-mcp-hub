#!/usr/bin/env node
/**
 * Restore original package.json after publishing
 * This ensures the workspace development continues to work
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const packagePath = resolve(process.cwd(), 'package.json');
const backupPath = resolve(process.cwd(), 'package.json.backup');

if (!existsSync(backupPath)) {
  console.log('⚠️  No backup found, skipping restore');
  process.exit(0);
}

// Restore original package.json
const backupData = readFileSync(backupPath, 'utf-8');
writeFileSync(packagePath, backupData, 'utf-8');

// Remove backup file
unlinkSync(backupPath);

console.log('✅ Restored original package.json');
console.log('   - Backup file removed');
