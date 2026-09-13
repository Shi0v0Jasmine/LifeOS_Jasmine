/* ============================================================
 * LifeOS Context Projection Client
 * 只读取 CloudBase 密文摘要；投影主密钥仅保存在本设备 settings，
 * settings 不参与 LifeOS 同步。原始聊天、文档正文与附件永不在此模块出现。
 * ============================================================ */
(function (root) {
    'use strict';

    var SDK_URLS = [
        'https://static.cloudbase.net/cloudbase-js-sdk/3.6.3/cloudbase.full.js',
        'https://imgcache.qq.com/qcloud/cloudbase-js-sdk/1.7.1/cloudbase.full.js'
    ];
    var KEY_SETTING = 'contextProjectionKey';
    var CACHE_SETTING = 'contextProjectionCache';
    var sdkPromise = null;

    function bytesToBase64Url(bytes) {
        var binary = '';
        for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        var encoded = typeof btoa === 'function'
            ? btoa(binary)
            : Buffer.from(bytes).toString('base64');
        return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function base64UrlToBytes(value) {
        var base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        if (typeof atob === 'function') {
            var binary = atob(base64);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            return bytes;
        }
        return new Uint8Array(Buffer.from(base64, 'base64'));
    }

    function parseRecoveryCode(code) {
        var match = String(code || '').trim().match(/^PC1-([1-9]\d*)-([A-Za-z0-9_-]{43})$/);
        if (!match) throw new Error('Recovery Code 格式应为 PC1-版本-密钥');
        var keyBytes = base64UrlToBytes(match[2]);
        if (keyBytes.length !== 32 || !Number.isSafeInteger(Number(match[1]))) throw new Error('投影密钥或版本无效');
        return { keyVersion: Number(match[1]), key: bytesToBase64Url(keyBytes) };
    }

    function projectionAad(ownerUid, kind, date, keyVersion) {
        return 'personal-context|' + ownerUid + '|' + kind + '|' + date + '|v' + keyVersion;
    }

    async function decryptProjection(record, keyInfo, cryptoProvider) {
        if (!record || record.ownerUid == null || !record.kind || !record.date) {
            throw new Error('投影记录字段不完整');
        }
        if (Number(record.keyVersion) !== Number(keyInfo.keyVersion)) {
            throw new Error('该投影使用了不同版本的密钥');
        }
        var webCrypto = cryptoProvider || root.crypto;
        if (!webCrypto || !webCrypto.subtle) throw new Error('当前浏览器不支持 WebCrypto');
        var key = await webCrypto.subtle.importKey(
            'raw', base64UrlToBytes(keyInfo.key), { name: 'AES-GCM' }, false, ['decrypt']
        );
        var plaintext = await webCrypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: base64UrlToBytes(record.nonce),
                additionalData: new TextEncoder().encode(
                    projectionAad(record.ownerUid, record.kind, record.date, record.keyVersion)
                )
            },
            key,
            base64UrlToBytes(record.ciphertext)
        );
        return JSON.parse(new TextDecoder().decode(plaintext));
    }

    function loadSdk() {
        if (root.cloudbase) return Promise.resolve();
        if (sdkPromise) return sdkPromise;
        sdkPromise = new Promise(function (resolve, reject) {
            function attempt(index) {
                if (index >= SDK_URLS.length) {
                    sdkPromise = null;
                    reject(new Error('CloudBase SDK 加载失败'));
                    return;
                }
                var script = document.createElement('script');
                script.src = SDK_URLS[index];
                script.onload = resolve;
                script.onerror = function () {
                    if (script.parentNode) script.parentNode.removeChild(script);
                    attempt(index + 1);
                };
                document.head.appendChild(script);
            }
            attempt(0);
        });
        return sdkPromise;
    }

    function contextError(code, message) {
        var error = new Error(message); error.code = code; return error;
    }

    function isAccessFailure(error) {
        return /auth|permission|denied|unauthor|401|403/i.test(String(error.code || error.errCode || '') + ' ' + error.message);
    }

    async function getAuthenticatedApp(snapshot) {
        await loadSdk();
        var app = root.cloudbase.init({ env: snapshot.envId });
        var state;
        try {
            state = await app.auth().getLoginState();
        } catch (error) {
            if (isAccessFailure(error)) {
                await root.LifeOS.Database.contextState(snapshot, { contextProjectionCache: null, contextProjectionIdentity: null });
                throw contextError('ACCOUNT_REQUIRED', '账号验证失效，请在设置页重新登录');
            }
            throw error;
        }
        await root.LifeOS.Database.contextState(snapshot);
        if (!state || !state.user || state.user.isAnonymous || state.user.uid !== snapshot.ownerUid) {
            await root.LifeOS.Database.contextState(snapshot, { contextProjectionCache: null, contextProjectionIdentity: null });
            throw contextError('ACCOUNT_REQUIRED', '请先在 LifeOS 设置页登录匹配的 CloudBase 账号');
        }
        return { app: app, user: state.user };
    }

    async function setRecoveryCode(code) {
        var parsed = parseRecoveryCode(code);
        await root.LifeOS.Settings.set(KEY_SETTING, parsed);
        return { keyVersion: parsed.keyVersion };
    }

    async function clearRecoveryCode() {
        await root.LifeOS.Settings.set(KEY_SETTING, null);
        await root.LifeOS.Settings.set(CACHE_SETTING, null);
    }

    async function bindingFor(snapshot) {
        if (!snapshot.keyInfo || !snapshot.keyInfo.key) throw contextError('KEY_REQUIRED', '此设备尚未配置投影 Recovery Code');
        if (!snapshot.envId) throw contextError('ENV_REQUIRED', '请先在设置页配置 CloudBase 环境');
        if (!snapshot.ownerUid || snapshot.provider !== 'cloudbase') throw contextError('ACCOUNT_REQUIRED', '请先在设置页登录 CloudBase 账号');
        var fingerprint = bytesToBase64Url(new Uint8Array(await root.crypto.subtle.digest('SHA-256', base64UrlToBytes(snapshot.keyInfo.key))));
        return { envId: snapshot.envId, ownerUid: snapshot.ownerUid, keyVersion: snapshot.keyInfo.keyVersion, keyFingerprint: fingerprint, revision: snapshot.revision };
    }

    function sameBinding(left, right) {
        return !!left && Object.keys(right).every(function (key) { return left[key] === right[key]; });
    }

    function validatePayload(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('摘要格式无效');
        for (var field of ['actions', 'conversations']) {
            if (payload[field] !== undefined && (!Array.isArray(payload[field]) || payload[field].some(function (item) { return !item || typeof item !== 'object' || Array.isArray(item); }))) {
                throw new Error('摘要列表格式无效');
            }
        }
        if ((payload.conversations || []).some(function (item) { return item.highlights !== undefined && !Array.isArray(item.highlights); })) throw new Error('摘要要点格式无效');
    }

    async function loadCached(snapshot, binding) {
        snapshot = snapshot || await root.LifeOS.Database.contextState();
        binding = binding || await bindingFor(snapshot);
        var current = await root.LifeOS.Database.contextState(snapshot);
        var cached = current.cache;
        if (!sameBinding(current.identity, binding) || !cached || !sameBinding(cached.binding, binding) || !Number.isFinite(Date.parse(cached.cachedAt)) || !Array.isArray(cached.items)) {
            throw contextError('CACHE_UNAVAILABLE', '此账号在本设备没有可验证的离线摘要，请联网刷新');
        }
        return cached;
    }

    async function loadProjections() {
        var db = root.LifeOS.Database;
        var snapshot = await db.contextState();
        var binding = await bindingFor(snapshot);
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            var offlineCache = await loadCached(snapshot, binding);
            return Object.assign({}, offlineCache, { source: 'offline-cache' });
        }
        // Authentication must succeed before a network error may use cached data.
        var auth = await getAuthenticatedApp(snapshot);
        await db.contextState(snapshot, { contextProjectionIdentity: binding });
        var response;
        try {
            response = await auth.app.database()
                .collection('context_projections')
                .where({ ownerUid: auth.user.uid })
                .orderBy('date', 'desc')
                .limit(100)
                .get();
        } catch (error) {
            // Permission/auth failures must not unlock an old summary.
            if (isAccessFailure(error)) {
                await db.contextState(snapshot, { contextProjectionCache: null, contextProjectionIdentity: null });
                throw contextError('ACCOUNT_REQUIRED', '摘要访问权限失效，请重新登录并检查集合权限');
            }
            var cache = await loadCached(snapshot, binding);
            return Object.assign({}, cache, { source: 'stale-cache', warning: '云端暂时不可用，显示最近一次已验证摘要' });
        }
            await db.contextState(snapshot);
            if (!response || !Array.isArray(response.data)) throw contextError('INVALID_RESPONSE', '云端摘要响应格式无效');
            var records = response.data;
            var items = [];
            var failures = [];
            for (var i = 0; i < records.length; i += 1) {
                if (!records[i] || records[i].ownerUid !== snapshot.ownerUid) {
                    await db.contextState(snapshot, { contextProjectionCache: null, contextProjectionIdentity: null });
                    throw contextError('OWNER_MISMATCH', '摘要账号不匹配，请检查集合权限');
                }
                try {
                    var payload = await decryptProjection(records[i], snapshot.keyInfo);
                    validatePayload(payload);
                    items.push({
                        ownerUid: records[i].ownerUid,
                        kind: records[i].kind,
                        date: records[i].date,
                        updatedAt: records[i].updatedAt,
                        keyVersion: records[i].keyVersion,
                        payload: payload
                    });
                } catch (error) {
                    failures.push({ date: records[i].date, kind: records[i].kind, message: '该条摘要解密或格式验证失败' });
                }
            }
            if (records.length && !items.length) {
                await db.contextState(snapshot, { contextProjectionCache: null, contextProjectionIdentity: null });
                var decryptError = new Error('无法解密投影：Recovery Code 错误或密钥已轮换');
                decryptError.code = 'DECRYPT_FAILED';
                throw decryptError;
            }
            var cachedAt = new Date().toISOString();
            var result = { items: items, cachedAt: cachedAt, binding: binding, failures: failures };
            await db.contextState(snapshot, { contextProjectionCache: result });
            await db.contextState(snapshot);
            return Object.assign({}, result, { source: 'cloudbase' });
    }

    var client = {
        parseRecoveryCode: parseRecoveryCode,
        projectionAad: projectionAad,
        decryptProjection: decryptProjection,
        setRecoveryCode: setRecoveryCode,
        clearRecoveryCode: clearRecoveryCode,
        loadProjections: loadProjections,
        loadCached: loadCached
    };

    root.LifeOS = root.LifeOS || {};
    root.LifeOS.ContextClient = client;
    if (typeof module !== 'undefined' && module.exports) module.exports = client;
}(typeof window !== 'undefined' ? window : globalThis));
