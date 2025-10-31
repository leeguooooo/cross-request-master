#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function fail(message, details) {
  console.error(`\n[check-release] ${message}`);
  if (details && details.length) {
    details.forEach((item) => console.error(`  - ${item}`));
  }
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const rootDir = process.cwd();
const buildDir = path.join(rootDir, 'build');

const packageJson = readJson(path.join(rootDir, 'package.json'));
const manifestJson = readJson(path.join(rootDir, 'manifest.json'));

if (packageJson.version !== manifestJson.version) {
  fail('package.json 与 manifest.json 的版本号不一致，请先同步版本。');
}

if (!fs.existsSync(buildDir)) {
  fail('未找到 build 目录，请先执行 ./build-extension.sh。');
}

const topLevelFiles = [
  'manifest.json',
  'background.js',
  'content-script.js',
  'index.js',
  'popup.html',
  'popup.js',
  'jquery-3.1.1.js'
];

const helperDir = path.join(rootDir, 'src/helpers');
let helperFiles = [];
if (fs.existsSync(helperDir)) {
  helperFiles = fs
    .readdirSync(helperDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.join('src', 'helpers', file));
}

const filesToCompare = [...topLevelFiles, ...helperFiles];
const mismatches = [];

filesToCompare.forEach((relativePath) => {
  const sourcePath = path.join(rootDir, relativePath);
  const buildPath = path.join(buildDir, relativePath);

  if (!fs.existsSync(buildPath)) {
    mismatches.push(`${relativePath} 未复制到 build 目录`);
    return;
  }

  const sourceBuffer = fs.readFileSync(sourcePath);
  const buildBuffer = fs.readFileSync(buildPath);

  if (Buffer.compare(sourceBuffer, buildBuffer) !== 0) {
    mismatches.push(`${relativePath} 与 build/${relativePath} 内容不一致`);
  }
});

if (mismatches.length) {
  fail('检测到构建产物不是最新，请重新执行 ./build-extension.sh 后提交。', mismatches);
}

const expectedZip = `cross-request-master-v${packageJson.version}.zip`;
const zipPath = path.join(rootDir, expectedZip);

if (!fs.existsSync(zipPath)) {
  fail(`未找到 ${expectedZip}，请运行 ./build-extension.sh 生成最新压缩包。`);
}

try {
  const manifestFromZip = execSync(`unzip -p "${zipPath}" manifest.json`, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const zipManifest = JSON.parse(manifestFromZip);
  if (zipManifest.version !== packageJson.version) {
    fail('zip 包中的 manifest.json 版本与当前版本不一致，请重新构建。');
  }
} catch (error) {
  fail('无法读取压缩包中的 manifest.json，请确认已经使用 ./build-extension.sh 完成构建。');
}

console.log('[check-release] 构建产物检查通过');
