#!/usr/bin/env node
'use strict';

/**
 * Simple dev watcher for the extension.
 *
 * Watches source files and reruns build-extension.sh to refresh build/ output.
 * Run via: pnpm dev
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const watchTargets = [
  'manifest.json',
  'background.js',
  'content-script.js',
  'index.js',
  'popup.html',
  'popup.js',
  'src',
  'icons',
  'images'
];

let debounceTimer = null;
let building = false;
let pending = false;

function runBuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  pending = false;

  const proc = spawn('bash', ['build-extension.sh'], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  proc.on('close', (code) => {
    building = false;
    if (pending) {
      runBuild();
      return;
    }
    if (code === 0) {
      console.log('[dev] build complete. Reload build/ in chrome://extensions');
    } else {
      console.error('[dev] build failed with code', code);
    }
  });
}

function scheduleBuild() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runBuild, 200);
}

function watchPath(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) return;

  const stat = fs.statSync(absolutePath);
  const options = stat.isDirectory() ? { recursive: true } : undefined;

  fs.watch(absolutePath, options, (_eventType, filename) => {
    const name = filename ? filename.toString() : '';
    if (!name || name.includes('build') || name.includes('node_modules')) return;
    console.log('[dev] change detected:', relativePath + '/' + name);
    scheduleBuild();
  });
}

watchTargets.forEach(watchPath);

console.log('[dev] watching for changes...');
runBuild();

