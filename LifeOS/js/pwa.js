(function() {
    'use strict';

    const state = {
        registration: null,
        installPrompt: null,
        supported: false,
        offlineReady: false
    };

    function canRegister() {
        return 'serviceWorker' in navigator &&
            (window.location.protocol === 'http:' || window.location.protocol === 'https:');
    }

    window.addEventListener('beforeinstallprompt', function(event) {
        event.preventDefault();
        state.installPrompt = event;
        state.supported = true;
        window.dispatchEvent(new CustomEvent('lifeos:pwa-installable'));
    });

    window.LifeOSPWA = {
        getState: function() {
            return {
                supported: state.supported,
                offlineReady: state.offlineReady,
                hasInstallPrompt: !!state.installPrompt,
                scope: state.registration ? state.registration.scope : null
            };
        },
        promptInstall: async function() {
            if (!state.installPrompt) return { outcome: 'unavailable' };
            const prompt = state.installPrompt;
            state.installPrompt = null;
            prompt.prompt();
            return prompt.userChoice;
        }
    };

    if (!canRegister()) return;

    // 记录页面加载时是否已有 SW 接管：此后的 controllerchange 才算"版本更新"
    var hadController = !!navigator.serviceWorker.controller;

    function notifyNewVersionReady() {
        try {
            if (window.LifeOS && window.LifeOS.Database && typeof window.LifeOS.Database._showDbBanner === 'function') {
                window.LifeOS.Database._showDbBanner(
                    '新版本已就绪',
                    '应用更新已下载完成。点击「刷新页面」立即使用新版本；继续使用当前页面也不会丢数据。'
                );
            }
        } catch (e) { /* 横幅失败不影响主流程 */ }
    }

    navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (!hadController) {
            // 首次安装后的首次接管，不是版本更新
            hadController = true;
            return;
        }
        console.log('[LifeOS] PWA 新版本已接管，提示用户刷新');
        notifyNewVersionReady();
    });

    // 申请持久化存储：降低浏览器在存储压力下清理 IndexedDB 的风险（iOS 忽略，无害）
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
        try { navigator.storage.persist().catch(function() {}); } catch (e) { /* 静默 */ }
    }

    window.addEventListener('load', function() {
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then(function(registration) {
                state.registration = registration;
                state.supported = true;
                if (navigator.serviceWorker.controller) {
                    state.offlineReady = true;
                }
                console.log('[LifeOS] PWA service worker registered:', registration.scope);
            })
            .catch(function(error) {
                console.warn('[LifeOS] PWA service worker registration failed:', error.message);
            });
    });
})();
