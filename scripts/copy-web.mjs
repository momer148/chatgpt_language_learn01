#!/usr/bin/env node
/**
 * Copies the static web assets into www/ so Capacitor's webDir contains
 * exactly the files the app needs — and none of node_modules/, .git/, or
 * the native projects. Run via `npm run copy:web` (called by `npm run sync`).
 *
 * This app has no build step: the files at the repo root ARE the web app.
 * Keeping them at the root means the local dev server and GitHub Pages keep
 * working unchanged; www/ is purely a staging folder for the native wrap.
 */
import { mkdir, copyFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WWW = join(ROOT, "www");

// Explicit allow-list of the files that make up the deployable web app.
const FILES = [
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "auth.js",
  "db.js",
  "xlsx.full.min.js",
  "manifest.webmanifest",
  "icon.svg",
  "sw.js",
];

async function main() {
  // Start from a clean www/ each time so deleted assets don't linger.
  if (existsSync(WWW)) {
    await rm(WWW, { recursive: true, force: true });
  }
  await mkdir(WWW, { recursive: true });

  let copied = 0;
  for (const name of FILES) {
    const src = join(ROOT, name);
    if (!existsSync(src)) {
      console.warn(`  skip  ${name} (not found)`);
      continue;
    }
    await copyFile(src, join(WWW, name));
    copied += 1;
  }

  console.log(`copy:web -> staged ${copied} files into www/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
