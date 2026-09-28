#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(repositoryRoot, 'frontend', 'src');
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html']);
const forbidden = /(?:Ã.|Â.|ðŸ|�)/;
const violations = [];

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      visit(path);
      continue;
    }
    if (!extensions.has(path.slice(path.lastIndexOf('.')))) continue;
    const content = readFileSync(path, 'utf8');
    content.split(/\r?\n/).forEach((line, index) => {
      if (forbidden.test(line)) {
        violations.push(relative(repositoryRoot, path) + ':' + (index + 1));
      }
    });
  }
}

visit(root);
if (violations.length) {
  console.error('Mojibake detected in frontend source:');
  violations.forEach((violation) => console.error('- ' + violation));
  process.exit(1);
}
console.log('Frontend source encoding check passed.');
