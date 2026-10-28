// Fails if a portal build directory contains external links or other-portal branding.
// Usage: node tools/check-portal-build.mjs release/crazygames
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findExternalLinks } from '../src/portal.ts';

const dir = process.argv[2];
if (!dir) throw new Error('usage: check-portal-build.mjs <dir>');
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|js|css|json)$/.test(f)) files.push(p);
  }
};
walk(dir);
let bad = 0;
for (const f of files) {
  const hits = findExternalLinks(readFileSync(f, 'utf8'));
  if (hits.length) {
    bad++;
    console.error(`${f}: ${hits.join(', ')}`);
  }
}
if (!files.length) throw new Error(`no build files in ${dir}`);
if (bad) process.exit(1);
console.log(`portal build clean: ${files.length} files, no external links`);
