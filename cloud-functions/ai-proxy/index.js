/**
 * LifeOS ai-proxy — CloudBase 云函数
 *
 * 作用：浏览器直连 https://api.kimi.com 会被 CORS 拦截（Failed to fetch / Load failed），
 * 本函数作为服务端转发层，契约与本机 Express server.js 的 POST /api/proxy/ai 完全一致：
 *   请求：POST { endpoint, apiKey, payload }
 *   响应：透传上游状态码与 body
 * API Key 由客户端每次请求自带，函数不存储任何密钥。
 */
'use strict';

// 允许的来源（按需增删；不在名单内的 Origin 不下发 CORS 头，浏览器会拦截）
const ALLOWED_ORIGINS = [
    'https://lifeos-d5gxoyi3o79a3518c-1456250880.tcloudbaseapp.com',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8000'
];

function corsHeaders(origin) {
    const headers = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
}

function json(statusCode, headers, obj) {
    return {
        statusCode,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers),
        body: JSON.stringify(obj)
    };
}

function parseRequestBody(event, headers) {
    var body = event.body;
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    var raw = String(body || '');
    try {
        return JSON.parse(raw || '{}');
    } catch (jsonError) {
        // CloudBase may Base64-wrap an application/octet-stream request before it
        // reaches the function. Decode only as a fallback so regular JSON keeps
        // its original behavior.
        var contentType = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
        if (event.isBase64Encoded || contentType.indexOf('application/octet-stream') !== -1) {
            return JSON.parse(Buffer.from(raw, 'base64').toString('utf8') || '{}');
        }
        throw jsonError;
    }
}

exports.main = async (event) => {
    const reqHeaders = event.headers || {};
    const origin = reqHeaders.origin || reqHeaders.Origin || '';
    const cors = corsHeaders(origin);

    const method = (event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || 'POST').toUpperCase();

    // 预检请求
    if (method === 'OPTIONS') {
        return { statusCode: 204, headers: cors, body: '' };
    }

    let body;
    try {
        body = parseRequestBody(event, reqHeaders);
    } catch (err) {
        // JSON parser errors can echo request fragments containing credentials.
        return json(400, cors, { error: 'Invalid JSON request body' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json(400, cors, { error: 'Request body must be a JSON object' });
    }
    try {
        const { endpoint, apiKey, payload } = body;

        if (!endpoint || !apiKey || !payload) {
            return json(400, cors, { error: 'Missing endpoint, apiKey or payload' });
        }
        if (!/^https:\/\//i.test(endpoint)) {
            return json(400, cors, { error: 'Endpoint must be https' });
        }

        const upstream = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        const text = await upstream.text();
        return {
            statusCode: upstream.status,
            headers: Object.assign({
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
            }, cors),
            body: text
        };
    } catch (err) {
        return json(502, cors, { error: 'AI proxy failed', message: err.message });
    }
};
