/**
 * Logger
 *
 * Abstraction over @actions/core logging that works in both
 * GitHub Actions mode and standalone CLI mode.
 * Auto-detects environment and routes to appropriate output.
 */

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

let actionsCore: typeof import('@actions/core') | null = null;

if (isGitHubActions) {
  try {
    actionsCore = require('@actions/core');
  } catch {
    // Not available — fall back to console
  }
}

export function info(message: string): void {
  if (actionsCore) {
    actionsCore.info(message);
  } else {
    console.log(message);
  }
}

export function warning(message: string): void {
  if (actionsCore) {
    actionsCore.warning(message);
  } else {
    console.warn(`WARNING: ${message}`);
  }
}

export function error(message: string): void {
  if (actionsCore) {
    actionsCore.error(message);
  } else {
    console.error(`ERROR: ${message}`);
  }
}

export function setFailed(message: string): void {
  if (actionsCore) {
    actionsCore.setFailed(message);
  } else {
    console.error(`FAILED: ${message}`);
    process.exitCode = 1;
  }
}

export function setOutput(name: string, value: string | number): void {
  if (actionsCore) {
    actionsCore.setOutput(name, value);
  }
  // In CLI mode, outputs are just printed
}
