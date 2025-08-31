#!/usr/bin/env node
/**
 * Prepare package.json for publishing
 * Removes workspace dependencies from dependencies field
 * since they are bundled by tsdown
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packagePath = resolve(process.cwd(), 'package.json');
const backupPath = resolve(process.cwd(), 'package.json.backup');

// Read current package.json
const packageData = JSON.parse(readFileSync(packagePath, 'utf-8'));

// Backup original package.json
writeFileSync(backupPath, JSON.stringify(packageData, null, 2), 'utf-8');

// Create publish version
const publishData = { ...packageData };

// Remove workspace dependencies from dependencies
// Keep only external dependencies that are not bundled
if (publishData.dependencies) {
  const filteredDeps = {};
  for (const [name, version] of Object.entries(publishData.dependencies)) {
    // Keep only non-workspace dependencies
    if (!name.startsWith('@himorishige/')) {
      filteredDeps[name] = version;
    }
  }
  publishData.dependencies = filteredDeps;
}

// Write modified package.json for publishing
writeFileSync(packagePath, JSON.stringify(publishData, null, 2), 'utf-8');

console.log('✅ Prepared package.json for publishing');
console.log('   - Removed workspace dependencies');
console.log('   - Backup saved to package.json.backup');
