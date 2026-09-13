'use strict';

const assert = require('assert');
const { webcrypto } = require('crypto');
const client = require('../LifeOS/js/context-client.js');

const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const record = {
  ownerUid: 'owner-test',
  kind: 'daily-digest',
  date: '2026-08-17',
  updatedAt: '2026-08-17T00:00:00+00:00',
  keyVersion: 1,
  nonce: 'oKGio6Slpqeoqaqr',
  ciphertext: 'nTofQjCldp1YV6vxah-zrRHLPDKolarbNOmNKZke_ul942WCYgwHhHEgOhCn9YhEU3ZuCQ',
};

(async () => {
  const parsed = client.parseRecoveryCode(`PC1-1-${key}`);
  assert.strictEqual(parsed.keyVersion, 1);
  assert.strictEqual(parsed.key, key);
  assert.strictEqual(
    client.projectionAad('owner-test', 'daily-digest', '2026-08-17', 1),
    'personal-context|owner-test|daily-digest|2026-08-17|v1',
  );
  const payload = await client.decryptProjection(record, parsed, webcrypto);
  assert.deepStrictEqual(payload, { count: 2, message: '跨端测试' });
  await assert.rejects(
    () => client.decryptProjection(record, { keyVersion: 1, key: 'Hw4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA' }, webcrypto),
  );
  assert.throws(() => client.parseRecoveryCode('not-a-code'));
  console.log('context-client.test.js: all assertions passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });

