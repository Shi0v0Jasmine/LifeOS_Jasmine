/**
 * LifeOS Backend Server
 * Serves the app + provides REST API for JSON file persistence
 * Data stored in LifeOS/data/lifeos-db.json
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// An explicit override lets integration tests use disposable synthetic data.
const DATA_DIR = path.resolve(process.env.LIFEOS_DATA_DIR || path.join(__dirname, 'LifeOS', 'data'));
const DB_FILE = path.join(DATA_DIR, 'lifeos-db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));
// Only reference datasets are public. Backups and the persisted DB must never
// bypass the filtered API through Express's static file middleware.
app.use((req, res, next) => {
    let requested;
    try { requested = path.resolve(__dirname, 'LifeOS', '.' + decodeURIComponent(req.path)); }
    catch (error) { return res.sendStatus(400); }
    const dataRoot = path.join(__dirname, 'LifeOS', 'data').toLowerCase();
    const normalized = requested.toLowerCase();
    if (normalized === dataRoot || normalized.startsWith(dataRoot + path.sep)) {
        const publicFiles = ['food-nutrition.json', 'character_dialogue_styles.json'].map(name => path.join(dataRoot, name));
        if (!publicFiles.includes(normalized)) return res.sendStatus(404);
    }
    next();
});
app.use(express.static(path.join(__dirname, 'LifeOS')));

function withoutDeviceContext(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    const copy = { ...data };
    if (Array.isArray(copy.settings)) {
        copy.settings = copy.settings.filter(row => !String(row && row.key || '').startsWith('contextProjection'));
    }
    return copy;
}

function emptyDB() {
    return {
        _meta: { app: 'LifeOS', version: '6.0.1', createdAt: new Date().toISOString() },
        timeline: [], tasks: [], habits: [], habitRecords: [],
        reviews: [], skills: [], notes: [], characters: [],
        settings: [], moments: [], nutrition: []
    };
}

function readDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return withoutDeviceContext(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
        }
    } catch (e) {
        console.error('[LifeOS] Read error:', e.message);
    }
    return null;
}

function writeDB(data) {
    try {
        data = withoutDeviceContext(data);
        data._meta = data._meta || {};
        data._meta.lastSaved = new Date().toISOString();
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[LifeOS] Write error:', e.message);
        return false;
    }
}

function createBackup() {
    try {
        if (!fs.existsSync(DB_FILE)) return;
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupFile = path.join(BACKUP_DIR, 'lifeos-backup-' + ts + '.json');
        // New backup files are filtered even if the previous DB came from v4.
        const previous = readDB();
        if (!previous) return;
        fs.writeFileSync(backupFile, JSON.stringify(previous, null, 2), 'utf8');
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('lifeos-backup-'))
            .sort().reverse();
        for (let i = 20; i < files.length; i++) {
            fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
        }
    } catch (e) {
        console.error('[LifeOS] Backup error:', e.message);
    }
}

// GET /api/db - Full database export
app.get('/api/db', (req, res) => {
    const db = readDB();
    res.json(db || emptyDB());
});

// POST /api/db - Full database overwrite
app.post('/api/db', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid data' });
    }
    createBackup();
    const success = writeDB(data);
    res.json({ success, timestamp: new Date().toISOString() });
});

// PUT /api/db - Merge database (add/update records)
app.put('/api/db', (req, res) => {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Invalid data' });
    }
    let db = readDB() || emptyDB();
    const storeNames = ['timeline','tasks','habits','habitRecords',
                        'reviews','skills','notes','characters','settings','moments','nutrition'];
    for (const store of storeNames) {
        if (!Array.isArray(incoming[store])) continue;
        if (!Array.isArray(db[store])) db[store] = [];
        const keyMap = new Map();
        for (const item of db[store]) {
            const key = item.id || item.key || item.date;
            if (key) keyMap.set(key, item);
        }
        for (const item of incoming[store]) {
            const key = item.id || item.key || item.date;
            if (key) keyMap.set(key, item);
        }
        db[store] = Array.from(keyMap.values());
    }
    createBackup();
    const success = writeDB(db);
    res.json({ success, timestamp: new Date().toISOString() });
});

// GET /api/db/:store - Get single store
app.get('/api/db/:store', (req, res) => {
    const db = readDB();
    const store = req.params.store;
    res.json((db && db[store]) ? db[store] : []);
});

// POST /api/db/:store - Replace single store
app.post('/api/db/:store', (req, res) => {
    const store = req.params.store;
    const data = req.body;
    if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'Expected array' });
    }
    let db = readDB() || emptyDB();
    db[store] = data;
    createBackup();
    const success = writeDB(db);
    res.json({ success, timestamp: new Date().toISOString() });
});

// GET /api/status - Health check
app.get('/api/status', (req, res) => {
    const db = readDB();
    const exists = fs.existsSync(DB_FILE);
    const size = exists ? fs.statSync(DB_FILE).size : 0;
    res.json({
        ok: true,
        dbExists: exists,
        dbSize: size,
        lastSaved: db ? (db._meta && db._meta.lastSaved) || null : null,
        backupCount: fs.existsSync(BACKUP_DIR)
            ? fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('lifeos-backup-')).length
            : 0
    });
});

// POST /api/proxy/ai - Proxy AI requests to avoid CORS
app.post('/api/proxy/ai', async (req, res) => {
    const { endpoint, apiKey, payload } = req.body || {};
    if (!endpoint || !apiKey || !payload) {
        return res.status(400).json({ error: 'Missing endpoint, apiKey or payload' });
    }
    if (!/^https?:\/\//i.test(endpoint)) {
        return res.status(400).json({ error: 'Invalid endpoint URL' });
    }
    try {
        const fetch = (await import('node-fetch')).default;
        const upstreamRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });
        const text = await upstreamRes.text();
        res.status(upstreamRes.status);
        for (const [key, value] of upstreamRes.headers.entries()) {
            if (/^content-(type|length)$/i.test(key)) res.setHeader(key, value);
        }
        res.send(text);
    } catch (err) {
        console.error('[LifeOS] AI proxy error:', err.message);
        res.status(502).json({ error: 'AI proxy failed', message: err.message });
    }
});

// GET /api/backups - List available backups
app.get('/api/backups', (req, res) => {
    if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('lifeos-backup-'))
        .sort().reverse();
    res.json(files.map(f => ({
        name: f,
        size: fs.statSync(path.join(BACKUP_DIR, f)).size,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime
    })));
});

// POST /api/backups/:name/restore - Restore from a backup
app.post('/api/backups/:name/restore', (req, res) => {
    const backupFile = path.join(BACKUP_DIR, req.params.name);
    if (!fs.existsSync(backupFile)) {
        return res.status(404).json({ error: 'Backup not found' });
    }
    try {
        const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        createBackup();
        writeDB(data);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Fallback: serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'LifeOS', 'index.html'));
});

const listener = app.listen(PORT, () => {
    console.log('[LifeOS] Server: http://localhost:' + listener.address().port);
    console.log('[LifeOS] Data: ' + DB_FILE);
    if (!fs.existsSync(DB_FILE)) {
        writeDB(emptyDB());
        console.log('[LifeOS] Initialized empty database');
    }
});
