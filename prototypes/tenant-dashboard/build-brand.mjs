import { copyFileSync, mkdirSync } from 'node:fs';

// Keep the standalone preview identical to the app without a remote font request.
const source = new URL('../../client/public/', import.meta.url);
const destination = new URL('./site/', import.meta.url);
for (const directory of ['tenant', 'central/fonts']) {
  mkdirSync(new URL(`${directory}/`, destination), { recursive: true });
}
for (const file of [
  'tenant/brand.css',
  'central/fonts/IBMPlexSansArabic-Light.ttf',
  'central/fonts/IBMPlexSansArabic-Regular.ttf',
  'central/fonts/IBMPlexSansArabic-SemiBold.ttf',
  'central/fonts/OFL.txt',
]) {
  copyFileSync(new URL(file, source), new URL(file, destination));
}
console.log('Tenant preview: shared boxed shell and central landing typography copied.');
