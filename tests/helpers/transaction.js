// Minimal completion-event support for the existing in-memory IDB fixtures.
// Native rollback/durability is tested separately in the browser harness.
module.exports = function transaction(storeNames, stores) {
    let pending = 0, generation = 0;
    const tx = {
        objectStore(name) {
            if (!storeNames.includes(name)) throw new Error(`Store ${name} not in transaction`);
            const store = stores.get(name);
            return new Proxy(store, {
                get(target, property) {
                    const value = target[property];
                    if (typeof value !== 'function') return value;
                    if (!['get', 'getAll', 'put', 'delete', 'clear'].includes(property)) return value.bind(target);
                    return (...args) => {
                        pending++; generation++;
                        const request = value.apply(target, args);
                        let success, failure;
                        Object.defineProperty(request, 'onsuccess', {
                            get: () => event => { try { if (success) success(event); } finally { pending--; finish(); } },
                            set: fn => { success = fn; }, configurable: true
                        });
                        Object.defineProperty(request, 'onerror', {
                            get: () => event => { if (failure) failure(event); pending--; if (tx.onabort) tx.onabort(event); },
                            set: fn => { failure = fn; }, configurable: true
                        });
                        return request;
                    };
                }
            });
        }
    };
    function finish() {
        const current = generation;
        setTimeout(() => { if (!pending && current === generation && tx.oncomplete) tx.oncomplete(); }, 0);
    }
    finish();
    return tx;
};
