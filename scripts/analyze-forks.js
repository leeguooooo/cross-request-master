#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    repo: null,
    limit: 20,
    out: null,
    format: 'md',
    includeUpToDate: false,
    mode: 'auto'
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;

    if (token === '--include-up-to-date') {
      args.includeUpToDate = true;
      continue;
    }

    if (token.startsWith('--repo=')) {
      args.repo = token.slice('--repo='.length);
      continue;
    }
    if (token === '--repo') {
      args.repo = argv[++i];
      continue;
    }

    if (token.startsWith('--limit=')) {
      args.limit = Number(token.slice('--limit='.length));
      continue;
    }
    if (token === '--limit') {
      args.limit = Number(argv[++i]);
      continue;
    }

    if (token.startsWith('--out=')) {
      args.out = token.slice('--out='.length);
      continue;
    }
    if (token === '--out') {
      args.out = argv[++i];
      continue;
    }

    if (token.startsWith('--format=')) {
      args.format = token.slice('--format='.length);
      continue;
    }
    if (token === '--format') {
      args.format = argv[++i];
      continue;
    }

    if (token.startsWith('--mode=')) {
      args.mode = token.slice('--mode='.length);
      continue;
    }
    if (token === '--mode') {
      args.mode = argv[++i];
      continue;
    }

    if (token === '--help' || token === '-h') {
      return { ...args, help: true };
    }
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 20;
  if (args.format !== 'md' && args.format !== 'json') args.format = 'md';
  if (args.mode !== 'auto' && args.mode !== 'api' && args.mode !== 'html') args.mode = 'auto';

  return args;
}

function getToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || null;
}

async function fetchJson(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cross-request-fork-analyzer'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_e) {
    data = text;
  }

  if (!res.ok) {
    const message = data && data.message ? data.message : String(data);
    const err = new Error(`GitHub API ${res.status} ${res.statusText}: ${message}`);
    err.status = res.status;
    err.url = url;
    err.data = data;
    err.headers = Object.fromEntries(res.headers.entries());
    throw err;
  }

  return {
    data,
    headers: Object.fromEntries(res.headers.entries())
  };
}

async function getRepoInfo(fullName, token) {
  const { data } = await fetchJson(`https://api.github.com/repos/${fullName}`, token);
  return data;
}

async function listForksApi(fullName, token, limit) {
  const forks = [];
  const perPage = 100;
  let page = 1;

  while (forks.length < limit) {
    const url = `https://api.github.com/repos/${fullName}/forks?per_page=${perPage}&page=${page}`;
    const { data } = await fetchJson(url, token);
    if (!Array.isArray(data) || data.length === 0) break;
    forks.push(...data);
    page++;
    if (data.length < perPage) break;
  }

  return forks
    .sort((a, b) => (b.pushed_at || '').localeCompare(a.pushed_at || ''))
    .slice(0, limit);
}

function parseRepoFullName(fullName) {
  const [owner, repo] = String(fullName || '').split('/');
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function listForksHtml(fullName, limit) {
  const parsed = parseRepoFullName(fullName);
  if (!parsed) throw new Error(`Invalid repo: ${fullName}`);

  const url = `https://github.com/${parsed.owner}/${parsed.repo}/network/members`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cross-request-fork-analyzer', Accept: 'text/html' }
  });
  const html = await res.text();
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);

  const re = new RegExp(`href="/([^/]+)/${parsed.repo}"`, 'g');
  const owners = new Set();
  let match;
  while ((match = re.exec(html))) {
    const owner = match[1];
    if (owner) owners.add(owner);
  }

  owners.delete(parsed.owner);

  const forks = Array.from(owners)
    .map((owner) => ({
      owner: { login: owner },
      name: parsed.repo,
      full_name: `${owner}/${parsed.repo}`,
      html_url: `https://github.com/${owner}/${parsed.repo}`,
      default_branch: null,
      pushed_at: null
    }))
    .slice(0, limit);

  return forks;
}

function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency) return;
    const item = queue.shift();
    if (!item) return;
    active++;
    Promise.resolve()
      .then(item.fn)
      .then(
        (value) => item.resolve(value),
        (err) => item.reject(err)
      )
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

function normalizeIsoTime(value) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function classifyPaths(files) {
  const areas = new Set();
  const touched = new Set();

  (files || []).forEach((file) => {
    const name = file && file.filename ? file.filename : '';
    if (!name) return;
    touched.add(name);

    if (name === 'manifest.json') areas.add('manifest');
    else if (name === 'background.js') areas.add('background');
    else if (name === 'content-script.js') areas.add('content-script');
    else if (name === 'index.js') areas.add('inpage-api');
    else if (name === 'popup.js' || name === 'popup.html') areas.add('popup');
    else if (name.startsWith('src/helpers/')) areas.add('helpers');
    else if (name.startsWith('tests/')) areas.add('tests');
    else if (name.startsWith('docs/') || name.endsWith('.md')) areas.add('docs');
    else if (name.startsWith('scripts/')) areas.add('scripts');
    else if (name.startsWith('icons/') || name.startsWith('images/') || name.startsWith('screenshots/'))
      areas.add('assets');
    else if (name.startsWith('types/')) areas.add('types');
    else areas.add('other');
  });

  return {
    areas: Array.from(areas).sort(),
    paths: Array.from(touched).sort()
  };
}

function pickCommitSubjects(commits) {
  const subjects = [];
  for (const commit of commits || []) {
    const message = commit && commit.commit && commit.commit.message ? commit.commit.message : '';
    const subject = message.split('\n')[0].trim();
    if (!subject) continue;
    subjects.push(subject);
  }
  return subjects;
}

function findNotableSignals(files) {
  const signals = [];
  const manifest = (files || []).find((f) => f && f.filename === 'manifest.json');
  if (manifest && typeof manifest.patch === 'string') {
    if (manifest.patch.includes('"permissions"') || manifest.patch.includes('"host_permissions"')) {
      signals.push('可能改动了 permissions/host_permissions');
    }
    if (manifest.patch.includes('"externally_connectable"')) {
      signals.push('可能改动了 externally_connectable');
    }
  }
  if ((files || []).some((f) => f && f.filename === 'background.js')) signals.push('改动了 service worker');
  if ((files || []).some((f) => f && f.filename === 'content-script.js')) signals.push('改动了 content script');
  if ((files || []).some((f) => f && (f.filename === 'popup.js' || f.filename === 'popup.html')))
    signals.push('改动了 popup UI');
  if ((files || []).some((f) => f && typeof f.filename === 'string' && f.filename.startsWith('src/helpers/')))
    signals.push('改动了 helpers');
  return signals;
}

async function compareFork({ upstreamFullName, baseBranch, fork, token }) {
  const head = `${fork.owner.login}:${fork.default_branch}`;
  const url = `https://api.github.com/repos/${upstreamFullName}/compare/${encodeURIComponent(
    baseBranch
  )}...${encodeURIComponent(head)}`;
  const { data } = await fetchJson(url, token);

  const files = Array.isArray(data.files) ? data.files : [];
  const commits = Array.isArray(data.commits) ? data.commits : [];
  const { areas, paths } = classifyPaths(files);

  return {
    fork: fork.full_name,
    html_url: fork.html_url,
    default_branch: fork.default_branch,
    pushed_at: normalizeIsoTime(fork.pushed_at),
    ahead_by: data.ahead_by || 0,
    behind_by: data.behind_by || 0,
    total_commits: data.total_commits || commits.length || 0,
    status: data.status,
    areas,
    files_changed: files.length,
    paths,
    commit_subjects: pickCommitSubjects(commits),
    signals: findNotableSignals(files),
    compare_url: `https://github.com/${upstreamFullName}/compare/${baseBranch}...${head}`
  };
}

function getDefaultBranchFromGitRemote(fullName) {
  const repoUrl = `https://github.com/${fullName}.git`;
  const output = execFileSync('git', ['ls-remote', '--symref', repoUrl, 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  // Example:
  // ref: refs/heads/master	HEAD
  // <sha>	HEAD
  const line = output
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('ref: refs/heads/'));

  if (!line) return null;
  const match = line.match(/^ref:\s+refs\/heads\/([^\s]+)\s+HEAD$/);
  return match ? match[1] : null;
}

function parseComparePatch(patchText) {
  const decodeMimeWords = (value) => {
    if (!value || typeof value !== 'string') return value;
    return value.replace(/=\?utf-8\?q\?(.+?)\?=/gi, (_m, encoded) => {
      try {
        const normalized = String(encoded)
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, '%$1');
        return decodeURIComponent(normalized);
      } catch (_e) {
        return encoded;
      }
    });
  };

  const subjects = [];
  const files = new Set();
  let commitCount = 0;

  const lines = String(patchText || '').split('\n');
  for (const line of lines) {
    if (/^From [0-9a-f]{40} /.test(line)) commitCount++;
    const subjectMatch = line.match(/^Subject:\s+\[PATCH[^\]]*\]\s*(.*)$/);
    if (subjectMatch && subjectMatch[1]) subjects.push(decodeMimeWords(subjectMatch[1].trim()));

    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch && diffMatch[1]) files.add(diffMatch[1]);
  }

  return {
    commitCount,
    subjects,
    files: Array.from(files)
  };
}

async function fetchComparePatch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cross-request-fork-analyzer', Accept: 'text/plain' }
  });
  const text = await res.text();
  return { res, text };
}

async function compareForkViaPatch({ upstreamFullName, baseBranch, fork }) {
  const branchCandidates = [];
  const addCandidate = (b) => {
    if (!b) return;
    if (!branchCandidates.includes(b)) branchCandidates.push(b);
  };

  addCandidate(fork.default_branch);
  addCandidate(baseBranch);
  addCandidate('master');
  addCandidate('main');

  let chosenBranch = null;
  let lastError = null;
  let lastResponseText = '';

  for (const candidate of branchCandidates) {
    const head = `${fork.owner.login}:${candidate}`;
    const url = `https://github.com/${upstreamFullName}/compare/${baseBranch}...${head}.patch`;
    const { res, text } = await fetchComparePatch(url);
    lastResponseText = text;

    if (res.ok) {
      chosenBranch = candidate;
      fork.default_branch = candidate;

      if (!text.trim()) {
        return {
          fork: fork.full_name,
          html_url: fork.html_url,
          default_branch: fork.default_branch,
          pushed_at: normalizeIsoTime(fork.pushed_at),
          ahead_by: 0,
          behind_by: 0,
          total_commits: 0,
          status: 'identical',
          areas: [],
          files_changed: 0,
          paths: [],
          commit_subjects: [],
          signals: [],
          compare_url: `https://github.com/${upstreamFullName}/compare/${baseBranch}...${head}`
        };
      }

      const parsed = parseComparePatch(text);
      const { areas, paths } = classifyPaths(parsed.files.map((filename) => ({ filename })));

      return {
        fork: fork.full_name,
        html_url: fork.html_url,
        default_branch: fork.default_branch,
        pushed_at: normalizeIsoTime(fork.pushed_at),
        ahead_by: parsed.commitCount,
        behind_by: 0,
        total_commits: parsed.commitCount,
        status: 'ahead',
        areas,
        files_changed: parsed.files.length,
        paths,
        commit_subjects: parsed.subjects,
        signals: [],
        compare_url: `https://github.com/${upstreamFullName}/compare/${baseBranch}...${head}`
      };
    }

    if (res.status !== 404) {
      const err = new Error(`Compare patch ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.url = url;
      err.bodyPreview = text.slice(0, 200);
      throw err;
    }

    lastError = new Error(`Compare patch 404 for ${head}`);
  }

  // As a last resort, detect the fork's default branch via git remote HEAD and retry.
  const detected = getDefaultBranchFromGitRemote(fork.full_name);
  if (detected && detected !== chosenBranch) {
    fork.default_branch = detected;
    return compareForkViaPatch({ upstreamFullName, baseBranch, fork });
  }

  const err = lastError || new Error('Compare patch failed');
  err.status = 404;
  err.bodyPreview = String(lastResponseText || '').slice(0, 200);
  throw err;
}

function buildMarkdown({ upstream, baseBranch, forks, analyses, tokenPresent }) {
  const lines = [];

  lines.push(`# Fork 改动概览：${upstream}`);
  lines.push('');
  lines.push(`- base 分支：\`${baseBranch}\``);
  lines.push(`- forks（repo 统计）：\`${forks.length}\`（本次分析取最近 pushed 的前 N 个）`);
  lines.push(`- GitHub Token：\`${tokenPresent ? '已设置' : '未设置（可能触发 rate limit）'}\``);
  lines.push('');

  const ahead = analyses
    .filter((a) => a.ahead_by > 0)
    .sort((a, b) => b.ahead_by - a.ahead_by || (b.pushed_at || '').localeCompare(a.pushed_at || ''));

  if (ahead.length === 0) {
    lines.push('未发现 forks 有领先提交（ahead_by=0）。');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## 快速表（仅列出 ahead_by>0）');
  lines.push('');
  lines.push('| fork | ahead | pushed_at | areas | signals | compare |');
  lines.push('| --- | ---: | --- | --- | --- | --- |');

  ahead.forEach((a) => {
    const areas = a.areas.length ? a.areas.join(', ') : '-';
    const signals = a.signals.length ? a.signals.join('；') : '-';
    const pushedAt = a.pushed_at ? a.pushed_at.slice(0, 10) : '-';
    lines.push(
      `| \`${a.fork}\` | ${a.ahead_by} | ${pushedAt} | ${areas} | ${signals} | [diff](${a.compare_url}) |`
    );
  });

  lines.push('');
  lines.push('## 细节（按 ahead 从高到低，最多 10 个）');
  lines.push('');

  ahead.slice(0, 10).forEach((a) => {
    lines.push(`### ${a.fork}`);
    lines.push('');
    lines.push(`- ahead/behind：\`${a.ahead_by}\` / \`${a.behind_by}\`；files：\`${a.files_changed}\``);
    lines.push(`- areas：\`${a.areas.join(', ') || '-'}\``);
    lines.push(`- compare：${a.compare_url}`);
    if (a.commit_subjects.length) {
      lines.push(`- commits：`);
      a.commit_subjects.slice(0, 8).forEach((s) => lines.push(`  - ${s}`));
      if (a.commit_subjects.length > 8) lines.push(`  - ...（共 ${a.commit_subjects.length} 条）`);
    }
    if (a.paths.length) {
      lines.push(`- touched（top 12）：\`${a.paths.slice(0, 12).join('`, `')}\``);
      if (a.paths.length > 12) lines.push(`- touched：...（共 ${a.paths.length} 个文件）`);
    }
    if (a.signals.length) lines.push(`- signals：\`${a.signals.join('；')}\``);
    lines.push('');
  });

  return lines.join('\n');
}

function chooseMergeCandidates(analyses) {
  const ignoredPrefixes = ['build/', 'node_modules/'];
  const ignoredSuffixes = ['.zip', '.DS_Store'];

  return analyses
    .filter((a) => a.ahead_by > 0)
    .filter((a) => a.files_changed > 0 && a.files_changed <= 10)
    .filter((a) => a.total_commits <= 8)
    .filter((a) => !a.paths.some((p) => ignoredPrefixes.some((prefix) => p.startsWith(prefix))))
    .filter((a) => !a.paths.some((p) => ignoredSuffixes.some((suffix) => p.endsWith(suffix))))
    .filter((a) => a.areas.every((area) => ['helpers', 'tests', 'docs', 'scripts', 'types', 'manifest', 'popup', 'background', 'content-script', 'inpage-api', 'other', 'assets'].includes(area)))
    .filter((a) => !a.areas.includes('assets'))
    .sort((a, b) => a.files_changed - b.files_changed || a.total_commits - b.total_commits)
    .slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/analyze-forks.js --repo owner/name [--limit 20] [--format md|json] [--mode auto|api|html] [--out path]

Env:
  GITHUB_TOKEN / GH_TOKEN / GITHUB_PAT (optional, raises rate limits)

Example:
  node scripts/analyze-forks.js --repo leeguooooo/cross-request-master --limit 30 --out forks.md
`);
    process.exit(0);
  }

  const token = getToken();
  const tokenPresent = Boolean(token);

  if (!args.repo) {
    console.error('Missing --repo owner/name');
    process.exit(1);
  }

  const upstream = args.repo;
  let baseBranch = null;
  let forks;
  let effectiveMode = args.mode;

  if (effectiveMode === 'auto' || effectiveMode === 'api') {
    try {
      const repoInfo = await getRepoInfo(upstream, token);
      baseBranch = repoInfo.default_branch;
      forks = await listForksApi(upstream, token, args.limit);
      effectiveMode = 'api';
    } catch (error) {
      const isRateLimit = String(error && error.message ? error.message : '').includes('rate limit');
      if (args.mode === 'api' || !isRateLimit) throw error;
      effectiveMode = 'html';
    }
  }

  if (effectiveMode === 'html') {
    // Base branch: try to detect via git remote HEAD of the upstream repo.
    baseBranch = getDefaultBranchFromGitRemote(upstream) || 'master';
    forks = await listForksHtml(upstream, args.limit);
  }

  const limit = pLimit(4);
  const analyses = await Promise.all(
    forks.map((fork) =>
      limit(async () => {
        try {
          if (effectiveMode === 'api') {
            return await compareFork({ upstreamFullName: upstream, baseBranch, fork, token });
          }
          return await compareForkViaPatch({ upstreamFullName: upstream, baseBranch, fork });
        } catch (error) {
          return {
            fork: fork.full_name,
            html_url: fork.html_url,
            default_branch: fork.default_branch,
            pushed_at: normalizeIsoTime(fork.pushed_at),
            ahead_by: 0,
            behind_by: 0,
            total_commits: 0,
            status: 'error',
            areas: [],
            files_changed: 0,
            paths: [],
            commit_subjects: [],
            signals: [],
            compare_url: `https://github.com/${upstream}/compare/${baseBranch}...${fork.owner.login}:${fork.default_branch}`,
            error: error.message
          };
        }
      })
    )
  );

  const payload = {
    upstream,
    baseBranch,
    fetchedAt: new Date().toISOString(),
    tokenPresent,
    mode: effectiveMode,
    forkCount: forks.length,
    analyses,
    mergeCandidates: chooseMergeCandidates(analyses)
  };

  let output;
  if (args.format === 'json') {
    output = JSON.stringify(payload, null, 2);
  } else {
    output = buildMarkdown({
      upstream,
      baseBranch,
      forks,
      analyses: args.includeUpToDate ? analyses : analyses.filter((a) => a.ahead_by > 0),
      tokenPresent
    });

    const candidates = payload.mergeCandidates;
    if (candidates.length) {
      output += '\n';
      output += '## 建议优先人工看一下的可合并候选（heuristic）\n\n';
      candidates.forEach((c) => {
        output += `- \`${c.fork}\`: ahead \`${c.ahead_by}\`, files \`${c.files_changed}\`, areas \`${c.areas.join(
          ', '
        )}\` -> ${c.compare_url}\n`;
      });
    }
  }

  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output);
    console.log(`[analyze-forks] wrote ${path.relative(process.cwd(), outPath)}`);
    return;
  }

  process.stdout.write(output);
}

main().catch((error) => {
  console.error('\n[analyze-forks] failed:', error && error.message ? error.message : error);
  process.exit(1);
});
