const assert = require('assert');

const proxy = require('../cloud-functions/ai-proxy/index.js');
const originalFetch = global.fetch;

async function withFetch(fn) {
    const calls = [];
    global.fetch = async (url, options) => {
        calls.push({ url, options });
        return {
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => '{"ok":true}'
        };
    };
    try {
        await fn(calls);
    } finally {
        global.fetch = originalFetch;
    }
}

function requestBody() {
    return {
        endpoint: 'https://api.example.com/v1/chat/completions',
        apiKey: 'test-key',
        payload: { model: 'vision-test', messages: [{ role: 'user', content: 'test' }] }
    };
}

async function testJsonRequestStillPassesThrough() {
    await withFetch(async calls => {
        const result = await proxy.main({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody()) });
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer test-key');
    });
}

async function testBinaryRequestDecodesGatewayBase64Body() {
    await withFetch(async calls => {
        const encoded = Buffer.from(JSON.stringify(requestBody()), 'utf8').toString('base64');
        const result = await proxy.main({
            headers: { 'content-type': 'application/octet-stream' },
            isBase64Encoded: true,
            body: encoded
        });
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(JSON.parse(calls[0].options.body).model, 'vision-test');
    });
}

(async () => {
    await testJsonRequestStillPassesThrough();
    console.log('PASS testJsonRequestStillPassesThrough');
    await testBinaryRequestDecodesGatewayBase64Body();
    console.log('PASS testBinaryRequestDecodesGatewayBase64Body');
    await withFetch(async calls => {
        for (const body of [null, 42, [], 'null', '{"apiKey":"must-not-echo" BROKEN', 'invalid-base64']) {
            const result = await proxy.main({ headers: { 'content-type': 'application/octet-stream' }, body });
            assert.strictEqual(result.statusCode, 400);
            assert(!result.body.includes('must-not-echo'));
        }
        assert.strictEqual(calls.length, 0);
    });
    console.log('PASS invalid bodies rejected without echoing credentials');
    await withFetch(async calls => {
        for (const body of [requestBody(), Buffer.from(JSON.stringify(requestBody())), JSON.stringify(requestBody())]) {
            assert.strictEqual((await proxy.main({ headers: { 'content-type': 'application/octet-stream' }, body })).statusCode, 200);
        }
        assert.strictEqual(calls.length, 3);
    });
    console.log('PASS object, Buffer and raw binary JSON compatibility');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
