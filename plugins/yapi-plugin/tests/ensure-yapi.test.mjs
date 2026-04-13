import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureYapi } from '../scripts/ensure-yapi.mjs';

function createExecStub(handlers) {
  return async (command, args = []) => {
    const key = `${command} ${args.join(' ')}`.trim();
    const handler = handlers[key];

    if (!handler) {
      throw new Error(`Unexpected command: ${key}`);
    }

    if (handler.ok) {
      return {
        command,
        args,
        code: 0,
        stdout: handler.stdout ?? '',
        stderr: handler.stderr ?? '',
      };
    }

    const error = new Error(handler.stderr ?? 'command failed');
    error.code = handler.code ?? 1;
    error.stdout = handler.stdout ?? '';
    error.stderr = handler.stderr ?? '';
    throw error;
  };
}

test('returns npm missing when npm is not available', async () => {
  const exec = createExecStub({
    'which node': { ok: true, stdout: '/usr/bin/node\n' },
    'which npm': { ok: false, stderr: 'npm missing' },
  });

  const result = await ensureYapi({ exec });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NPM_MISSING');
});

test('returns ok when yapi is already installed', async () => {
  const exec = createExecStub({
    'which node': { ok: true, stdout: '/usr/bin/node\n' },
    'which npm': { ok: true, stdout: '/usr/bin/npm\n' },
    'which yapi': { ok: true, stdout: '/usr/local/bin/yapi\n' },
  });

  const result = await ensureYapi({ exec });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'OK');
  assert.equal(result.autoInstalled, false);
});

test('installs yapi automatically when missing', async () => {
  const calls = [];
  const exec = async (command, args = []) => {
    calls.push(`${command} ${args.join(' ')}`.trim());
    const key = calls[calls.length - 1];

    if (key === 'which node') {
      return { code: 0, stdout: '/usr/bin/node\n', stderr: '' };
    }
    if (key === 'which npm') {
      return { code: 0, stdout: '/usr/bin/npm\n', stderr: '' };
    }
    if (key === 'which yapi' && calls.filter((call) => call === 'which yapi').length === 1) {
      const error = new Error('missing');
      error.code = 1;
      error.stdout = '';
      error.stderr = 'missing';
      throw error;
    }
    if (key === 'npm install -g @leeguoo/yapi-mcp') {
      return { code: 0, stdout: 'installed', stderr: '' };
    }
    if (key === 'which yapi' && calls.filter((call) => call === 'which yapi').length === 2) {
      return { code: 0, stdout: '/usr/local/bin/yapi\n', stderr: '' };
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  const result = await ensureYapi({ exec });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'OK');
  assert.equal(result.autoInstalled, true);
  assert.deepEqual(calls, [
    'which node',
    'which npm',
    'which yapi',
    'npm install -g @leeguoo/yapi-mcp',
    'which yapi',
  ]);
});

test('returns install failure when npm installation fails', async () => {
  const exec = createExecStub({
    'which node': { ok: true, stdout: '/usr/bin/node\n' },
    'which npm': { ok: true, stdout: '/usr/bin/npm\n' },
    'which yapi': { ok: false, stderr: 'missing' },
    'npm install -g @leeguoo/yapi-mcp': { ok: false, stderr: 'EACCES' },
  });

  const result = await ensureYapi({ exec });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'CLI_INSTALL_FAILED');
  assert.match(result.message, /@leeguoo\/yapi-mcp/);
});
