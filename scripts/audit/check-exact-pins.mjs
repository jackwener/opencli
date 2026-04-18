#!/usr/bin/env node
// Verify every direct dependency in root + extension package.json files uses
// an exact version pin — no caret (^), tilde (~), range (- or ||), wildcard
// (* or x), or "latest" tag. CLAUDE.md §4.1 requires exact pinning to keep
// supply-chain audits reproducible and disable silent minor/patch upgrades.
//
// Exit 0 on success, 1 on any non-exact pin.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const targets = ['package.json', 'extension/package.json'];
const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];

let bad = 0;
for (const target of targets) {
  const pkg = JSON.parse(readFileSync(resolve(target), 'utf8'));
  let count = 0;
  for (const section of sections) {
    for (const [name, range] of Object.entries(pkg[section] || {})) {
      count++;
      const r = String(range).trim();
      const offending =
        /^[\^~]/.test(r) ||
        r.includes(' - ') ||
        r.includes('||') ||
        r === '*' ||
        /(^|\D)x(\D|$)/.test(r) ||
        r === 'latest' ||
        r === '';
      if (offending) {
        console.error(`  ❌ ${target} ${section}/${name}: "${r}"`);
        bad++;
      }
    }
  }
  console.log(`  ${target}: scanned ${count} direct deps`);
}

if (bad > 0) {
  console.error(`\n❌ ${bad} non-exact pin(s) — §4.1 requires exact versions`);
  process.exit(1);
}
console.log('\n✅ All direct deps are exact-pinned (§4.1 OK)');
