// page-route-hook.js - SafeHer Voice MAIN World SPA Route Hook
(function () {
    if (window.__SAFEHER_ROUTE_HOOK_INSTALLED__) {
        return;
    }
    window.__SAFEHER_ROUTE_HOOK_INSTALLED__ = true;

    let lastUrl = window.location.href;

    function notifyLocationChange() {
        try {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                window.dispatchEvent(
                    new CustomEvent("safeher:locationchange", {
                        detail: { url: currentUrl }
                    })
                );
            }
        } catch (e) {}
    }

    try {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            notifyLocationChange();
            return result;
        };

        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            notifyLocationChange();
            return result;
        };

        window.addEventListener("popstate", notifyLocationChange);
    } catch (e) {}
})();
