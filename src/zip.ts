import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

export interface ZipEntry {
  path: string;
  sizeBytes: number;
}

export interface ZipResult {
  buffer: Buffer;
  entries: ZipEntry[];
  /** Detected default file: `index.html` at root, else the single root `.html`. */
  entrypoint: string | null;
}

// Directories never worth shipping in a static-site bundle.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function walk(dir: string, base: string, files: Record<string, Uint8Array>, entries: ZipEntry[]): void {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(abs, base, files, entries);
    } else if (stat.isFile()) {
      if (SKIP_FILES.has(name)) continue;
      const rel = path.relative(base, abs).split(path.sep).join('/');
      const data = fs.readFileSync(abs);
      files[rel] = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      entries.push({ path: rel, sizeBytes: data.byteLength });
    }
  }
}

/**
 * Walk a directory and build an in-memory zip Buffer plus a manifest preview.
 * `.git`/`node_modules` and OS junk files are skipped. Paths use forward
 * slashes so they round-trip cleanly through the backend's POSIX normalizer.
 */
export function zipDirectory(dir: string): ZipResult {
  const files: Record<string, Uint8Array> = {};
  const entries: ZipEntry[] = [];
  walk(dir, dir, files, entries);

  const buffer = Buffer.from(zipSync(files));

  let entrypoint: string | null = null;
  if (entries.some((e) => e.path === 'index.html')) {
    entrypoint = 'index.html';
  } else {
    const rootHtml = entries.filter((e) => !e.path.includes('/') && e.path.toLowerCase().endsWith('.html'));
    if (rootHtml.length === 1) entrypoint = rootHtml[0].path;
  }

  return { buffer, entries, entrypoint };
}
