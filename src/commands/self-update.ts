import { execFileSync } from 'node:child_process';
import { loadConfig, saveConfig, getFrontendUrl } from '../config.js';
import { fetchManifest, getCurrentVersion } from '../update-check.js';
import { outputSuccess } from '../output.js';
import { formatSelfUpdate } from '../formatters.js';

export async function selfUpdate(): Promise<void> {
  const currentVersion = getCurrentVersion();
  const manifest = await fetchManifest();

  let targetVersion = 'latest';
  if (manifest) {
    const config = loadConfig();
    const now = new Date().toISOString();
    try {
      saveConfig({ ...config, lastUpdateCheck: now, latestVersion: manifest.version });
    } catch {}

    if (manifest.version === currentVersion) {
      outputSuccess({
        status: 'current',
        version: currentVersion,
        message: `You're on the latest version (${currentVersion})`,
      }, formatSelfUpdate);
      return;
    }
    targetVersion = manifest.version;
  }

  try {
    execFileSync('npm', ['install', '-g', `@tokenrip/cli@${targetVersion}`], { stdio: 'inherit' });
  } catch {
    outputSuccess({
      status: 'failed',
      version: currentVersion,
      targetVersion,
      message: `Update failed. Try running with sudo:\n  sudo npm install -g @tokenrip/cli@${targetVersion}`,
    }, formatSelfUpdate);
    return;
  }

  const frontendUrl = getFrontendUrl();
  const skillUrl = `${frontendUrl}/.well-known/skills/tokenrip/SKILL.md`;

  outputSuccess({
    status: 'updated',
    from: currentVersion,
    to: targetVersion,
    skill_url: skillUrl,
    message: manifest?.message ?? null,
  }, formatSelfUpdate);
}
