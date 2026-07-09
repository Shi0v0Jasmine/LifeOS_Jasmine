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
