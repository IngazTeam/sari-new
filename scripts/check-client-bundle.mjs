import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const MAX_ENTRY_BYTES = 600_000;
const MAX_ENTRY_GZIP_BYTES = 185_000;
const publicDirectory = resolve('dist/public');
const indexHtml = await readFile(resolve(publicDirectory, 'index.html'), 'utf8');
const entryMatch = indexHtml.match(/<script\b[^>]*\bsrc="\/assets\/(index-[^"]+\.js)"[^>]*>/i);

if (!entryMatch) {
  throw new Error('Unable to identify the production client entry from dist/public/index.html');
}

const entryName = basename(entryMatch[1]);
const entrySource = await readFile(resolve(publicDirectory, 'assets', entryName));
const gzipBytes = gzipSync(entrySource, { level: 9 }).byteLength;

if (entrySource.byteLength > MAX_ENTRY_BYTES || gzipBytes > MAX_ENTRY_GZIP_BYTES) {
  throw new Error(
    `Client entry budget exceeded: ${entrySource.byteLength} bytes raw / ${gzipBytes} bytes gzip ` +
    `(budgets: ${MAX_ENTRY_BYTES} / ${MAX_ENTRY_GZIP_BYTES})`,
  );
}

console.log(
  `[bundle-budget] ${entryName}: ${entrySource.byteLength} bytes raw / ${gzipBytes} bytes gzip`,
);
