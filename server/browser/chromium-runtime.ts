import { constants, existsSync, realpathSync, statSync, accessSync } from 'node:fs';
import path from 'node:path';

const MAX_EXECUTABLE_PATH_LENGTH = 4_096;
const SANDBOX_DISABLE_ACK = 'isolated-container-with-seccomp';

function defaultCandidates(): string[] {
  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];

  for (const root of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
    if (!root) continue;
    candidates.push(
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Chromium', 'Application', 'chrome.exe'),
    );
  }
  return candidates;
}

function safeExecutable(candidate: string): string | null {
  if (!candidate || candidate.length > MAX_EXECUTABLE_PATH_LENGTH || candidate.includes('\0') || !path.isAbsolute(candidate)) {
    return null;
  }
  try {
    if (!existsSync(candidate)) return null;
    const resolved = realpathSync(candidate);
    if (!statSync(resolved).isFile()) return null;
    if (process.platform !== 'win32') accessSync(resolved, constants.X_OK);
    return resolved;
  } catch {
    return null;
  }
}

export function resolveChromiumExecutable(options: {
  explicitPath?: string;
  candidates?: readonly string[];
} = {}): string | null {
  const explicitPath = options.explicitPath ?? process.env.CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath) return safeExecutable(explicitPath);
  for (const candidate of options.candidates ?? defaultCandidates()) {
    const resolved = safeExecutable(candidate);
    if (resolved) return resolved;
  }
  return null;
}

export function chromiumLaunchArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  const args = ['--disable-dev-shm-usage', '--disable-gpu'];
  if (env.CHROMIUM_DISABLE_SANDBOX_ACK === SANDBOX_DISABLE_ACK) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return args;
}

export const CHROMIUM_SANDBOX_DISABLE_ACK = SANDBOX_DISABLE_ACK;
