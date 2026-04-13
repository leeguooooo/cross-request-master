import test from 'node:test';
import assert from 'node:assert/strict';

import { runYapi, setupYapi } from '../scripts/run-yapi.mjs';

test('runYapi returns stdout when command succeeds', async () => {
  const ensureYapi = async () => ({ ok: true, code: 'OK', autoInstalled: false });
  const exec = async (command, args = []) => {
    assert.equal(command, 'yapi');
    assert.deepEqual(args, ['whoami']);

    return {
      code: 0,
      stdout: '{"email":"demo@example.com"}',
      stderr: '',
    };
  };

  const result = await runYapi({ args: ['whoami'], ensureYapi, exec });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'OK');
  assert.equal(result.stdout, '{"email":"demo@example.com"}');
});

test('runYapi maps login failures to NOT_LOGGED_IN', async () => {
  const ensureYapi = async () => ({ ok: true, code: 'OK', autoInstalled: false });
  const exec = async () => {
    const error = new Error('Please login first');
    error.code = 1;
    error.stdout = '';
    error.stderr = 'Please login first';
    throw error;
  };

  const result = await runYapi({ args: ['whoami'], ensureYapi, exec });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_LOGGED_IN');
});

test('runYapi returns command failure for other errors', async () => {
  const ensureYapi = async () => ({ ok: true, code: 'OK', autoInstalled: false });
  const exec = async () => {
    const error = new Error('unknown failure');
    error.code = 2;
    error.stdout = '';
    error.stderr = 'unknown failure';
    throw error;
  };

  const result = await runYapi({ args: ['search', '--q', 'pet'], ensureYapi, exec });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'COMMAND_FAILED');
  assert.equal(result.exitCode, 2);
});

test('setupYapi returns next step when login is required', async () => {
  const ensureYapi = async () => ({ ok: true, code: 'OK', autoInstalled: true });
  const exec = async () => {
    const error = new Error('not logged in');
    error.code = 1;
    error.stdout = '';
    error.stderr = 'not logged in';
    throw error;
  };

  const result = await setupYapi({ ensureYapi, exec });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_LOGGED_IN');
  assert.match(result.nextStep, /yapi login/);
});
