import fs from 'node:fs';
import path from 'node:path';
import { bech32 } from 'bech32';
import { CURRENT_CONFIG_VERSION, getConfigDir, loadConfig, saveConfig } from './config.js';
import { loadIdentity, saveIdentity } from './identity.js';
import { saveIdentities } from './identities.js';


function migrateAgentId(id: string): string {
  const { words } = bech32.decode(id, 90);
  const bytes = Buffer.from(bech32.fromWords(words));
  return bech32.encode('rip', bech32.toWords(bytes), 90);
}

// v1 → v2: re-encode agent IDs from trip1 to rip1
function migrateV1toV2(): void {
  const identity = loadIdentity();
  if (identity?.agentId.startsWith('trip1')) {
    // saveIdentity backs up identity.json to identity.json.bak automatically
    saveIdentity({ ...identity, agentId: migrateAgentId(identity.agentId) });
  }
}

// v2 → v3: move identity.json + config.apiKey into identities.json store
function migrateV2toV3(): void {
  const dir = getConfigDir();
  const identityFile = path.join(dir, 'identity.json');
  if (!fs.existsSync(identityFile)) return;

  let identity: { agentId: string; publicKey: string; secretKey: string } | null = null;
  try {
    identity = JSON.parse(fs.readFileSync(identityFile, 'utf-8'));
  } catch {
    return;
  }
  if (!identity) return;

  const config = loadConfig();
  const stored: Record<string, unknown> = {
    agentId: identity.agentId,
    publicKey: identity.publicKey,
    secretKey: identity.secretKey,
  };
  if (config.apiKey) stored.apiKey = config.apiKey;

  saveIdentities({ [identity.agentId]: stored as any });

  const updated = { ...config, currentAgent: identity.agentId };
  delete (updated as any).apiKey;
  saveConfig(updated);

  fs.renameSync(identityFile, `${identityFile}.migrated`);
}

// v3 → v4: drop a pointer whose account has several sign-ins here. Before v4, `rip auth login`
// moved the pointer to every new sign-in, so it may name the newest agent rather than the first;
// plain `rip` refused on such a computer anyway, and now names `rip account use` to set one.
// Reads identities.json without writing it (pre-v2 entries hold `agentId`, not `accountId`).
function migrateV3toV4(): void {
  const config = loadConfig();
  const pointer = config.currentAccount || config.currentAgent;
  if (!pointer) return;
  let store: Record<string, { accountId?: string; agentId?: string }>;
  try {
    store = JSON.parse(fs.readFileSync(path.join(getConfigDir(), 'identities.json'), 'utf-8'));
  } catch {
    return;
  }
  const accountOf = (entry: { accountId?: string; agentId?: string }) => entry.accountId ?? entry.agentId;
  const accountId = Object.hasOwn(store, pointer) ? accountOf(store[pointer]) : pointer;
  if (Object.values(store).filter((entry) => accountOf(entry) === accountId).length <= 1) return;
  delete config.currentAccount;
  delete config.currentAgent;
  saveConfig(config);
}

const MIGRATIONS: Array<{ version: number; run: () => void }> = [
  { version: 2, run: migrateV1toV2 },
  { version: 3, run: migrateV2toV3 },
  { version: 4, run: migrateV3toV4 },
];

export function runMigrations(): void {
  const configFile = path.join(getConfigDir(), 'config.json');
  if (!fs.existsSync(configFile)) return;
  try {
    const config = loadConfig();
    const current = config.configVersion ?? 1;
    if (current >= CURRENT_CONFIG_VERSION) return;

    const pending = MIGRATIONS.filter(m => m.version > current);
    for (const m of pending) {
      m.run();
    }

    const latestVersion = pending[pending.length - 1].version;
    const postMigrationConfig = loadConfig();
    saveConfig({ ...postMigrationConfig, configVersion: latestVersion });

    console.error(`Config migrated (v${current} → v${latestVersion})`);
    console.error(`  Skill file may be outdated — check latest: https://tokenrip.com/.well-known/skills/tokenrip/SKILL.md`);
  } catch (err) {
    console.error(`Warning: Config migration failed — ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Try reinstalling: npm install -g @tokenrip/cli`);
  }
}
