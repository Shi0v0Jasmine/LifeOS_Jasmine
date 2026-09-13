'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');

// A separate backend and disposable directory: never opens the user's real DB.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-backend-test-'));
const fixture = {
    _meta: { app: 'LifeOS' }, tasks: [{ id: 'kept', title: 'Synthetic task' }],
    settings: [
        { key: 'ordinary', value: 'kept' },
        { key: 'contextProjectionKey', value: 'synthetic-secret' },
        { key: 'contextProjectionCache', value: { items: ['synthetic-private'] } },
        { key: 'contextProjectionIdentity', value: 'synthetic-identity' }
    ]
};
const dbFile = path.join(dataDir, 'lifeos-db.json');
fs.writeFileSync(dbFile, JSON.stringify(fixture));
fs.mkdirSync(path.join(dataDir, 'backups'));
const oldBackup = path.join(dataDir, 'backups/lifeos-backup-legacy.json');
fs.writeFileSync(oldBackup, JSON.stringify(fixture));
const child = spawn(process.execPath, [path.join(__dirname, '../server.js')], {
    env: { ...process.env, PORT: '0', LIFEOS_DATA_DIR: dataDir }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
});
let timeout;
function clean(data) {
    assert(!JSON.stringify(data).includes('synthetic-secret'));
    assert(!JSON.stringify(data).includes('synthetic-private'));
    assert(!JSON.stringify(data).includes('synthetic-identity'));
}
(async () => {
    const origin = await new Promise((resolve, reject) => {
        let output = '';
        timeout = setTimeout(() => reject(new Error('Backend start timed out')), 15000);
        child.on('error', reject); child.on('exit', code => reject(new Error('Backend exited: ' + code)));
        child.stdout.on('data', chunk => { output += chunk; const match = output.match(/Server: (http:\/\/localhost:\d+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    async function request(url, method = 'GET', body) {
        const response = await fetch(origin + url, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        assert(response.ok, method + ' ' + url + ' ' + response.status);
        return response.json();
    }
    clean(await request('/api/db')); clean(await request('/api/db/settings'));
    assert(fs.readFileSync(dbFile, 'utf8').includes('synthetic-secret'), 'Read must not rewrite user history');
    await request('/api/db', 'POST', fixture); clean(JSON.parse(fs.readFileSync(dbFile, 'utf8')));
    await request('/api/db', 'PUT', fixture); clean(await request('/api/db'));
    await request('/api/db/settings', 'POST', fixture.settings); clean(await request('/api/db/settings'));
    await request('/api/backups/lifeos-backup-legacy.json/restore', 'POST'); clean(await request('/api/db'));
    assert.equal((await request('/api/db')).tasks[0].id, 'kept');
    assert(fs.readFileSync(oldBackup, 'utf8').includes('synthetic-secret'), 'Existing backup must remain untouched');
    for (const file of fs.readdirSync(path.join(dataDir, 'backups')).filter(name => name !== 'lifeos-backup-legacy.json')) clean(JSON.parse(fs.readFileSync(path.join(dataDir, 'backups', file))));
    for (const url of ['/data/lifeos-db.json', '/DATA/lifeos-db.json', '/data%2flifeos-db.json', '/data/backups/lifeos-backup-legacy.json']) {
        assert.equal((await fetch(origin + url)).status, 404, url);
    }
    assert((await fetch(origin + '/data/food-nutrition.json')).ok, 'Public food dataset remains available');
    console.log('PASS backend reads/writes/restore/new backups exclude private context; static data protected; existing history preserved');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    clearTimeout(timeout);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    // Verify the exact generated temp target before recursive cleanup.
    const resolved = path.resolve(dataDir), tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('lifeos-backend-test-')) throw Error('Unsafe cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
});
