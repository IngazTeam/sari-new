import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildByaanCanonicalRequest, signByaanRequest, verifyByaanSignedRequest } from '../../server/integrations/byaan-security';

// Executes the real PHP signer from a separately checked-out Byaan repository.
// No Laravel bootstrap, environment files, database, credentials or network.
const [byaanRoot, php] = process.argv.slice(2);
assert(byaanRoot && php, 'Usage: tsx verify-byaan-wire-contract.ts <byaan-root> <php-executable>');
const signer = resolve(byaanRoot, 'app/Services/Sari/SariRequestSignature.php');
assert(existsSync(signer), 'Byaan signer is missing');
const secret = 'synthetic-wire-contract-fixture-only-2026';
const timestamp = '1790596800';
const deliveryId = '9b05c146-2fcf-49fd-8fd8-de7d276f452e';
const tenantDomain = 'academy.example.com';
const phpCode = `require $argv[1]; $i=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$c=App\\Services\\Sari\\SariRequestSignature::canonical($i['timestamp'],$i['deliveryId'],$i['method'],$i['path'],$i['tenantDomain'],$i['body'],$i['version']);
$h=['timestamp'=>$i['timestamp'],'delivery_id'=>$i['deliveryId'],'signature'=>$i['signature'],'version'=>$i['version']];
echo json_encode(['canonical'=>$c,'signature'=>App\\Services\\Sari\\SariRequestSignature::sign($c,$i['secret']),
'verified'=>App\\Services\\Sari\\SariRequestSignature::verify($h,$i['method'],$i['path'],$i['tenantDomain'],$i['body'],$i['secret'],(int)$i['timestamp'])],JSON_THROW_ON_ERROR);`;
let verified = 0;
for (const version of ['1', '2'] as const) {
  for (const item of [
    { method: 'POST', path: '/api/sari/verify-ownership', body: JSON.stringify({ merchant_id: '42', challenge: 'a'.repeat(43) }) },
    { method: 'POST', path: '/api/v1/platform/sync/settings', body: JSON.stringify({ settings: { businessName: 'أكاديمية بيان', description: 'تعلم / وتطور' } }) },
    { method: 'GET', path: '/api/sari/health', body: '' },
    ...(version === '2' ? [{ method: 'GET', path: '/api/v1/platform/merchant/conversations?limit=15&status=active', body: '' }] : []),
  ]) {
    const input = { timestamp, deliveryId, tenantDomain, ...item, version, rawBody: Buffer.from(item.body) };
    const canonical = buildByaanCanonicalRequest(input);
    const signature = signByaanRequest(canonical, secret);
    const result = spawnSync(php, ['-r', phpCode, signer], { input: JSON.stringify({ ...input, secret, signature }), encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, 'PHP signer did not complete');
    const actual = JSON.parse(result.stdout);
    assert.equal(actual.canonical, canonical);
    assert.equal(actual.signature, signature);
    assert.equal(actual.verified, true);
    const headers = { timestamp, deliveryId, signature: actual.signature, version };
    assert.equal(verifyByaanSignedRequest({ ...input, headers, secret, nowSeconds: Number(timestamp) }).ok, true);
    for (const changed of [
      { rawBody: Buffer.from(item.body + ' ') }, { method: 'DELETE' }, { tenantDomain: 'other.example.com' },
      { path: item.path + '/tampered' }, { nowSeconds: Number(timestamp) + 301 },
    ]) {
      assert.equal(verifyByaanSignedRequest({ ...input, headers, secret, nowSeconds: Number(timestamp), ...changed }).ok, false);
    }
    if (version === '2' && item.path.includes('?')) {
      assert.equal(verifyByaanSignedRequest({ ...input, headers, secret, nowSeconds: Number(timestamp), path: item.path.replace('limit=15', 'limit=99') }).ok, false);
    }
    verified++;
  }
}
process.stdout.write(JSON.stringify({ status: 'passed', bidirectionalFixtures: verified, network: 'none', database: 'none' }) + '\n');
