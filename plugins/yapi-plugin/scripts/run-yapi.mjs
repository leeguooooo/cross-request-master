import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { ensureYapi } from './ensure-yapi.mjs';

const execFile = promisify(execFileCallback);

function createCommandError(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    ...extra,
  };
}

function normalizeOutput(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isLoginError(output) {
  return /login|log in|not logged in|please login/i.test(output);
}

async function defaultExec(command, args = []) {
  const result = await execFile(command, args, { encoding: 'utf8' });

  return {
    code: 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export async function runYapi({
  args = [],
  ensureYapi: ensureYapiFn = ensureYapi,
  exec = defaultExec,
} = {}) {
  const environment = await ensureYapiFn({ exec });
  if (!environment.ok) {
    return environment;
  }

  try {
    const result = await exec('yapi', args);
    return {
      ok: true,
      code: 'OK',
      stdout: normalizeOutput(result.stdout),
      stderr: normalizeOutput(result.stderr),
      autoInstalled: environment.autoInstalled,
    };
  } catch (error) {
    const stdout = normalizeOutput(error.stdout);
    const stderr = normalizeOutput(error.stderr);
    const combined = `${stdout}\n${stderr}`.trim();

    if (isLoginError(combined)) {
      return createCommandError('NOT_LOGGED_IN', 'YApi CLI is not logged in.', {
        stdout,
        stderr,
        nextStep: 'Run `yapi login` to authenticate with your YApi server.',
      });
    }

    return createCommandError('COMMAND_FAILED', 'YApi CLI command failed.', {
      stdout,
      stderr,
      exitCode: error.code ?? 1,
    });
  }
}

export async function setupYapi({
  ensureYapi: ensureYapiFn = ensureYapi,
  exec = defaultExec,
} = {}) {
  const environment = await ensureYapiFn({ exec });
  if (!environment.ok) {
    return environment;
  }

  const whoami = await runYapi({
    args: ['whoami'],
    ensureYapi: async () => environment,
    exec,
  });

  if (!whoami.ok) {
    return {
      ...whoami,
      autoInstalled: environment.autoInstalled,
      nextStep: whoami.code === 'NOT_LOGGED_IN' ? 'Run `yapi login` and retry setup.' : whoami.nextStep,
    };
  }

  return {
    ok: true,
    code: 'OK',
    autoInstalled: environment.autoInstalled,
    stdout: whoami.stdout,
    message: environment.autoInstalled
      ? 'YApi CLI was installed and is ready to use.'
      : 'YApi CLI is already installed and ready to use.',
  };
}

async function main() {
  const result = await runYapi({ args: process.argv.slice(2) });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
