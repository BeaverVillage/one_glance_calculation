#!/usr/bin/env node
/*
 * This project now uses the Windows PowerShell cache builder for the Korea
 * Environment Corporation EV charger OpenAPI because the user's verified
 * environment succeeds with Invoke-RestMethod but fails with Node HTTPS/fetch.
 *
 * Windows PowerShell:
 *   $env:DATA_GO_KR_SERVICE_KEY="..."
 *   .\scripts\build-ev-charger-cache-windows.cmd -Region 11 -Test
 *   .\scripts\build-ev-charger-cache-windows.cmd -Region 11
 *   .\scripts\build-ev-charger-cache-windows.cmd
 */
const { spawnSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'build-ev-charger-cache.ps1');
const args = process.argv.slice(2).flatMap((arg) => {
  if (arg.startsWith('--region=')) return ['-Region', arg.split('=')[1]];
  if (arg === '--test') return ['-Test'];
  if (arg.startsWith('--rows=')) return ['-Rows', arg.split('=')[1]];
  if (arg.startsWith('--delay=')) return ['-DelayMs', arg.split('=')[1]];
  if (arg.startsWith('--retries=')) return ['-Retries', arg.split('=')[1]];
  if (arg.startsWith('--timeout=')) return ['-TimeoutSec', arg.split('=')[1]];
  if (arg === '--resume=1' || arg === '--resume') return ['-Resume'];
  return [];
});

console.log('EV cache builder uses PowerShell direct mode on Windows.');
const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
