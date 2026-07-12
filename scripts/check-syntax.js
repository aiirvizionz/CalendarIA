'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INCLUDED_DIRS = ['public/js', 'src', 'scripts', 'test'];
const ROOT_FILES = ['server.js'];

function collectJavaScript(directory) {
  const absolute = path.join(ROOT, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(relative);
    return entry.isFile() && entry.name.endsWith('.js') ? [relative] : [];
  });
}

const files = [
  ...ROOT_FILES.filter((file) => fs.existsSync(path.join(ROOT, file))),
  ...INCLUDED_DIRS.flatMap(collectJavaScript),
].sort();

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\n[syntax] ${file}\n${result.stderr || result.stdout}\n`);
  }
}

if (failed) process.exit(1);
console.log(`Sintaxis válida en ${files.length} archivos JavaScript.`);
