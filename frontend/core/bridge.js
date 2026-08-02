// bridge.js
// Giao tiếp giữa content script và background service worker.

function safeSendMessage(payload) {
    try {
        chrome.runtime.sendMessage(payload);
    } catch (error) {
        if (
            error.message &&
            error.message.includes("Extension context invalidated")
        ) {
            console.warn(
                "[SafeHer Voice] Extension was reloaded. Please press F5 to refresh this page."
            );
        }
    }
}

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        // Popup yêu cầu lấy thống kê hiện tại.
        if (request.action === "get_stats") {
            sendResponse(getScannerStats());
            return true;
        }

        // Xử lý khi feedback đã được backend xử lý thành công
        if (request.action === "feedback_processed") {
            console.log("[SafeHer Voice] Feedback processed:", request);
            if (typeof handleFeedbackProcessed === "function") {
                handleFeedbackProcessed(request);
            }
            return false;
        }

        // Xử lý khi feedback bị confirmation_timeout
        if (request.action === "feedback_timeout") {
            console.warn("[SafeHer Voice] Feedback confirmation timeout:", request);
            if (typeof window.handleFeedbackTimeout === "function") {
                window.handleFeedbackTimeout(request);
            }
            return false;
        }

        // Các message còn lại là kết quả phân tích trả về từ backend.
        if (!request.element_id) {
            return false;
        }

        const pendingContext = pendingElementsMap.get(request.element_id);
        const originalText = pendingContext ? (typeof pendingContext === "object" ? pendingContext.text : pendingContext) : (request.text || "");
        const cacheKey = pendingContext && typeof pendingContext === "object" ? pendingContext.cacheKey : originalText;

        // Cleanup toàn bộ fan-out group khi stale hoặc failed
        if (request.status === "failed" || request.status === "stale") {
            console.warn(`[SafeHer Bridge] Scan request ended with status '${request.status}' for element ${request.element_id}`);
            
            const cacheRecord = cacheKey ? scannedTextCache.get(cacheKey) : null;
            const waitingIds = (cacheRecord && Array.isArray(cacheRecord.waitingIds) && cacheRecord.waitingIds.length)
                ? [...cacheRecord.waitingIds]
                : [request.element_id];

            waitingIds.forEach((id) => pendingElementsMap.delete(id));

            if (cacheKey && typeof setScannedTextCache === "function") {
                setScannedTextCache(cacheKey, {
                    status: "stale",
                    staleAt: Date.now()
                });
            }

            const requestKey = request?.request_key || (pendingContext && pendingContext.requestKey) || null;
            if (requestKey) {
                safeSendMessage({
                    action: "cleanup_stale_request",
                    request_key: requestKey
                });
            }
            return false;
        }

        // Chặn Stale Response khi Protection OFF hoặc Session thay đổi
        if (pendingContext && typeof pendingContext === "object") {
            const currentProt = typeof getProtectionSessionId === "function" ? getProtectionSessionId() : null;
            const currentPage = typeof getPageSessionId === "function" ? getPageSessionId() : null;

            const isProtStale = request.protection_session_id && currentProt && request.protection_session_id !== currentProt;
            const isPageStale = request.page_session_id && currentPage && request.page_session_id !== currentPage;
            const isAllowed = typeof isScanningAllowed === "function" ? isScanningAllowed() : true;

            if (isProtStale || isPageStale || !isAllowed) {
                console.warn("[SafeHer Bridge] Ignored stale scan response from old protection/page session.");
                
                const cacheRecord = cacheKey ? scannedTextCache.get(cacheKey) : null;
                const waitingIds = (cacheRecord && Array.isArray(cacheRecord.waitingIds) && cacheRecord.waitingIds.length)
                    ? [...cacheRecord.waitingIds]
                    : [request.element_id];

                waitingIds.forEach((id) => pendingElementsMap.delete(id));

                if (cacheKey && typeof setScannedTextCache === "function") {
                    setScannedTextCache(cacheKey, {
                        status: "stale",
                        staleAt: Date.now()
                    });
                }

                const requestKey = request?.request_key || (pendingContext && pendingContext.requestKey) || null;
                if (requestKey) {
                    safeSendMessage({
                        action: "cleanup_stale_request",
                        request_key: requestKey
                    });
                }
                return false;
            }
        }

        // Fan-out xử lý cho toàn bộ waitingIds
        let elementsToUpdate = [request.element_id];

        if (cacheKey && scannedTextCache.has(cacheKey)) {
            const cacheRecord = scannedTextCache.get(cacheKey);

            if (cacheRecord && cacheRecord.status === "pending" && Array.isArray(cacheRecord.waitingIds)) {
                elementsToUpdate = [...cacheRecord.waitingIds];
            }

            setScannedTextCache(cacheKey, {
                status: "resolved",
                payload: request,
                resolvedAt: Date.now()
            });
        }

        // Ghi nhận thông số kết quả AI thực tế lên tất cả các phần tử DOM tương ứng
        elementsToUpdate.forEach((elementId) => {
            const el = document.querySelector(`[data-aegis-id="${elementId}"]`);
            if (el) {
                el.setAttribute("data-aegis-toxic", request.is_toxic === true ? "true" : "false");
                el.setAttribute("data-aegis-level", request.is_toxic === true ? (request.level || "none") : "none");
                el.setAttribute("data-aegis-action", request.action || "none");
                el.setAttribute("data-aegis-score", request.score || "0");
                el.setAttribute("data-aegis-baseline", typeof request.community_baseline === "number" ? request.community_baseline : "N/A");

                // Nếu is_toxic = false, gỡ hoàn toàn các lớp CSS toxic & badge
                if (request.is_toxic !== true) {
                    el.classList.remove("safeher-highlight-toxic", "safeher-highlight-high", "safeher-highlight-medium", "safeher-highlight-warning");
                    const oldBadges = el.querySelectorAll(".safeher-inline-badge");
                    oldBadges.forEach((b) => b.remove());

                    if (typeof activeAegisId !== "undefined" && activeAegisId === elementId && typeof closeTooltip === "function") {
                        closeTooltip();
                    }
                }
            }
        });

        // ── Cập nhật scanLog với dữ liệu thô từ backend ──────────────────────
        const isToxic = request.is_toxic === true;
        const normalizedSev = getDisplaySeverity(request);
        const metadata = deriveDetectionMetadata(request, originalText || "");

        const logPatch = {
            status: isToxic ? "toxic" : "safe",
            backend_status: request.status || "",
            is_toxic: isToxic,
            level: isToxic ? (request.level || "") : "none",
            severity: normalizedSev,
            score: Number(request.score) || 0,
            action: request.action || "",
            pattern_type: isToxic ? metadata.pattern_type : "safe_content",
            pattern_label: isToxic ? metadata.pattern_label : "Safe Content",
            explanation: isToxic ? metadata.explanation : "No harmful content detected.",
            explanation_source: metadata.explanation_source
        };

        elementsToUpdate.forEach((elementId) => {
            const el = document.querySelector(`[data-aegis-id="${elementId}"]`);
            if (el) {
                if (isToxic) {
                    el.setAttribute("data-aegis-pattern", metadata.pattern_type);
                    el.setAttribute("data-aegis-explanation", metadata.explanation);
                } else {
                    el.removeAttribute("data-aegis-pattern");
                    el.removeAttribute("data-aegis-explanation");
                }
            }

            const result = updateScanLogStatus(elementId, logPatch);

            // Chỉ tăng counter độc hại khi node chuyển từ pending sang resolved lần đầu và is_toxic === true
            if (result.firstResolution && isToxic) {
                incrementToxicNodesFound();
                if (normalizedSev === "high") {
                    incrementHighSeverityCount();
                } else if (normalizedSev === "medium") {
                    incrementMedSeverityCount();
                }
            }
        });

        // ── Lưu / Ghi đè từng element_id vào safeher_recent_scans trong chrome.storage.local ──
        try {
            chrome.storage.local.get("safeher_recent_scans", (res) => {
                let list = Array.isArray(res.safeher_recent_scans) ? res.safeher_recent_scans : [];

                elementsToUpdate.forEach((targetElementId) => {
                    const targetContext = pendingElementsMap.get(targetElementId);
                    const targetText = targetContext && typeof targetContext === "object" ? targetContext.text : (originalText || request.text || "");
                    const targetTimestamp = (targetContext && targetContext.timestamp) || request.timestamp || Date.now();
                    const targetPageSess = (targetContext && targetContext.pageSessionId) || request.page_session_id || "";
                    const targetProtSess = (targetContext && targetContext.protectionSessionId) || request.protection_session_id || "";

                    const existingIndex = list.findIndex((item) => item.element_id === targetElementId);
                    const newEntry = {
                        id: existingIndex >= 0 ? list[existingIndex].id : ("scan-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6)),
                        element_id: targetElementId,
                        tab_id: request.tab_id || 0,
                        tab_name: request.tab_name || document.title || "",
                        page_url: request.page_url || location.href || "",
                        page_session_id: targetPageSess,
                        protection_session_id: targetProtSess,
                        raw_text: targetText,
                        score: Number(request.score) || 0,
                        level: isToxic ? (request.level || "none") : "none",
                        severity: normalizedSev,
                        is_toxic: isToxic,
                        status: isToxic ? "toxic" : "safe",
                        action: request.action || "",
                        pattern_type: isToxic ? metadata.pattern_type : "safe_content",
                        explanation: isToxic ? metadata.explanation : "No harmful content detected.",
                        explanation_source: metadata.explanation_source,
                        timestamp: targetTimestamp
                    };

                    if (existingIndex >= 0) {
                        list[existingIndex] = newEntry;
                    } else {
                        list = [newEntry, ...list];
                    }
                });

                const updatedList = list.slice(0, 150);
                chrome.storage.local.set({ safeher_recent_scans: updatedList }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("[SafeHer Storage Error]:", chrome.runtime.lastError);
                    }
                });
            });
        } catch (e) {
            console.error("[SafeHer Voice] Error saving to safeher_recent_scans:", e);
        }

        // Highlight/blur khi is_toxic là true
        if (isToxic) {
            elementsToUpdate.forEach((elementId) => {
                const toxicElement = document.querySelector(
                    `[data-aegis-id="${elementId}"]`
                );

                if (!toxicElement) {
                    return;
                }

                applyToxicBlockUI(
                    toxicElement,
                    request
                );
            });
        }

        // Cập nhật tooltip lập tức nếu manual scan vừa trả về kết quả thật
        if (typeof activeAegisId !== "undefined" && activeAegisId === request.element_id) {
            if (request.is_toxic) {
                renderTooltipState("ASK", request.element_id);
            } else {
                tooltip.innerHTML = `
                    <div style="text-align: center; padding: 20px; font-weight: 700; color: var(--aegis-accent);">
                        Safe Content Verified.<br>
                        <span style="font-size: 11px; font-weight: 500;">Toxicity Score: ${request.score || 0}%</span>
                    </div>
                `;
                setTimeout(closeTooltip, 2000);
            }
        }

        // Cleanup pendingElementsMap cho toàn bộ waitingIds SAU KHI fan-out hoàn tất
        elementsToUpdate.forEach((elementId) => {
            pendingElementsMap.delete(elementId);
        });

        return false;
    }
);

// ─── HANDLER XỬ LÝ UI RECORD KHI CACHE ĐÃ RESOLVED ─────────────
window.handleScanResponseFromCache = function (payload, elementId, textContent) {
    if (!payload || !elementId) return;

    const isToxic = payload.is_toxic === true;
    const normalizedSev = getDisplaySeverity(payload);
    const metadata = deriveDetectionMetadata(payload, textContent || "");

    const pageSessId = typeof getPageSessionId === "function" ? getPageSessionId() : "";
    const protSessId = typeof getProtectionSessionId === "function" ? getProtectionSessionId() : "";

    const logPatch = {
        status: isToxic ? "toxic" : "safe",
        backend_status: payload.status || "",
        is_toxic: isToxic,
        level: isToxic ? (payload.level || "") : "none",
        severity: normalizedSev,
        score: Number(payload.score) || 0,
        action: payload.action || "",
        pattern_type: isToxic ? metadata.pattern_type : "safe_content",
        pattern_label: isToxic ? metadata.pattern_label : "Safe Content",
        explanation: isToxic ? metadata.explanation : "No harmful content detected.",
        explanation_source: metadata.explanation_source
    };

    updateScanLogStatus(elementId, logPatch);

    try {
        chrome.storage.local.get("safeher_recent_scans", (res) => {
            let list = Array.isArray(res.safeher_recent_scans) ? res.safeher_recent_scans : [];
            const existingIndex = list.findIndex((item) => item.element_id === elementId);

            const newEntry = {
                id: existingIndex >= 0 ? list[existingIndex].id : ("scan-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6)),
                element_id: elementId,
                tab_id: payload.tab_id || 0,
                tab_name: payload.tab_name || document.title || "",
                page_url: location.href || "",
                page_session_id: pageSessId,
                protection_session_id: protSessId,
                raw_text: textContent || payload.text || "",
                score: Number(payload.score) || 0,
                level: isToxic ? (payload.level || "none") : "none",
                severity: normalizedSev,
                is_toxic: isToxic,
                status: isToxic ? "toxic" : "safe",
                action: payload.action || "",
                pattern_type: isToxic ? metadata.pattern_type : "safe_content",
                explanation: isToxic ? metadata.explanation : "No harmful content detected.",
                explanation_source: metadata.explanation_source,
                timestamp: Date.now()
            };

            if (existingIndex >= 0) {
                list[existingIndex] = newEntry;
            } else {
                list = [newEntry, ...list];
            }

            const updatedList = list.slice(0, 100);
            chrome.storage.local.set({ safeher_recent_scans: updatedList });
        });
    } catch (e) {}
};