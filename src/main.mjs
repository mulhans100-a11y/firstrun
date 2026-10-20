'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as core from '@actions/core';
import MarkdownIt from 'markdown-it';

const MAX_CAPTURE_CHARS = 6000;
const MAX_TIMEOUT_MINUTES = 360;
const markdown = new MarkdownIt({ html: false });

function resolveWorkspacePath(workspace, input, label) {
  const resolved = path.resolve(workspace, input);
  const relative = path.relative(workspace, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside the checked-out workspace.`);
  }
  return resolved;
}

function checkUbuntuRunner() {
  if (process.platform !== 'linux') {
    throw new Error('FirstRun currently supports Ubuntu Linux runners only.');
  }

  let release;
  try {
    release = fs.readFileSync('/etc/os-release', 'utf8');
  } catch {
    throw new Error('FirstRun could not verify that this is an Ubuntu runner.');
  }

  if (!/^ID="?ubuntu"?$/m.test(release)) {
    throw new Error('FirstRun currently supports Ubuntu Linux runners only.');
  }
}

function validateTimeout(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error('The timeout-minutes input must be a whole number from 1 to 360.');
  }

  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_MINUTES) {
    throw new Error('The timeout-minutes input must be a whole number from 1 to 360.');
  }
  return timeout;
}

function findMarkedBlocks(source) {
  return markdown.parse(source, {}).filter((token) => (
    token.type === 'fence' && token.info.trim() === 'bash firstrun'
  )).map((token) => token.content);
}

function createIsolatedHome(workspace) {
  const tempRoot = process.env.RUNNER_TEMP || path.join(workspace, '.firstrun-tmp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const home = fs.mkdtempSync(path.join(tempRoot, 'firstrun-home-'));
  fs.mkdirSync(path.join(home, '.cache'), { recursive: true });
  fs.mkdirSync(path.join(home, '.config'), { recursive: true });
  return home;
}

function createChildEnvironment(cwd, home) {
  const safeNames = [
    'PATH',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TZ',
    'GITHUB_WORKSPACE',
    'RUNNER_TEMP',
    'RUNNER_TOOL_CACHE',
    'RUNNER_OS',
    'RUNNER_ARCH',
  ];
  const env = {};
  for (const name of safeNames) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  env.CI = 'true';
  env.HOME = home;
  env.PWD = cwd;
  env.XDG_CACHE_HOME = path.join(home, '.cache');
  env.XDG_CONFIG_HOME = path.join(home, '.config');
  env.TMPDIR = process.env.RUNNER_TEMP || os.tmpdir();
  env.TMP = env.TMPDIR;
  env.TEMP = env.TMPDIR;
  env.TERM = 'dumb';
  return env;
}

function appendLimited(capture, chunk) {
  const text = chunk.toString('utf8');
  const remaining = MAX_CAPTURE_CHARS - capture.text.length;
  if (remaining > 0) capture.text += text.slice(0, remaining);
  if (text.length > remaining) capture.truncated = true;
}

function runBlock(code, cwd, env, timeoutMs) {
  return new Promise((resolve) => {
    const stdout = { text: '', truncated: false };
    const stderr = { text: '', truncated: false };
    let timedOut = false;
    let spawnError = null;
    let timeoutHandle;
    let forceKillHandle;

    const child = spawn('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail'], {
      cwd,
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const killGroup = (signal) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };

    child.stdout.on('data', (chunk) => appendLimited(stdout, chunk));
    child.stderr.on('data', (chunk) => appendLimited(stderr, chunk));
    child.on('error', (error) => { spawnError = error; });
    child.stdin.on('error', () => {});
    child.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      clearTimeout(forceKillHandle);
      resolve({ code, signal, timedOut, spawnError, stdout, stderr });
    });

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      forceKillHandle = setTimeout(() => killGroup('SIGKILL'), 1000);
    }, timeoutMs);

    child.stdin.end(code);
  });
}

function sanitizeOutput(value) {
  let sanitized = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x1b) {
      if (value[index + 1] === '[') {
        index += 2;
        while (index < value.length) {
          const sequenceCode = value.charCodeAt(index);
          if (sequenceCode >= 0x40 && sequenceCode <= 0x7e) break;
          index += 1;
        }
      }
      continue;
    }
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      sanitized += value[index];
    }
  }
  return sanitized;
}

function safeLogLines(label, capture) {
  if (!capture.text) {
    console.error(`  ${label}: (no output)`);
    return;
  }

  console.error(`  ${label}${capture.truncated ? ` (truncated at ${MAX_CAPTURE_CHARS} characters)` : ''}:`);
  const sanitized = sanitizeOutput(capture.text);

  for (const line of sanitized.split(/\r?\n/)) console.error(`    | ${line}`);
}

function reportBlockFailure(index, total, block, result, timeoutMinutes) {
  console.error(`FirstRun: block ${index} of ${total} failed.`);
  if (result.timedOut) {
    console.error(`  Exceeded the total timeout of ${timeoutMinutes} minute(s).`);
  } else if (result.spawnError) {
    console.error(`  Bash could not be started: ${result.spawnError.code || 'unknown error'}.`);
  } else {
    console.error(`  Exit code: ${result.code === null ? 'unknown' : result.code}.`);
    if (result.signal) console.error(`  Signal: ${result.signal}.`);
  }

  console.error('  Marked README block:');
  const safeBlock = sanitizeOutput(block);

  for (const line of safeBlock.split(/\r?\n/)) console.error(`    | ${line}`);
  safeLogLines('stdout', result.stdout);
  safeLogLines('stderr', result.stderr);
}

function writeSummary(state) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const details = state.details.replace(/[|\r\n]/g, ' ');
  const content = [
    '## FirstRun',
    '',
    '| Result | Blocks completed | Details |',
    '| --- | ---: | --- |',
    `| ${state.status} | ${state.completed}/${state.total} | ${details} |`,
    '',
  ].join('\n');
  fs.appendFileSync(summaryPath, content, 'utf8');
}

async function main() {
  const state = {
    status: 'Failed',
    completed: 0,
    total: 0,
    details: 'The action did not complete.',
  };
  let failure = null;
  let isolatedHome = null;

  try {
    checkUbuntuRunner();

    const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
    const readmeInput = core.getInput('readme-path') || 'README.md';
    const workingDirectoryInput = core.getInput('working-directory') || '.';
    const timeoutMinutes = validateTimeout(core.getInput('timeout-minutes') || '10');
    const readmePath = resolveWorkspacePath(workspace, readmeInput, 'readme-path');
    const cwd = resolveWorkspacePath(workspace, workingDirectoryInput, 'working-directory');

    if (!fs.statSync(readmePath).isFile()) {
      throw new Error('The configured README path is not a file.');
    }
    if (!fs.statSync(cwd).isDirectory()) {
      throw new Error('The configured working-directory is not a directory.');
    }

    const source = fs.readFileSync(readmePath, 'utf8');
    const blocks = findMarkedBlocks(source);
    state.total = blocks.length;

    if (blocks.length === 0) {
      state.details = 'No bash firstrun blocks found.';
      console.error('FirstRun found no runnable blocks in the configured README.');
      console.error('Add a fenced block with the exact info string `bash firstrun`, then put setup commands inside it.');
      console.error('Example:');
      console.error('  | ```bash firstrun');
      console.error('  | npm ci');
      console.error('  | ```');
      failure = 'No marked bash firstrun blocks were found.';
    } else {
      isolatedHome = createIsolatedHome(workspace);
      const env = createChildEnvironment(cwd, isolatedHome);
      const deadline = Date.now() + timeoutMinutes * 60 * 1000;

      for (let index = 0; index < blocks.length; index += 1) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          const result = {
            code: null,
            signal: null,
            timedOut: true,
            spawnError: null,
            stdout: { text: '', truncated: false },
            stderr: { text: '', truncated: false },
          };
          reportBlockFailure(index + 1, blocks.length, blocks[index], result, timeoutMinutes);
          state.details = `Timed out at block ${index + 1}.`;
          failure = `The total timeout of ${timeoutMinutes} minute(s) was exceeded.`;
          break;
        }

        console.log(`FirstRun: running block ${index + 1} of ${blocks.length}.`);
        const result = await runBlock(blocks[index], cwd, env, remainingMs);
        if (result.code !== 0 || result.timedOut || result.spawnError) {
          reportBlockFailure(index + 1, blocks.length, blocks[index], result, timeoutMinutes);
          state.details = result.timedOut
            ? `Timed out at block ${index + 1}.`
            : `Block ${index + 1} failed with exit code ${result.code === null ? 'unknown' : result.code}.`;
          failure = result.timedOut
            ? `The total timeout of ${timeoutMinutes} minute(s) was exceeded.`
            : `Marked block ${index + 1} failed.`;
          break;
        }
        state.completed += 1;
        console.log(`FirstRun: block ${index + 1} passed.`);
      }

      if (!failure) {
        state.status = 'Passed';
        state.details = 'All marked blocks passed.';
      }
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : 'FirstRun failed for an unknown reason.';
    state.details = 'Action setup failed.';
    console.error(`FirstRun: ${failure}`);
  } finally {
    if (isolatedHome) {
      try {
        fs.rmSync(isolatedHome, { recursive: true, force: true });
      } catch {
        console.error('FirstRun could not remove its temporary home directory.');
      }
    }
    try {
      writeSummary(state);
    } catch {
      console.error('FirstRun could not write the GitHub job summary.');
      if (!failure) failure = 'FirstRun could not write the GitHub job summary.';
    }
  }

  if (failure) core.setFailed(failure);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'FirstRun failed for an unknown reason.';
  console.error(`FirstRun: ${message}`);
  core.setFailed(message);
});
