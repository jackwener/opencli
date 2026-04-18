#!/usr/bin/env node
// Enumerate every runtime file reachable from extension/manifest.json
// (manifest entries + transitively from src/href in allowlisted HTML
// pages). Used by verify-dist-fresh.sh — kept as a separate file so
// the script logic is testable in isolation.
//
// Output: one path per line on stdout, relative to extension/.
// External URLs (http://, https://, data:, chrome-extension:, etc.) and
// fragment-only links are dropped — only same-origin packaged files
// matter for the runtime audit surface.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const EXTENSION_DIR = 'extension';
const manifest = JSON.parse(readFileSync(join(EXTENSION_DIR, 'manifest.json'), 'utf8'));

const out = new Set();
const queue = [];

function push(value) {
  if (typeof value !== 'string' || !value) return;
  if (out.has(value)) return;
  out.add(value);
  if (value.endsWith('.html') || value.endsWith('.htm')) queue.push(value);
}

if (manifest.background) push(manifest.background.service_worker);
if (manifest.action) push(manifest.action.default_popup);
if (manifest.options_page) push(manifest.options_page);
if (manifest.options_ui) push(manifest.options_ui.page);
if (manifest.devtools_page) push(manifest.devtools_page);
if (manifest.chrome_url_overrides) {
  for (const value of Object.values(manifest.chrome_url_overrides)) push(value);
}
if (manifest.sandbox && Array.isArray(manifest.sandbox.pages)) {
  for (const page of manifest.sandbox.pages) push(page);
}
if (Array.isArray(manifest.content_scripts)) {
  for (const cs of manifest.content_scripts) {
    for (const file of (cs.js || [])) push(file);
    for (const file of (cs.css || [])) push(file);
  }
}
if (Array.isArray(manifest.web_accessible_resources)) {
  for (const war of manifest.web_accessible_resources) {
    for (const file of (war.resources || [])) push(file);
  }
}

// Walk allowlisted HTML pages for src/href references. Iterates the
// queue (HTML files queued by push()) and registers any local resource
// they pull in — popup.html -> popup.js is the canonical case.
const REF_PATTERN = /\b(?:src|href)\s*=\s*["']([^"'#]+)["']/g;
const SKIP_PROTOCOL = /^(?:https?:|data:|mailto:|chrome-extension:|chrome:)/i;

while (queue.length > 0) {
  const htmlRel = queue.shift();
  const htmlAbs = join(EXTENSION_DIR, htmlRel);
  if (!existsSync(htmlAbs)) continue;
  const text = readFileSync(htmlAbs, 'utf8');
  for (const match of text.matchAll(REF_PATTERN)) {
    const ref = match[1];
    if (SKIP_PROTOCOL.test(ref)) continue;
    if (ref.startsWith('//') || ref.startsWith('/')) continue;
    const resolved = normalize(join(dirname(htmlRel), ref));
    push(resolved);
  }
}

process.stdout.write([...out].join('\n'));
