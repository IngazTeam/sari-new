import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A trusted, built release must explicitly support the post-0127 order identity.
// Do not infer compatibility from its age, application name or current DB data.
export function assertZidOrderReleaseCompatible(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw Error('ZID_ORDER_RELEASE_INCOMPATIBLE');
  const marker = JSON.parse(fs.readFileSync(path.join(directory, 'scripts/zid-order-store-capability.json'), 'utf8'));
  if (marker?.version !== 1 || !Array.isArray(marker.capabilities)
      || !marker.capabilities.includes('zid-order-store-identity-0127')) throw Error('ZID_ORDER_RELEASE_INCOMPATIBLE');
}

export function assertManagedWritersStopped(processes) {
  if (!Array.isArray(processes)) throw Error('MANAGED_WRITERS_NOT_STOPPED');
  for (const app of processes.filter(app => ['sari', 'sari-inbound'].includes(app?.name))) {
    if (app.pm2_env?.status !== 'stopped' || (app.pid !== 0 && app.pid !== null)) throw Error('MANAGED_WRITERS_NOT_STOPPED');
  }
}

export function assertManagedWriterCompatibility(processes) {
  if (!Array.isArray(processes)) throw Error('INVALID_MANAGED_WRITER_STATE');
  for (const app of processes.filter(app => ['sari', 'sari-inbound'].includes(app?.name))) {
    const directory = app.pm2_env?.pm_cwd;
    assertZidOrderReleaseCompatible(directory);
    const executable = app.pm2_env?.pm_exec_path;
    if (typeof executable !== 'string' || path.resolve(executable) !== path.join(directory, 'dist', app.name === 'sari' ? 'index.js' : 'worker.js')) {
      throw Error('INVALID_MANAGED_WRITER_EXECUTABLE');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'compatible') assertZidOrderReleaseCompatible(process.argv[3]);
    else if (['stopped','writers-compatible'].includes(process.argv[2])) {
      let input='';for await (const chunk of process.stdin) input+=chunk;
      if(process.argv[2]==='stopped')assertManagedWritersStopped(JSON.parse(input));
      else assertManagedWriterCompatibility(JSON.parse(input));
    } else throw Error('INVALID_RELEASE_GUARD_ACTION');
  } catch {
    console.error('ZID_ORDER_RELEASE_GUARD_FAILED; RETAIN_DATA_AND_ROLL_FORWARD_WITH_COMPATIBLE_RELEASE');
    process.exitCode=1;
  }
}
