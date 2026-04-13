import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);

function createCommandError(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    ...extra,
  };
}

async function defaultExec(command, args = []) {
  const result = await execFile(command, args, { encoding: 'utf8' });

  return {
    code: 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function findBinary(binary, exec = defaultExec) {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const result = await exec(locator, [binary]);

  return (result.stdout ?? '').trim();
}

export async function ensureYapi({ exec = defaultExec } = {}) {
  try {
    await findBinary('node', exec);
  } catch (error) {
    return createCommandError('NODE_MISSING', 'Node.js is required to run the YApi plugin.', {
      stderr: error.stderr ?? '',
    });
  }

  try {
    await findBinary('npm', exec);
  } catch (error) {
    return createCommandError('NPM_MISSING', 'npm is required to install the YApi CLI automatically.', {
      stderr: error.stderr ?? '',
    });
  }

  try {
    const yapiPath = await findBinary('yapi', exec);
    return {
      ok: true,
      code: 'OK',
      autoInstalled: false,
      yapiPath,
    };
  } catch {
    // Continue to install below.
  }

  try {
    await exec('npm', ['install', '-g', '@leeguoo/yapi-mcp']);
  } catch (error) {
    return createCommandError(
      'CLI_INSTALL_FAILED',
      'Unable to install @leeguoo/yapi-mcp automatically with npm.',
      {
        stderr: error.stderr ?? '',
      }
    );
  }

  try {
    const yapiPath = await findBinary('yapi', exec);
    return {
      ok: true,
      code: 'OK',
      autoInstalled: true,
      yapiPath,
    };
  } catch (error) {
    return createCommandError('CLI_MISSING', 'The YApi CLI is still unavailable after installation.', {
      stderr: error.stderr ?? '',
    });
  }
}

async function main() {
  const result = await ensureYapi();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
