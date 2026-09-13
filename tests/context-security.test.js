'use strict';
const assert = require('assert');
const { webcrypto } = require('crypto');
const { loadLifeOS, FakeIndexedDB } = require('./core-data.test');
const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const fixture = {
    ownerUid: 'owner-test', kind: 'daily-digest', date: '2026-08-17', keyVersion: 1,
    nonce: 'oKGio6Slpqeoqaqr',
    ciphertext: 'nTofQjCldp1YV6vxah-zrRHLPDKolarbNOmNKZke_ul942WCYgwHhHEgOhCn9YhEU3ZuCQ'
};
async function setup() {
    const network = { onLine: true };
    const state = { user: { uid: 'owner-test', isAnonymous: false }, records: [fixture], query: null, authError: null };
    const window = { crypto: webcrypto, cloudbase: { init({ env }) {
        assert.equal(env, 'test-env');
        return {
            auth: () => ({ getLoginState: async () => { if (state.authError) throw state.authError; return { user: state.user }; } }),
            database: () => ({ collection(name) {
                assert.equal(name, 'context_projections');
                return { where(filter) { assert.equal(filter.ownerUid, 'owner-test'); return this; }, orderBy() { return this; }, limit() { return this; },
                    get: async () => state.query ? state.query() : ({ data: state.records }) };
            } })
        };
    } } };
    const app = loadLifeOS(null, { window, navigator: network, contextClient: true });
    await app.Settings.set('cloudbaseEnvId', 'test-env');
    await app.Settings.set('syncProvider', 'cloudbase');
    await app.Settings.set('accountUid', 'owner-test');
    await app.ContextClient.setRecoveryCode(`PC1-1-${key}`);
    return { app, state, network };
}
async function testExportsImportsAndBackendExcludePrivateContext() {
    const { app } = await setup();
    await app.ContextClient.loadProjections();
    const before = await app.Database.contextState();
    const data = await app.Database.exportAll();
    assert(!data.settings.some(row => row.key.startsWith('contextProjection')));
    for (const strategy of ['merge', 'overwrite']) {
        await app.Database.importAll({ settings: [
            { key: 'contextProjectionKey', value: { key: 'foreign-key' } },
            { key: 'contextProjectionCache', value: { items: ['foreign-summary'] } },
            { key: 'contextProjectionIdentity', value: { ownerUid: 'foreign-owner' } },
            { key: 'ordinaryPreference', value: 'saved' }
        ] }, strategy);
        assert.equal((await app.Settings.get('contextProjectionKey')).key, key);
        assert.equal(await app.Settings.get('ordinaryPreference'), 'saved');
        if (strategy === 'merge') assert.deepStrictEqual(await app.Settings.get('contextProjectionCache'), before.cache);
    }
    let posted;
    const backendApp = loadLifeOS(async (url, options) => { posted = options && JSON.parse(options.body); return { ok: true }; });
    await backendApp.Settings.set('contextProjectionKey', { key: 'secret' });
    await backendApp.Settings.set('contextProjectionCache', { items: ['private'] });
    backendApp.BackendSync._apiBase = 'https://backend.test/api'; backendApp.BackendSync._enabled = true;
    await backendApp.BackendSync.sync();
    assert(posted && !posted.settings.some(row => row.key.startsWith('contextProjection')));
}
async function testMigrationPreservesBusinessRecordsAndKey() {
    const indexedDB = new FakeIndexedDB();
    const old = loadLifeOS(null, { indexedDB });
    await old.Settings.set('contextProjectionKey', { key, keyVersion: 1 });
    await old.Settings.set('contextProjectionCache', { items: ['legacy'] });
    await old.Settings.set('contextProjectionIdentity', { ownerUid: 'legacy' });
    const task = await old.Task.create({ title: 'Keep this task', date: '2026-09-14' });
    const saved = await old.Database.get('tasks', task.id);
    indexedDB.databases.get('LifeOSDB').version = 4;
    const upgraded = loadLifeOS(null, { indexedDB });
    await upgraded.Database.init();
    assert.equal(upgraded.Database.version, 5);
    assert.deepStrictEqual(await upgraded.Database.get('tasks', task.id), saved);
    assert.equal((await upgraded.Settings.get('contextProjectionKey')).key, key);
    assert.equal(await upgraded.Settings.get('contextProjectionCache'), null);
    assert.equal(await upgraded.Settings.get('contextProjectionIdentity'), null);
}
async function testVerifiedOfflineCacheAndIsolation() {
    for (const setting of ['accountUid', 'cloudbaseEnvId', 'contextProjectionKey', 'syncProvider']) {
        const { app, network } = await setup();
        const online = await app.ContextClient.loadProjections();
        network.onLine = false;
        const offline = await app.ContextClient.loadProjections();
        assert.equal(offline.source, 'offline-cache'); assert.equal(offline.cachedAt, online.cachedAt);
        const oldValue = await app.Settings.get(setting);
        await app.Settings.set(setting, setting === 'contextProjectionKey' ? null : 'different');
        await app.Settings.set(setting, oldValue); // Switching back must not resurrect cache.
        await assert.rejects(app.ContextClient.loadProjections(), { code: 'CACHE_UNAVAILABLE' });
        assert.equal(await app.Settings.get('contextProjectionCache'), null);
    }
}
async function testLegacyAndTamperedBindingRejected() {
    for (const field of ['envId', 'ownerUid', 'keyFingerprint', 'revision']) {
        const { app, network } = await setup(); await app.ContextClient.loadProjections();
        const cache = await app.Settings.get('contextProjectionCache'); cache.binding[field] = 'wrong';
        await app.Settings.set('contextProjectionCache', cache); network.onLine = false;
        await assert.rejects(app.ContextClient.loadProjections(), { code: 'CACHE_UNAVAILABLE' });
    }
    const { app, network } = await setup();
    await app.Settings.set('contextProjectionCache', { items: [fixture], cachedAt: '2026-08-17' }); network.onLine = false;
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'CACHE_UNAVAILABLE' });
}
async function testLateResponsesCannotRestoreInvalidatedCache() {
    for (const setting of ['accountUid', 'cloudbaseEnvId', 'contextProjectionKey']) {
        const { app, state } = await setup();
        let release, started;
        const entered = new Promise(resolve => { started = resolve; });
        state.query = () => new Promise(resolve => { release = resolve; started(); });
        const loading = app.ContextClient.loadProjections(); await entered;
        await app.Settings.set(setting, null);
        release({ data: [fixture] });
        await assert.rejects(loading, { code: 'STALE_CONTEXT' });
        assert.equal(await app.Settings.get('contextProjectionCache'), null);
    }
}
async function testAuthenticationAndPermissionFailuresDoNotUseCache() {
    const { app, state, network } = await setup(); await app.ContextClient.loadProjections();
    state.authError = Object.assign(new Error('session expired'), { code: 401 });
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'ACCOUNT_REQUIRED' });
    network.onLine = false;
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'CACHE_UNAVAILABLE' });
    network.onLine = true; state.authError = null; await app.ContextClient.loadProjections();
    state.authError = new Error('SDK unavailable');
    await assert.rejects(app.ContextClient.loadProjections(), /SDK unavailable/);
    state.authError = null; state.user = null;
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'ACCOUNT_REQUIRED' });
    network.onLine = false;
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'CACHE_UNAVAILABLE' });
    network.onLine = true; state.user = { uid: 'owner-test' }; await app.ContextClient.loadProjections();
    state.query = () => { throw Object.assign(new Error('permission denied'), { code: 403 }); };
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'ACCOUNT_REQUIRED' });
}
async function testPartialResultsWrongKeysAndForeignOwners() {
    const { app, state } = await setup();
    state.records = [fixture, { ...fixture, ciphertext: 'broken' }];
    const partial = await app.ContextClient.loadProjections();
    assert.equal(partial.items.length, 1); assert.equal(partial.failures.length, 1);
    state.records = [{ ...fixture, ownerUid: 'foreign' }];
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'OWNER_MISMATCH' });
    state.records = [fixture];
    await app.ContextClient.setRecoveryCode('PC1-1-Hw4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA');
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'DECRYPT_FAILED' });
    assert.equal(await app.Settings.get('contextProjectionCache'), null);
}
async function testQueryNetworkFailureUsesOnlyVerifiedCache() {
    const { app, state } = await setup(); await app.ContextClient.loadProjections();
    state.query = () => { throw new Error('network unavailable'); };
    const result = await app.ContextClient.loadProjections();
    assert.equal(result.source, 'stale-cache'); assert(result.cachedAt);
    await app.ContextClient.clearRecoveryCode();
    await assert.rejects(app.ContextClient.loadProjections(), { code: 'KEY_REQUIRED' });
}
(async () => {
    for (const test of [testExportsImportsAndBackendExcludePrivateContext, testMigrationPreservesBusinessRecordsAndKey,
        testVerifiedOfflineCacheAndIsolation, testLegacyAndTamperedBindingRejected, testLateResponsesCannotRestoreInvalidatedCache,
        testAuthenticationAndPermissionFailuresDoNotUseCache, testPartialResultsWrongKeysAndForeignOwners, testQueryNetworkFailureUsesOnlyVerifiedCache]) {
        await test(); console.log('PASS ' + test.name);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
