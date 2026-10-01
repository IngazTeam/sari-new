import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

/** Match the app's split locale resources and reject silently missing namespaces. */
export async function loadPreviewLocales(namespaces) {
  const copy = {};
  for (const language of ['ar','en']) {
    const legacy = JSON.parse(await readFile(`client/src/locales/${language}.json`, 'utf8'));
    copy[language] = {};
    for (const namespace of namespaces) {
      if (namespace === 'merchantUx') {
        const bundle = await build({ entryPoints:[`client/src/locales/merchant-ux.${language}.ts`], bundle:true, platform:'node', format:'esm', write:false });
        copy[language][namespace] = (await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
      } else {
        if (!Object.hasOwn(legacy, namespace)) throw Error(`Missing preview namespace: ${language}.${namespace}`);
        copy[language][namespace] = legacy[namespace];
      }
    }
  }
  return copy;
}
