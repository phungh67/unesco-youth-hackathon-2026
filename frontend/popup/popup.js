// popup.js - SafeHer Voice Dashboard (Phase 4 Final Optimization)

// ─── CONSTANTS & TEMPLATES ───────────────────────────────────────────────────

const REPLY_TEMPLATES = {
    blur: "Please keep this conversation respectful and focused on the issue.",
    review: "Could you please clarify your message or maintain a respectful tone?",
    report: "This comment contains harassing content. Please keep community discussions safe.",
    default: "Please keep this conversation respectful and focused on the issue."
};

// ─── SHARED STATE ─────────────────────────────────────────────────────────────

let currentScanData = {
    recentScans: [],
    highSeverityCount: 0,
    medSeverityCount: 0,
    lowSeverityCount: 0,
    totalScanned: 0,
    toxicFound: 0
};

let activeSelectedComment = null;
let isPrintingCaseFile = false;

// ─── UTILITIES (SAFE HTML ESCAPING) ──────────────────────────────────────────

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message) {
    const toast = document.getElementById("toast-notice");
    if (toast) {
        toast.textContent = message;
        toast.style.display = "block";
        setTimeout(() => {
            toast.style.display = "none";
        }, 2200);
    }
}

function formatTimestamp(ts) {
    if (!ts) return "N/A";
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "N/A";
    return date.toLocaleString();
}

// ─── 1. CONSENT FLOW & MODAL MANAGEMENT ─────────────────────────────────────

function openConsentModal(isReviewing = false) {
    const overlay = document.getElementById("consent-overlay");
    if (overlay) {
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden", "false");
    }

    const agreeBtn = document.getElementById("consent-agree-btn");
    if (agreeBtn) {
        if (isReviewing) {
            agreeBtn.textContent = "Close";
            agreeBtn.onclick = () => closeConsentModal();
        } else {
            agreeBtn.textContent = "I Agree – Enable Protection";
            agreeBtn.onclick = handleConsentAccept;
        }
        agreeBtn.focus();
    }
}

function closeConsentModal() {
    const overlay = document.getElementById("consent-overlay");
    if (overlay) {
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
    }
}

function setupConsentFlow(onConsentGiven) {
    try {
        chrome.storage.local.get(["safeher_consent_given"], (result) => {
            const consentGiven = result ? result.safeher_consent_given === true : false;

            renderConsentState(consentGiven);

            if (consentGiven) {
                closeConsentModal();
                if (typeof onConsentGiven === "function") {
                    onConsentGiven();
                }
            } else {
                openConsentModal(false);
            }
        });
    } catch (e) {
        console.error("[SafeHer Popup] Error reading consent storage:", e);
    }
}

function renderConsentState(consentGiven) {
    const reviewBtn = document.getElementById("btn-review-consent");
    if (reviewBtn) {
        reviewBtn.style.display = consentGiven ? "none" : "inline-block";
    }
}

async function handleConsentAccept() {
    try {
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({
                safeher_consent_given: true,
                safeher_consent_timestamp: Date.now(),
                safeher_protection_enabled: true
            }, () => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                resolve();
            });
        });

        closeConsentModal();
        renderConsentState(true);
        renderProtectionState(true, true);
        loadDashboardData();
    } catch (e) {
        console.error("[SafeHer Popup] Error in handleConsentAccept:", e);
    }
}

async function handleConsentDecline() {
    try {
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({
                safeher_consent_given: false,
                safeher_protection_enabled: false
            }, () => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                resolve();
            });
        });

        await new Promise((resolve) => {
            chrome.storage.local.remove("safeher_consent_timestamp", resolve);
        });

        closeConsentModal();
        renderConsentState(false);
        renderProtectionState(false, false);
    } catch (e) {
        console.error("[SafeHer Popup] Error in handleConsentDecline:", e);
    }
}

// ─── 2. PROTECTION TOGGLE & STATUS RENDER ───────────────────────────────────

function handleProtectionToggle() {
    try {
        chrome.storage.local.get(["safeher_consent_given", "safeher_protection_enabled"], (res) => {
            if (!res || res.safeher_consent_given !== true) {
                openConsentModal(false);
                return;
            }

            const currentProtection = res.safeher_protection_enabled === true;
            const newProtection = !currentProtection;

            chrome.storage.local.set({ safeher_protection_enabled: newProtection }, () => {
                renderProtectionState(true, newProtection);
            });
        });
    } catch (e) {
        console.error("[SafeHer Popup] Error in handleProtectionToggle:", e);
    }
}

function renderProtectionState(consentGiven, protectionEnabled) {
    const toggleBtn = document.getElementById("header-protection-toggle");
    const toggleLabel = document.getElementById("toggle-label");
    const statusText = document.getElementById("header-protection-status");
    const reviewBtn = document.getElementById("btn-review-consent");

    if (!consentGiven) {
        if (toggleBtn) {
            toggleBtn.style.display = "none";
            toggleBtn.disabled = true;
            toggleBtn.className = "protection-disabled";
            toggleBtn.setAttribute("aria-checked", "false");
            toggleBtn.title = "Consent required to enable protection";
        }
        if (toggleLabel) toggleLabel.textContent = "OFF";
        if (reviewBtn) {
            reviewBtn.style.display = "inline-block";
        }
        if (statusText) {
            statusText.style.cursor = "pointer";
            statusText.title = "Click to review consent terms";
            statusText.innerHTML = `<span class="status-dot required"></span>CONSENT REQUIRED`;
        }
        return;
    }

    if (reviewBtn) {
        reviewBtn.style.display = "none";
    }

    if (toggleBtn) {
        toggleBtn.style.display = "flex";
        toggleBtn.disabled = false;
        toggleBtn.className = protectionEnabled ? "protection-on" : "protection-off";
        toggleBtn.setAttribute("aria-checked", protectionEnabled ? "true" : "false");
        toggleBtn.title = protectionEnabled ? "Click to pause protection" : "Click to enable protection";
    }

    if (toggleLabel) {
        toggleLabel.textContent = protectionEnabled ? "ON" : "OFF";
    }

    if (statusText) {
        statusText.style.cursor = "default";
        statusText.title = "";
        if (protectionEnabled) {
            statusText.innerHTML = `<span class="status-dot active"></span>PROTECTION: ACTIVE`;
        } else {
            statusText.innerHTML = `<span class="status-dot paused"></span>PROTECTION: PAUSED`;
        }
    }
}

// ─── 3. WS CONNECTION STATUS ────────────────────────────────────────────────

function updateWsStatus() {
    const wsBadge = document.getElementById("ws-status-badge");
    if (!wsBadge) return;

    try {
        chrome.storage.local.get(["safeher_ws_connected"], (result) => {
            const connected = result ? result.safeher_ws_connected === true : false;
            if (connected) {
                wsBadge.style.display = "none";
            } else {
                wsBadge.textContent = "Service disconnected";
                wsBadge.className = "ws-badge ws-disconnected";
                wsBadge.style.display = "inline-block";
            }
        });
    } catch (e) {
        console.error("[SafeHer Popup] Error in updateWsStatus:", e);
    }
}

// ─── 4. TABS ─────────────────────────────────────────────────────────────────

function setupTabs() {
    const buttons = document.querySelectorAll(".tab-button");
    const views = document.querySelectorAll(".tab-view");

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");

            buttons.forEach((b) => b.classList.remove("active"));
            views.forEach((v) => v.classList.remove("active"));

            btn.classList.add("active");
            const activeView = document.getElementById(`${targetTab}-view`);
            if (activeView) {
                activeView.classList.add("active");
            }
        });
    });
}

// ─── 5. DASHBOARD DATA ───────────────────────────────────────────────────────

function loadDashboardData() {
    updateWsStatus();
    updateStats();
    updateGamifyStats();
    updateEvidenceCount();
}

function updateStats() {
    try {
        chrome.storage.local.get(["safeher_consent_given", "safeher_protection_enabled", "safeher_recent_scans"], (res) => {
            const consentGiven = res ? res.safeher_consent_given === true : false;
            const protectionEnabled = res ? res.safeher_protection_enabled === true : false;

            renderProtectionState(consentGiven, protectionEnabled);

            if (!consentGiven || !protectionEnabled) {
                renderScanSummary([]);
                renderTrendChartFromStorage([]);
                renderFlaggedComments([]);
                return;
            }

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                const activeTabId = activeTab ? activeTab.id : null;

                if (
                    !activeTab ||
                    !activeTab.url ||
                    activeTab.url.startsWith("chrome://") ||
                    activeTab.url.startsWith("edge://") ||
                    activeTab.url.startsWith("about:")
                ) {
                    renderScanSummary([]);
                    renderTrendChartFromStorage([]);
                    renderFlaggedComments([]);
                    return;
                }

                const storedScans = Array.isArray(res.safeher_recent_scans) ? res.safeher_recent_scans : [];

                chrome.tabs.sendMessage(activeTabId, { action: "get_stats" }, (response) => {
                    let runtimeScans = [];
                    if (response && Array.isArray(response.recentScans)) {
                        runtimeScans = response.recentScans;
                    }

                    const combined = [...runtimeScans, ...storedScans];
                    const toxicScans = getProcessedTabScans(combined, activeTabId);

                    currentScanData = {
                        recentScans: toxicScans
                    };

                    renderScanTab(toxicScans);
                });
            });
        });
    } catch (e) {
        console.error("[SafeHer Popup] Error in updateStats:", e);
    }
}

// ─── 6. SEVERITY NORMALIZATION (STANDARDIZED FE HELPER) ────────────────────

function getDisplaySeverity(item) {
    if (!item || item.is_toxic !== true) {
        return "NONE";
    }

    const lvl = String(item.level || item.severity || "").toLowerCase();
    if (lvl === "high" || lvl === "severe") {
        return "HIGH";
    }

    return "MED";
}

function normalizeSeverity(item) {
    return getDisplaySeverity(item);
}

function getProcessedTabScans(scansList, activeTabId) {
    if (!Array.isArray(scansList)) return [];

    const tabFiltered = scansList.filter((item) => {
        if (!item) return false;
        if (item.status === "failed" || item.status === "stale") return false; // Failed/stale records excluded
        if (activeTabId && item.tab_id && Number(item.tab_id) !== Number(activeTabId)) {
            return false;
        }
        return true;
    });

    const dedupedMap = new Map();
    tabFiltered.forEach((item) => {
        const normText = String(item.raw_text || item.text || "").trim().replace(/\s+/g, " ").toLowerCase();
        const key = `${item.tab_id || 0}_${item.element_id || normText}`;

        if (!dedupedMap.has(key)) {
            dedupedMap.set(key, item);
        } else {
            const existing = dedupedMap.get(key);
            const itemTs = Number(item.timestamp) || 0;
            const existingTs = Number(existing.timestamp) || 0;
            if (itemTs >= existingTs) {
                dedupedMap.set(key, item);
            }
        }
    });

    return Array.from(dedupedMap.values()).filter((item) => getDisplaySeverity(item) !== "NONE");
}

// ─── 7. RENDER SCAN TAB & TREND CHART ───────────────────────────────────────

function renderScanTab(toxicScans) {
    const list = toxicScans || [];
    renderScanSummary(list);
    renderTrendChartFromStorage(list);
    renderFlaggedComments(list);
}

function renderScanSummary(toxicScans) {
    const list = toxicScans || [];
    let high = 0;
    let med = 0;

    list.forEach((item) => {
        const sev = getDisplaySeverity(item);
        if (sev === "HIGH") high++;
        else if (sev === "MED") med++;
    });

    const highEl = document.getElementById("summary-high");
    const medEl = document.getElementById("summary-med");
    const lowEl = document.getElementById("summary-low");

    if (highEl) highEl.textContent = high;
    if (medEl) medEl.textContent = med;
    if (lowEl) lowEl.textContent = 0;
}

function renderTrendChartFromStorage(toxicScans) {
    const container = document.getElementById("trend-svg-container");
    if (!container) return;

    const toxicList = (toxicScans || []).filter((item) => getDisplaySeverity(item) !== "NONE");

    if (toxicList.length === 0) {
        container.innerHTML = `<div class="empty-state" style="border:none; padding:10px;">No detection history yet.</div>`;
        return;
    }

    const validItems = toxicList
        .map((item) => ({ ...item, ts: Number(item.timestamp) || Date.now() }))
        .sort((a, b) => a.ts - b.ts);

    const minTs = validItems[0].ts;
    const maxTs = validItems[validItems.length - 1].ts;
    const isSingleDay = (maxTs - minTs) < (24 * 60 * 60 * 1000);

    const bucketsMap = new Map();

    validItems.forEach((item) => {
        const d = new Date(item.ts);
        let timeKey = "";

        if (isSingleDay) {
            const hour = String(d.getHours()).padStart(2, "0");
            timeKey = `${hour}:00`;
        } else {
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const date = String(d.getDate()).padStart(2, "0");
            timeKey = `${month}/${date}`;
        }

        if (!bucketsMap.has(timeKey)) {
            bucketsMap.set(timeKey, { high: 0, med: 0, low: 0 });
        }

        const b = bucketsMap.get(timeKey);
        const sev = getDisplaySeverity(item);
        if (sev === "HIGH") b.high++;
        else if (sev === "MED") b.med++;
    });

    const buckets = Array.from(bucketsMap.entries()).map(([label, counts]) => ({
        label,
        ...counts,
        total: counts.high + counts.med + counts.low
    }));

    if (buckets.length === 0) {
        container.innerHTML = `<div class="empty-state" style="border:none; padding:10px;">No detection history yet.</div>`;
        return;
    }

    const bucketCount = buckets.length;
    const maxVal = Math.max(1, ...buckets.map((b) => b.total));
    const svgWidth = 360;
    const svgHeight = 60;
    const barWidth = Math.max(12, Math.min(28, Math.floor(280 / bucketCount)));
    const gap = Math.max(4, Math.floor((svgWidth - bucketCount * barWidth) / (bucketCount + 1)));

    let barsHTML = "";
    buckets.forEach((b, i) => {
        const x = gap + i * (barWidth + gap);
        const totalHeight = Math.max(4, (b.total / maxVal) * (svgHeight - 14));

        const hHigh = (b.high / (b.total || 1)) * totalHeight;
        const hMed = (b.med / (b.total || 1)) * totalHeight;

        let y = svgHeight - 12 - totalHeight;

        if (hHigh > 0) {
            barsHTML += `<rect x="${x}" y="${y}" width="${barWidth}" height="${hHigh}" fill="#E60018" rx="2" />`;
            y += hHigh;
        }
        if (hMed > 0) {
            barsHTML += `<rect x="${x}" y="${y}" width="${barWidth}" height="${hMed}" fill="#D66A00" rx="2" />`;
        }

        barsHTML += `<text x="${x + barWidth / 2}" y="${svgHeight - 1}" font-size="8" fill="#747474" text-anchor="middle" font-weight="600">${escapeHtml(b.label)}</text>`;
    });

    container.innerHTML = `
        <svg width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" style="overflow:visible;">
          <line x1="0" y1="${svgHeight - 12}" x2="${svgWidth}" y2="${svgHeight - 12}" stroke="#D8DEE5" stroke-width="1" />
          ${barsHTML}
        </svg>
    `;
}

function renderFlaggedComments(toxicScans) {
    const container = document.getElementById("flagged-comments-list");
    if (!container) return;

    const toxicItems = (toxicScans || []).filter((item) => getDisplaySeverity(item) !== "NONE");

    if (toxicItems.length === 0) {
        container.innerHTML = `<div class="empty-state">No harmful patterns detected on this page.</div>`;
        const astCard = document.getElementById("assistant-preview-card");
        if (astCard) astCard.style.display = "none";
        return;
    }

    const fragment = document.createDocumentFragment();

    toxicItems.forEach((item, idx) => {
        const normalized = normalizeSeverity(item);
        let badgeClass = "high";
        if (normalized === "MED" || normalized === "MEDIUM") badgeClass = "med";

        const authorName = item.author || "@flagged_content";

        const card = document.createElement("div");
        card.className = `comment-card ${activeSelectedComment === item.element_id ? "selected" : ""}`;
        card.setAttribute("data-id", item.element_id || String(idx));

        const cardHeader = document.createElement("div");
        cardHeader.className = "comment-card-header";

        const authorDiv = document.createElement("div");
        authorDiv.className = "comment-author";
        authorDiv.innerHTML = `<span class="author-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>`;
        const authorText = document.createTextNode(authorName);
        authorDiv.appendChild(authorText);

        const badgeSpan = document.createElement("span");
        badgeSpan.className = `severity-badge ${badgeClass}`;
        badgeSpan.textContent = normalized;

        cardHeader.appendChild(authorDiv);
        cardHeader.appendChild(badgeSpan);

        const textDiv = document.createElement("div");
        textDiv.className = "comment-text";
        textDiv.textContent = item.raw_text || item.text || "";

        card.appendChild(cardHeader);
        card.appendChild(textDiv);

        card.addEventListener("click", () => {
            const allCards = container.querySelectorAll(".comment-card");
            allCards.forEach((c) => c.classList.remove("selected"));
            card.classList.add("selected");
            activeSelectedComment = item.element_id;
            showAssistantPreview(item);
        });

        fragment.appendChild(card);
    });

    container.replaceChildren(fragment);

    if (toxicItems.length > 0 && !activeSelectedComment) {
        const firstCard = container.querySelector(".comment-card");
        if (firstCard) firstCard.classList.add("selected");
        activeSelectedComment = toxicItems[0].element_id;
        showAssistantPreview(toxicItems[0]);
    }
}

function showAssistantPreview(item) {
    const card = document.getElementById("assistant-preview-card");
    if (!card) return;

    card.style.display = "block";

    const normalized = normalizeSeverity(item);
    const patternTitle = normalized === "HIGH" ? "High-risk harassment pattern" : "Potential harmful content";

    const patternEl = document.getElementById("ast-detected-pattern");
    const explanationEl = document.getElementById("ast-explanation");
    const replyEl = document.getElementById("ast-suggested-reply");

    if (patternEl) patternEl.textContent = patternTitle;
    if (explanationEl) {
        explanationEl.textContent = item.explanation || "Potentially harmful or inappropriate content pattern detected on page.";
    }

    const actionKey = (item.action || "default").toLowerCase();
    const suggestedReply = REPLY_TEMPLATES[actionKey] || REPLY_TEMPLATES.default;

    if (replyEl) replyEl.textContent = `"${suggestedReply}"`;
}

// ─── 8. GAMIFICATION & USER PROFILE STATS ────────────────────────────────────

function updateGamifyStats() {
    try {
        chrome.storage.local.get(
            ["total_points", "daily_points_progress", "daily_cap", "current_rank", "unlocked_badges", "safeher_activity_log"],
            (data) => {
                const totalPoints = Number.isFinite(Number(data?.total_points)) ? Number(data.total_points) : null;
                const dailyProgress = Math.max(0, Number(data?.daily_points_progress) || 0);
                const dailyCap = Math.max(1, Number(data?.daily_cap) || 500);
                const currentRank = (data && data.current_rank) || null;
                const unlockedBadges = Array.isArray(data?.unlocked_badges) ? data.unlocked_badges : [];

                renderProfileTab({
                    ...(data || {}),
                    totalPoints,
                    dailyProgress,
                    dailyCap,
                    currentRank,
                    unlockedBadges
                });

                renderRewardsTab({
                    ...(data || {}),
                    totalPoints
                });
            }
        );
    } catch (e) {
        console.error("[SafeHer Popup] Error in updateGamifyStats:", e);
    }
}

function renderProfileTab(data) {
    const totalPoints = data.totalPoints;
    const currentRank = data.currentRank;

    const levelLbl = document.getElementById("profile-level-label");
    const pointsVal = document.getElementById("profile-points-val");
    const nextLevelSub = document.getElementById("profile-next-level-sub");

    if (totalPoints === null && !currentRank) {
        if (levelLbl) levelLbl.textContent = "RANK: UNVERIFIED";
        if (pointsVal) pointsVal.textContent = "0";
        if (nextLevelSub) nextLevelSub.textContent = "No backend profile data received yet.";
    } else {
        if (levelLbl) levelLbl.textContent = `RANK: ${escapeHtml(currentRank || "Rookie Scout").toUpperCase()}`;
        if (pointsVal) pointsVal.textContent = totalPoints ?? 0;
        const dailyProgress = data.dailyProgress ?? 0;
        const dailyCap = data.dailyCap ?? 500;
        const ptsRemaining = Math.max(0, dailyCap - dailyProgress);
        if (nextLevelSub) nextLevelSub.textContent = `${ptsRemaining} pts remaining in today's reward cap`;
    }

    // Render Achievement Badges
    const badgesHeader = document.getElementById("achievement-badges-header");
    const badgesContainer = document.getElementById("achievement-badges-list");

    const unlocked = data.unlockedBadges || [];
    if (badgesContainer && badgesHeader) {
        if (unlocked.length > 0) {
            badgesHeader.style.display = "block";
            badgesContainer.style.display = "flex";
            const fragment = document.createDocumentFragment();

            unlocked.forEach((badge) => {
                const item = document.createElement("div");
                item.className = "badge-item unlocked";
                item.textContent = badge;
                fragment.appendChild(item);
            });

            badgesContainer.replaceChildren(fragment);
        } else {
            badgesHeader.style.display = "none";
            badgesContainer.style.display = "none";
        }
    }
}

// Frontend-only rewards preview. Redemption is not supported by the current backend.
const REWARD_CATALOGUE = [
    {
        id: "bronze-shield",
        title: "Bronze Shield Badge",
        cost: "100 pts",
        iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
    },
    {
        id: "silver-voice",
        title: "Silver Voice Badge",
        cost: "300 pts",
        iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15l-2 5l3 -1.5l3 1.5l-2 -5"></path><circle cx="12" cy="9" r="6"></circle></svg>`
    },
    {
        id: "mil-foundations",
        title: "MIL Foundations Cert.",
        cost: "500 pts",
        iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
    },
    {
        id: "community-ambassador",
        title: "Community Ambassador",
        cost: "1000 pts",
        iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`
    }
];

function renderRewardsTab(data) {
    const totalPoints = data.totalPoints;
    const balanceValEl = document.getElementById("rewards-balance-val");
    if (balanceValEl) {
        if (totalPoints === null) {
            balanceValEl.textContent = "—";
        } else {
            balanceValEl.textContent = `${totalPoints} pts`;
        }
    }

    const catalogContainer = document.getElementById("rewards-catalog-list");
    if (!catalogContainer) return;

    const fragment = document.createDocumentFragment();

    REWARD_CATALOGUE.forEach((reward) => {
        const card = document.createElement("div");
        card.className = "reward-card locked";

        const iconContainer = document.createElement("div");
        iconContainer.className = "reward-icon";
        iconContainer.innerHTML = reward.iconSvg;

        const infoDiv = document.createElement("div");
        infoDiv.className = "reward-info";

        const titleDiv = document.createElement("div");
        titleDiv.className = "reward-name";
        titleDiv.textContent = reward.title;

        const costDiv = document.createElement("div");
        costDiv.className = "reward-cost";
        costDiv.textContent = reward.cost;

        infoDiv.appendChild(titleDiv);
        infoDiv.appendChild(costDiv);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "reward-btn reward-btn-locked";
        btn.disabled = true;
        btn.title = "Reward redemption is not supported by the current backend.";
        btn.textContent = "Coming soon";

        card.appendChild(iconContainer);
        card.appendChild(infoDiv);
        card.appendChild(btn);

        fragment.appendChild(card);
    });

    catalogContainer.replaceChildren(fragment);
}

// ─── 9. CASE FILE & EVIDENCE MANAGER ─────────────────────────────────────────

function updateEvidenceCount() {
    chrome.storage.local.get("safeher_evidence_items", (res) => {
        const list = Array.isArray(res.safeher_evidence_items) ? res.safeher_evidence_items : [];
        const countEl = document.getElementById("evidence-count-val");
        if (countEl) {
            countEl.textContent = `${list.length} item${list.length === 1 ? "" : "s"} saved`;
        }
    });
}

function openEvidenceModal() {
    const overlay = document.getElementById("evidence-modal-overlay");
    if (overlay) {
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden", "false");
        const modal = overlay.querySelector(".evidence-modal");
        if (modal) modal.focus();
    }
    renderEvidenceList();
}

function closeEvidenceModal() {
    const overlay = document.getElementById("evidence-modal-overlay");
    if (overlay) {
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
    }
    const viewEvBtn = document.getElementById("btn-view-evidence-modal");
    if (viewEvBtn) viewEvBtn.focus();
}

function renderEvidenceList() {
    const listContainer = document.getElementById("evidence-modal-list");
    if (!listContainer) return;

    chrome.storage.local.get("safeher_evidence_items", (res) => {
        const list = Array.isArray(res.safeher_evidence_items) ? res.safeher_evidence_items : [];

        if (list.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">No evidence saved to Case File yet.</div>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        list.forEach((item, idx) => {
            const sevUpper = (item.severity || "warning").toUpperCase();
            let badgeClass = "high";
            if (sevUpper === "MEDIUM" || sevUpper === "MED") badgeClass = "med";

            const card = document.createElement("div");
            card.className = "comment-card";
            card.style.cssText = "cursor:default; position:relative;";

            const cardHeader = document.createElement("div");
            cardHeader.className = "comment-card-header";

            const authorDiv = document.createElement("div");
            authorDiv.className = "comment-author";

            const badgeSpan = document.createElement("span");
            badgeSpan.className = `severity-badge ${badgeClass}`;
            badgeSpan.textContent = sevUpper;

            const labelSpan = document.createElement("span");
            labelSpan.style.cssText = "font-size:11px; font-weight:700; color:var(--sh-navy); margin-left:6px;";
            labelSpan.textContent = item.pattern_label || item.pattern_type || "Evidence";

            authorDiv.appendChild(badgeSpan);
            authorDiv.appendChild(labelSpan);

            const delBtn = document.createElement("button");
            delBtn.className = "btn-delete-evidence";
            delBtn.style.cssText = "background:none; border:none; color:var(--sh-high); font-size:14px; font-weight:800; cursor:pointer;";
            delBtn.title = "Delete evidence";
            delBtn.setAttribute("aria-label", "Delete evidence item");
            delBtn.textContent = "×";

            delBtn.onclick = () => {
                if (confirm("Delete this evidence record?")) {
                    list.splice(idx, 1);
                    chrome.storage.local.set({ safeher_evidence_items: list }, () => {
                        renderEvidenceList();
                        updateEvidenceCount();
                        showToast("Evidence item removed.");
                    });
                }
            };

            cardHeader.appendChild(authorDiv);
            cardHeader.appendChild(delBtn);

            const textDiv = document.createElement("div");
            textDiv.className = "comment-text";
            textDiv.style.cssText = "font-size:11px; line-height:1.4;";
            textDiv.textContent = `"${item.raw_text || ""}"`;

            const subDiv = document.createElement("div");
            subDiv.className = "comment-subtext";
            subDiv.style.cssText = "font-size:9px; margin-top:4px;";
            subDiv.textContent = `Page: ${item.tab_name || "Web Page"} | ${formatTimestamp(item.timestamp)}`;

            card.appendChild(cardHeader);
            card.appendChild(textDiv);
            card.appendChild(subDiv);

            fragment.appendChild(card);
        });

        listContainer.replaceChildren(fragment);
    });
}

function exportCaseFile() {
    if (isPrintingCaseFile) return;
    isPrintingCaseFile = true;

    chrome.storage.local.get("safeher_evidence_items", (res) => {
        const list = Array.isArray(res.safeher_evidence_items) ? res.safeher_evidence_items : [];

        if (list.length === 0) {
            isPrintingCaseFile = false;
            showToast("No evidence items available to export.");
            return;
        }

        const exportTime = escapeHtml(new Date().toLocaleString());

        const evidenceRows = list
            .map(
                (item, i) => `
          <tr style="border-bottom: 1px solid #D8DEE5;">
            <td style="padding: 8px; font-weight: 700;">${i + 1}</td>
            <td style="padding: 8px; overflow-wrap: anywhere;">"${escapeHtml(item.raw_text)}"</td>
            <td style="padding: 8px; font-weight: 700; color: ${item.severity === "high" ? "#E60018" : "#D66A00"};">${escapeHtml((item.severity || "").toUpperCase())}</td>
            <td style="padding: 8px;">${escapeHtml(item.pattern_label || item.pattern_type || "")}</td>
            <td style="padding: 8px; font-size: 10px;">${escapeHtml(item.tab_name)}<br><span style="color:#747474; overflow-wrap: anywhere;">${escapeHtml(item.source_url || "")}</span></td>
            <td style="padding: 8px; font-size: 10px;">${escapeHtml(formatTimestamp(item.timestamp))}</td>
          </tr>
        `
            )
            .join("");

        const printHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>SafeHer Voice Case File Export</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #292929; }
          h1 { color: #174B73; font-size: 20px; margin-bottom: 4px; }
          .sub { color: #747474; font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
          th { background: #174B73; color: #FFFFFF; padding: 8px; font-size: 11px; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          .footer { margin-top: 30px; font-size: 10px; color: #747474; font-style: italic; border-top: 1px solid #D8DEE5; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>SafeHer Voice Case File Export</h1>
        <div class="sub">Exported on ${exportTime} | Total Evidence Items: ${list.length}</div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Flagged Text Content</th>
              <th>Severity</th>
              <th>Pattern Type</th>
              <th>Source / Page</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${evidenceRows}
          </tbody>
        </table>

        <div class="footer">
          Disclaimer: This Case File contains user-selected evidence saved locally on device. Generated by SafeHer Voice AI Content Protection.
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

        const printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write(printHTML);
            printWindow.document.close();
        } else {
            showToast("Please allow popups to export Case File.");
        }

        setTimeout(() => {
            isPrintingCaseFile = false;
        }, 3000);
    });
}

// ─── 10. SETUP EVENT LISTENERS & ACTIONS ────────────────────────────────────

function setupPopupActions() {
    const agreeBtn = document.getElementById("consent-agree-btn");
    if (agreeBtn) {
        agreeBtn.onclick = handleConsentAccept;
    }

    const declineBtn = document.getElementById("consent-decline-btn");
    if (declineBtn) {
        declineBtn.onclick = handleConsentDecline;
    }

    const toggleBtn = document.getElementById("header-protection-toggle");
    if (toggleBtn) {
        toggleBtn.onclick = handleProtectionToggle;
    }

    const statusText = document.getElementById("header-protection-status");
    if (statusText) {
        statusText.onclick = () => {
            try {
                chrome.storage.local.get(["safeher_consent_given"], (res) => {
                    const consentGiven = res ? res.safeher_consent_given === true : false;
                    openConsentModal(consentGiven);
                });
            } catch (e) {}
        };
    }

    const reviewBtn = document.getElementById("btn-review-consent");
    if (reviewBtn) {
        reviewBtn.onclick = () => {
            try {
                chrome.storage.local.get(["safeher_consent_given"], (res) => {
                    const consentGiven = res ? res.safeher_consent_given === true : false;
                    openConsentModal(consentGiven);
                });
            } catch (e) {}
        };
    }

    const closeAstBtn = document.getElementById("btn-close-assistant");
    if (closeAstBtn) {
        closeAstBtn.onclick = () => {
            const astCard = document.getElementById("assistant-preview-card");
            if (astCard) astCard.style.display = "none";
        };
    }

    const astIgnoreBtn = document.getElementById("ast-btn-ignore");
    if (astIgnoreBtn) {
        astIgnoreBtn.onclick = () => {
            const astCard = document.getElementById("assistant-preview-card");
            if (astCard) astCard.style.display = "none";
        };
    }

    const astReplyBtn = document.getElementById("ast-btn-reply");
    if (astReplyBtn) {
        astReplyBtn.onclick = () => {
            const replyBox = document.getElementById("ast-suggested-reply");
            if (replyBox) {
                const textToCopy = replyBox.textContent.replace(/^"|"$/g, "").trim();
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast("Reply script copied to clipboard!");
                }).catch(() => {
                    showToast("Copied script to clipboard!");
                });
            }
        };
    }

    const astReportBtn = document.getElementById("ast-btn-report");
    if (astReportBtn) {
        astReportBtn.onclick = () => {
            showToast("Please use the platform's report option to complete report.");
        };
    }

    const viewEvBtn = document.getElementById("btn-view-evidence-modal");
    if (viewEvBtn) {
        viewEvBtn.onclick = openEvidenceModal;
    }

    const closeEvBtn = document.getElementById("btn-close-evidence-modal");
    if (closeEvBtn) {
        closeEvBtn.onclick = closeEvidenceModal;
    }

    const clearEvBtn = document.getElementById("btn-clear-evidence");
    if (clearEvBtn) {
        clearEvBtn.onclick = () => {
            if (confirm("Are you sure you want to clear all saved evidence items from your Case File?")) {
                chrome.storage.local.set({ safeher_evidence_items: [] }, () => {
                    renderEvidenceList();
                    updateEvidenceCount();
                    showToast("Case File evidence cleared.");
                });
            }
        };
    }

    const exportEvBtn = document.getElementById("btn-export-casefile");
    if (exportEvBtn) {
        exportEvBtn.onclick = exportCaseFile;
    }

    // Keyboard Escape listener for modals
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const evOverlay = document.getElementById("evidence-modal-overlay");
            if (evOverlay && evOverlay.style.display !== "none") {
                closeEvidenceModal();
            }
        }
    });
}

// ─── 11. STORAGE LISTENER ────────────────────────────────────────────────────

function setupStorageListener() {
    try {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== "local") return;

            if (changes.safeher_ws_connected) {
                updateWsStatus();
            }

            if (changes.safeher_consent_given || changes.safeher_protection_enabled) {
                chrome.storage.local.get(["safeher_consent_given", "safeher_protection_enabled"], (res) => {
                    const consentGiven = res ? res.safeher_consent_given === true : false;
                    const protectionEnabled = res ? res.safeher_protection_enabled === true : false;
                    renderProtectionState(consentGiven, protectionEnabled);
                });
            }

            if (changes.safeher_recent_scans) {
                renderTrendChartFromStorage();
            }

            if (changes.safeher_evidence_items) {
                updateEvidenceCount();
            }

            if (
                changes.total_points ||
                changes.current_rank ||
                changes.unlocked_badges ||
                changes.safeher_activity_log
            ) {
                updateGamifyStats();
            }
        });
    } catch (e) {}
}

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    setupPopupActions();
    setupStorageListener();

    setupConsentFlow(() => {
        loadDashboardData();
        setInterval(updateStats, 2000);
        setInterval(updateWsStatus, 5000);
    });
});