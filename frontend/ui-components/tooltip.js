// tooltip.js - SafeHer Assistant In-Page Interaction Component

const tooltip = document.createElement("div");
tooltip.id = "aegis-feedback-tooltip";
tooltip.setAttribute("role", "dialog");
tooltip.setAttribute("aria-label", "SafeHer Assistant");
document.body.appendChild(tooltip);

let activeAegisId = null;
let selectedText = "";
let isFeedbackSubmitting = false;

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const LITERACY_REPLIES = {
    body_shaming: "My appearance is not up for public debate. Please keep your comments respectful.",
    direct_insult: "Please address the topic without making personal attacks.",
    misinformation: "Could you share a reliable source for this claim before others spread it?",
    harassment: "Please keep this conversation respectful and focused on the issue.",
    default: "Please keep this conversation respectful and focused on the issue."
};

// Keyboard Escape listener to close tooltip
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tooltip.style.display !== "none") {
        closeTooltip();
    }
});

function openTooltipSmart(targetRect) {
    tooltip.style.display = "block";
    tooltip.classList.remove("aegis-tooltip-in");

    const tooltipWidth = tooltip.offsetWidth || 360;
    const tooltipHeight = tooltip.offsetHeight || 300;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let x = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    let y = targetRect.bottom + 12;

    if (x + tooltipWidth > screenWidth - 16) {
        x = screenWidth - tooltipWidth - 16;
    }
    if (x < 16) {
        x = 16;
    }

    if (y + tooltipHeight > screenHeight - 16) {
        const yAbove = targetRect.top - tooltipHeight - 12;
        if (yAbove >= 16) {
            y = yAbove;
        } else {
            y = Math.max(16, screenHeight - tooltipHeight - 16);
        }
    }

    tooltip.style.left = `${x + window.scrollX}px`;
    tooltip.style.top = `${y + window.scrollY}px`;

    void tooltip.offsetWidth;
    tooltip.classList.add("aegis-tooltip-in");
}

function closeTooltip() {
    tooltip.style.display = "none";
    activeAegisId = null;
    isFeedbackSubmitting = false;
}

function submitFeedbackFlow(elementId, youthSeverityScore, userAction, justification, optIn) {
    if (isFeedbackSubmitting) return;
    isFeedbackSubmitting = true;

    const el = document.querySelector(`[data-aegis-id="${elementId}"]`);
    if (!el) {
        isFeedbackSubmitting = false;
        return;
    }

    const rawText = el.innerText || el.textContent || "";
    const aiScoreStr = el.getAttribute("data-aegis-score") || "0";
    const aiToxicityScore = parseFloat(aiScoreStr) / 100.0;
    const baselineAttr = el.getAttribute("data-aegis-baseline");

    const communityBaseline = (baselineAttr && baselineAttr !== "N/A" && !isNaN(parseFloat(baselineAttr))) ? parseFloat(baselineAttr) : null;

    const youthSevText = youthSeverityScore >= 75 ? "high" : (youthSeverityScore >= 50 ? "medium" : "low");

    try {
        chrome.storage.local.get("safeher_feedback_history", (res) => {
            const list = Array.isArray(res.safeher_feedback_history) ? res.safeher_feedback_history : [];
            const newFeedback = {
                id: "fb-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6),
                element_id: elementId,
                raw_text: rawText,
                ai_toxicity_score: aiToxicityScore,
                youth_severity: youthSevText,
                youth_severity_score: youthSeverityScore,
                written_justification: justification || "",
                timestamp: Date.now(),
                status: "submitted"
            };
            const updated = [newFeedback, ...list].slice(0, 100);
            chrome.storage.local.set({ safeher_feedback_history: updated });
        });
    } catch (e) {
        console.error("[SafeHer Voice] Error saving feedback history:", e);
    }

    chrome.storage.local.get("user_id", (res) => {
        let userId = res.user_id;
        if (!userId) {
            userId = "usr-" + Math.random().toString(36).substr(2, 9) + "-" + Math.random().toString(36).substr(2, 9);
            chrome.storage.local.set({ user_id: userId });
        }

        tooltip.innerHTML = `
            <div style="text-align: center; padding: 24px; font-weight: 700; color: #174B73; font-size: 13px;">
                Submitting feedback to SafeHer network...
            </div>
        `;

        safeSendMessage({
            action: "submit_feedback",
            user_id: userId,
            element_id: elementId,
            raw_text: rawText,
            ai_toxicity_score: aiToxicityScore,
            youth_severity_score: youthSeverityScore,
            community_baseline: communityBaseline,
            opt_in: optIn,
            page_session_id: typeof getPageSessionId === "function" ? getPageSessionId() : "",
            protection_session_id: typeof getProtectionSessionId === "function" ? getProtectionSessionId() : ""
        });
    });
}

// Trung tính khi confirmation timeout
window.handleFeedbackTimeout = function (request) {
    isFeedbackSubmitting = false;
    if (activeAegisId === request.element_id || !activeAegisId) {
        tooltip.innerHTML = `
            <div style="text-align: center; padding: 18px; font-size: 12px; color: #374151;">
                <div style="font-weight: 700; color: #D97706; margin-bottom: 6px;">Confirmation Pending</div>
                Confirmation was not received. The feedback may still have been processed.
            </div>
        `;
        setTimeout(closeTooltip, 3000);
    }
};

function handleFeedbackProcessed(response) {
    isFeedbackSubmitting = false;

    if (response.data && response.data.action_results) {
        const results = response.data.action_results;
        const ustate = response.data.user_state || {};

        let badgesAwardedText = "";
        if (response.data.new_unlocks && response.data.new_unlocks.badges_awarded_now && response.data.new_unlocks.badges_awarded_now.length > 0) {
            const safeBadges = response.data.new_unlocks.badges_awarded_now.map(escapeHtml).join(", ");
            badgesAwardedText = `<div style="color: #10B981; margin-top: 4px; font-weight: 700;">🏆 Badges Unlocked: ${safeBadges}!</div>`;
        }

        let rankUpText = "";
        if (response.data.new_unlocks && response.data.new_unlocks.rank_up) {
            rankUpText = `<div style="color: #174B73; margin-top: 4px; font-weight: 700;">⭐ Rank Up! You are now a ${escapeHtml(ustate.current_rank || "Scout")}!</div>`;
        }

        tooltip.innerHTML = `
            <div style="padding: 18px; text-align: center; font-size: 12px; color: #292929;">
                <div style="font-weight: 800; color: #10B981; font-size: 15px; margin-bottom: 8px;">Feedback Processed!</div>
                <div style="margin-bottom: 4px;">Points Earned: <strong>+${Number(results.points_earned_this_round || 0)} pts</strong></div>
                <div style="margin-bottom: 4px;">Total Points: <strong>${Number(ustate.total_points || 0)} pts</strong></div>
                <div style="margin-bottom: 4px;">Classification: <i>${escapeHtml(results.classification_tier || "Processed")}</i></div>
                ${badgesAwardedText}
                ${rankUpText}
                <button class="safeher-btn safeher-btn-primary" id="aegis-btn-close-success" style="width: 100%; margin-top: 14px;">Great!</button>
            </div>
        `;
        const closeBtn = document.getElementById("aegis-btn-close-success");
        if (closeBtn) closeBtn.onclick = closeTooltip;
    } else {
        tooltip.innerHTML = `
            <div style="text-align: center; padding: 20px; font-weight: 700; color: #174B73;">
                Feedback Logged Successfully.
            </div>
        `;
        setTimeout(closeTooltip, 1800);
    }
}

// Evidence Dedupe key (${tab_id}:${page_session_id}:${element_id}) và quản lý an toàn
function saveEvidenceItem(elementId) {
    const el = document.querySelector(`[data-aegis-id="${elementId}"]`);
    if (!el) return;

    const rawText = el.innerText || el.textContent || "";
    const aiLevel = el.getAttribute("data-aegis-level") || "warning";
    const aiScoreStr = el.getAttribute("data-aegis-score") || "0";
    const score = Number(aiScoreStr) || 0;
    const isToxic = el.getAttribute("data-aegis-toxic") === "true";
    const severity = normalizeSeverity({ is_toxic: isToxic, level: aiLevel, score: score });
    const metadata = deriveDetectionMetadata({ level: aiLevel, score: score, is_toxic: isToxic }, rawText);

    const pageSessId = typeof getPageSessionId === "function" ? getPageSessionId() : "";
    const timestamp = Date.now();

    try {
        chrome.storage.local.get("safeher_evidence_items", (res) => {
            const list = Array.isArray(res.safeher_evidence_items) ? res.safeher_evidence_items : [];

            // Anti-duplicate check theo key (tab_id + pageSessionId + element_id)
            const exists = list.some((item) => item.element_id === elementId && item.page_session_id === pageSessId);

            if (exists) {
                showInlineToast("Item already saved to Evidence Case File.");
                const evBtn = document.getElementById("aegis-btn-save-evidence");
                if (evBtn) evBtn.textContent = "Evidence saved";
                return;
            }

            const newEvidence = {
                id: "ev-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6),
                element_id: elementId,
                tab_id: 0,
                tab_name: document.title || "Web Page",
                page_session_id: pageSessId,
                raw_text: rawText,
                severity: severity,
                score: score,
                pattern_type: metadata.pattern_type,
                pattern_label: metadata.pattern_label,
                explanation: metadata.explanation,
                timestamp: timestamp,
                source_url: window.location.href
            };

            const updated = [newEvidence, ...list].slice(0, 100);
            chrome.storage.local.set({ safeher_evidence_items: updated }, () => {
                if (chrome.runtime.lastError) {
                    console.error("[SafeHer Storage Error]:", chrome.runtime.lastError);
                    return;
                }
                showInlineToast("Saved to Case File Evidence!");
                const evBtn = document.getElementById("aegis-btn-save-evidence");
                if (evBtn) evBtn.textContent = "Evidence saved";
                awardLocalActionPoints("evidence", "Saved to Case File Evidence", 0, elementId);
            });
        });
    } catch (e) {
        console.error("[SafeHer Storage Error]:", e);
    }
}

const rewardedActionsSet = new Set();

function awardLocalActionPoints(actionType, title, points, elementId = "") {
    const actionKey = `${actionType}:${elementId || "global"}`;
    if (rewardedActionsSet.has(actionKey)) {
        return;
    }
    rewardedActionsSet.add(actionKey);

    try {
        chrome.storage.local.get(["total_points", "safeher_activity_log"], (res) => {
            const currentTotal = Math.max(0, Number(res.total_points) || 0);
            const newTotal = currentTotal + (points || 0);

            const oldActivity = Array.isArray(res.safeher_activity_log) ? res.safeher_activity_log : [];
            const newActivity = {
                id: "act-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
                type: actionType,
                title: title,
                points: points || 0,
                timestamp: Date.now(),
                element_id: elementId
            };
            const updatedActivity = [newActivity, ...oldActivity].slice(0, 20);

            chrome.storage.local.set({
                total_points: newTotal,
                safeher_activity_log: updatedActivity
            });
        });
    } catch (e) {
        console.error("[SafeHer Voice] Error recording activity:", e);
    }
}

function renderTooltipState(state, elementId) {
    const el = document.querySelector(`[data-aegis-id="${elementId}"]`);

    if (state === "ASK") {
        const rawType = el ? el.getAttribute("data-aegis-type") || "direct_insult" : "direct_insult";
        const aiLevel = el ? el.getAttribute("data-aegis-level") || "HIGH" : "HIGH";
        const isToxic = el ? el.getAttribute("data-aegis-toxic") === "true" : true;
        const score = el ? Number(el.getAttribute("data-aegis-score")) || 0 : 0;
        const rawText = el ? (el.innerText || el.textContent || "") : "";

        const normalizedSev = normalizeSeverity({ is_toxic: isToxic, level: aiLevel, score: score });
        const metadata = deriveDetectionMetadata({ level: aiLevel, score: score, is_toxic: isToxic, pattern_type: rawType }, rawText);

        const suggestedReply = (el && el.getAttribute("data-aegis-reply")) ||
            LITERACY_REPLIES[metadata.pattern_type] || LITERACY_REPLIES.default;

        const levelUpper = normalizedSev.toUpperCase();
        let badgeClass = "safeher-badge-high";
        if (levelUpper === "MEDIUM") badgeClass = "safeher-badge-med";

        // Safe HTML rendering with escaped dynamic strings
        tooltip.innerHTML = `
            <div class="safeher-card-header">
                <div class="safeher-card-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    SAFEHER ASSISTANT
                </div>
                <button class="safeher-close-btn" id="aegis-btn-close" aria-label="Close">&times;</button>
            </div>

            <div class="safeher-meta-row">
                <span class="safeher-meta-label">DETECTED PATTERN</span>
                <span class="safeher-badge ${badgeClass}">${escapeHtml(levelUpper)}</span>
            </div>

            <div class="safeher-pattern-val">${escapeHtml(metadata.pattern_label)}</div>
            <div class="safeher-explanation">${escapeHtml(metadata.explanation)}</div>

            <div class="safeher-meta-label" style="margin-bottom: 4px;">SUGGESTED REPLY</div>
            <div class="safeher-reply-box" id="aegis-reply-content">
                "${escapeHtml(suggestedReply)}"
            </div>

            <div class="safeher-actions-row">
                <button class="safeher-btn safeher-btn-ignore" id="aegis-btn-ignore">&times; Ignore</button>
                <button class="safeher-btn safeher-btn-reply" id="aegis-btn-reply">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    Assertive Reply
                </button>
                <button class="safeher-btn safeher-btn-report" id="aegis-btn-report">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                    Report
                </button>
            </div>

            <div class="safeher-link-row" style="display:flex; justify-space-between; align-items:center;">
                <button class="safeher-link-btn" id="aegis-btn-suggest-severity">Suggest a different severity</button>
                <button class="safeher-link-btn" id="aegis-btn-save-evidence" style="color: #174B73; font-weight:700;">+ Save Evidence</button>
            </div>
            <div id="safeher-toast-notice" class="safeher-inline-toast"></div>
        `;

        document.getElementById("aegis-btn-close").onclick = closeTooltip;
        document.getElementById("aegis-btn-ignore").onclick = () => {
            if (typeof ignoreElementInPageSession === "function") {
                ignoreElementInPageSession(elementId);
            }
            closeTooltip();
        };

        document.getElementById("aegis-btn-reply").onclick = () => {
            navigator.clipboard.writeText(suggestedReply).then(() => {
                showInlineToast("Reply script copied to clipboard!");
            }).catch(() => {
                showInlineToast("Reply copied!");
            });
            awardLocalActionPoints("reply", "Suggested reply copied", 0, elementId);
        };

        document.getElementById("aegis-btn-report").onclick = () => {
            showInlineToast("Please use the platform's report option to complete the report.");
            awardLocalActionPoints("report", "Report guidance opened", 0, elementId);
        };

        document.getElementById("aegis-btn-suggest-severity").onclick = () => {
            renderTooltipState("COUNTER_SUGGEST", elementId);
        };

        const saveEvBtn = document.getElementById("aegis-btn-save-evidence");
        if (saveEvBtn) {
            saveEvBtn.onclick = () => saveEvidenceItem(elementId);
        }
    }

    else if (state === "COUNTER_SUGGEST") {
        const isToxic = el ? el.getAttribute("data-aegis-toxic") === "true" : true;
        const aiLevel = el ? el.getAttribute("data-aegis-level") || "HIGH" : "HIGH";
        const score = el ? Number(el.getAttribute("data-aegis-score")) || 0 : 0;
        const currentAiLevel = normalizeSeverity({ is_toxic: isToxic, level: aiLevel, score: score }).toUpperCase();

        let selectedSeverity = null;

        tooltip.innerHTML = `
            <div class="safeher-card-header">
                <div class="safeher-card-title">SUGGEST SEVERITY</div>
                <button class="safeher-close-btn" id="aegis-btn-close" aria-label="Close">&times;</button>
            </div>

            <div class="safeher-explanation" style="margin-bottom: 10px;">
                Select the severity level you think this content belongs to:
            </div>

            <div class="safeher-severity-selector">
                <button class="safeher-severity-chip" data-val="medium">MEDIUM</button>
                <button class="safeher-severity-chip" data-val="high">HIGH</button>
            </div>

            <div class="safeher-meta-label">WHY SHOULD SEVERITY BE CHANGED? (MIN 10 CHARS)</div>
            <textarea id="aegis-counter-reason" class="safeher-textarea" placeholder="Explain why the AI severity should be updated..."></textarea>
            
            <div id="safeher-validation-err" class="safeher-validation-error"></div>

            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button class="safeher-btn safeher-btn-reply" id="aegis-btn-submit-counter" style="flex: 2;">Submit feedback</button>
                <button class="safeher-btn safeher-btn-ignore" id="aegis-btn-cancel-counter" style="flex: 1;">Cancel</button>
            </div>
        `;

        document.getElementById("aegis-btn-close").onclick = closeTooltip;
        document.getElementById("aegis-btn-cancel-counter").onclick = () => renderTooltipState("ASK", elementId);

        const chips = tooltip.querySelectorAll(".safeher-severity-chip");
        chips.forEach(chip => {
            chip.onclick = () => {
                chips.forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                selectedSeverity = chip.getAttribute("data-val");
            };
        });

        document.getElementById("aegis-btn-submit-counter").onclick = () => {
            const errEl = document.getElementById("safeher-validation-err");
            const reason = (document.getElementById("aegis-counter-reason").value || "").trim();

            if (!selectedSeverity) {
                if (errEl) errEl.textContent = "Please select a severity level (Medium or High).";
                return;
            }

            const mappedUpper = selectedSeverity.toUpperCase();
            if (mappedUpper === currentAiLevel || (mappedUpper === "MEDIUM" && currentAiLevel === "WARNING")) {
                if (errEl) errEl.textContent = "Please select a severity level different from current AI assessment.";
                return;
            }

            if (reason.length < 10) {
                if (errEl) errEl.textContent = "Please enter a justification of at least 10 characters.";
                return;
            }

            const SEVERITY_SCORE_MAP = { medium: 55, high: 85 };
            const youthScore = SEVERITY_SCORE_MAP[selectedSeverity] || 55;

            submitFeedbackFlow(elementId, youthScore, "blur", reason, true);
        };
    }

    else if (state === "MANUAL") {
        tooltip.innerHTML = `
            <div class="safeher-card-header">
                <div class="safeher-card-title">SAFEHER VOICE SCANNER</div>
                <button class="safeher-close-btn" id="aegis-btn-close" aria-label="Close">&times;</button>
            </div>

            <div class="safeher-explanation" style="margin: 10px 0;">
                Scan or analyze this highlighted text with SafeHer AI?
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
                <button class="safeher-btn safeher-btn-reply" id="aegis-btn-scan">
                    Scan with AI
                </button>
                <button class="safeher-btn safeher-btn-report-manual" id="aegis-btn-report-manual" style="background:#FFF5F5; color:#E60018; border:1px solid #FFE3E5; padding:8px 10px; border-radius:20px; font-weight:700; cursor:pointer;">
                    Report as Toxic
                </button>
            </div>
        `;

        document.getElementById("aegis-btn-close").onclick = closeTooltip;

        document.getElementById("aegis-btn-scan").onclick = () => {
            tooltip.innerHTML = `
                <div style="text-align: center; padding: 20px; font-weight: 700; color: #174B73;">
                    Scanning selection...
                </div>
            `;
            const pageSessionId = typeof getPageSessionId === "function" ? getPageSessionId() : "";
            const protectionSessionId = typeof getProtectionSessionId === "function" ? getProtectionSessionId() : "";
            const timestamp = Date.now();

            if (typeof pendingElementsMap !== "undefined" && pendingElementsMap) {
                pendingElementsMap.set(elementId, {
                    elementId: elementId,
                    text: selectedText,
                    normalizedText: typeof normalizeTextForDedupe === "function"
                        ? normalizeTextForDedupe(selectedText)
                        : selectedText.trim().replace(/\s+/g, " ").toLowerCase(),
                    cacheKey: null,
                    pageSessionId: pageSessionId,
                    protectionSessionId: protectionSessionId,
                    timestamp: timestamp,
                    isManual: true
                });
            }

            safeSendMessage({
                action: "manual_scan",
                text: selectedText,
                element_id: elementId,
                tab_name: document.title || "Web Page",
                page_session_id: pageSessionId,
                protection_session_id: protectionSessionId,
                timestamp: timestamp
            });
        };

        document.getElementById("aegis-btn-report-manual").onclick = () => {
            renderTooltipState("COUNTER_SUGGEST", elementId);
        };
    }
}

function showInlineToast(msg) {
    const toast = document.getElementById("safeher-toast-notice");
    if (toast) {
        toast.textContent = msg;
        toast.style.display = "block";
        setTimeout(() => {
            toast.style.display = "none";
        }, 2500);
    }
}
