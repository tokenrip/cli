import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';
import { CliError } from './errors.js';

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

// Directories never worth shipping in a bundle or a skill.
export const SKIP_DIRS: ReadonlySet<string> = new Set(['.git', 'node_modules', '.svn', '.hg']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export interface WalkedFile {
  /** Forward-slash path relative to the walked directory. */
  path: string;
  absolutePath: string;
  sizeBytes: number;
}

export interface WalkOptions {
  /**
   * Refuse (`INVALID_ARGS`, naming the path) any symbolic link, and any dotfile or dot-folder
   * other than the skipped ones, instead of following or including it. For uploads whose
   * contents others read, such as skills: a link could pull in a file from outside the folder,
   * and a `.env` would otherwise be uploaded without anyone noticing.
   */
  strict?: boolean;
}

/**
 * Every regular file under `dir`, recursively, skipping `.git`/`node_modules`
 * and OS junk files. Paths use forward slashes so they round-trip cleanly
 * through the backend's POSIX normalizer. Without `strict`, symbolic links are
 * followed (what `rip deploy` has always done).
 */
export function walkFiles(dir: string, options: WalkOptions = {}): WalkedFile[] {
  const out: WalkedFile[] = [];
  const rel = (abs: string) => path.relative(dir, abs).split(path.sep).join('/');
  const walk = (current: string): void => {
    for (const name of fs.readdirSync(current)) {
      const abs = path.join(current, name);
      const stat = options.strict ? fs.lstatSync(abs) : fs.statSync(abs);
      if (stat.isDirectory() ? SKIP_DIRS.has(name) : SKIP_FILES.has(name)) continue;
      if (options.strict && stat.isSymbolicLink()) {
        throw new CliError('INVALID_ARGS', `${rel(abs)} is a symbolic link. Replace it with the file or folder it points to, or move it out of ${dir}.`);
      }
      if (options.strict && name.startsWith('.')) {
        throw new CliError('INVALID_ARGS', `${rel(abs)} is a hidden ${stat.isDirectory() ? 'folder' : 'file'}, which is never uploaded silently. Move it out of ${dir} (or rename it) and try again.`);
      }
      if (stat.isDirectory()) walk(abs);
      else if (stat.isFile()) out.push({ path: rel(abs), absolutePath: abs, sizeBytes: stat.size });
    }
  };
  walk(dir);
  return out;
}

/** Walk a directory (`walkFiles`) and build an in-memory zip Buffer plus a manifest preview. */
export function zipDirectory(dir: string): ZipResult {
  const files: Record<string, Uint8Array> = {};
  const entries: ZipEntry[] = [];
  for (const file of walkFiles(dir)) {
    const data = fs.readFileSync(file.absolutePath);
    files[file.path] = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    entries.push({ path: file.path, sizeBytes: data.byteLength });
  }

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
