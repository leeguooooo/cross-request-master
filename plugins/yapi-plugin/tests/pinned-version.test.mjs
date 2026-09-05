import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// The bootstrap install is pinned in ~25 hand-maintained places (command docs,
// SKILL.md files, ensure-yapi.mjs). Nothing makes them move together, so the
// day @leeguoo/yapi-mcp ships 0.7.0 they all silently keep installing 0.6.1
// while the rest of the repo has moved on. Fail here instead of shipping that.
test('every pinned @leeguoo/yapi-mcp version matches the package version', () => {
  const expected = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages', 'yapi-mcp', 'package.json'), 'utf8'),
  ).version;

  // Only tracked files, so node_modules and lockfiles stay out of it.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    // Changelogs and release notes legitimately name older versions.
    .filter((f) => !/(^|\/)(CHANGELOG\.md|RELEASING\.md)$/.test(f))
    .filter((f) => !f.startsWith('docs/superpowers/'))
    .filter((f) => !f.startsWith('thoughts/') && !f.startsWith('.omx/'));

  const pinned = /@leeguoo\/yapi-mcp@(\d+\.\d+\.\d+)/g;
  const stale = [];
  for (const file of tracked) {
    let text;
    try {
      text = readFileSync(path.join(repoRoot, file), 'utf8');
    } catch {
      continue; // binary or unreadable — nothing to pin in it
    }
    for (const [, found] of text.matchAll(pinned)) {
      if (found !== expected) stale.push(`${file}: pinned ${found}, expected ${expected}`);
    }
  }

  assert.deepEqual(
    stale,
    [],
    `Stale @leeguoo/yapi-mcp pins (bump them to ${expected}):\n${stale.join('\n')}`,
  );
});
