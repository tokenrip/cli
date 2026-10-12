// Writes src/version.ts from package.json so the ESM and CJS builds (and bun
// tests run from src) share one version without reading package.json at
// runtime, which a CommonJS module compiled from TypeScript cannot locate
// through import.meta. Runs first in `bun run build`.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const target = new URL('src/version.ts', root);
const source = `// Generated from package.json by scripts/write-version.mjs during \`bun run build\`. Do not edit.\nexport const CLI_VERSION = ${JSON.stringify(version)};\n`;
let current = '';
try { current = readFileSync(target, 'utf8'); } catch {}
if (current !== source) writeFileSync(target, source);
