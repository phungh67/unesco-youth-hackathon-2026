// state.js
// State Management & Metadata Helpers for SafeHer Voice Chrome Extension

const DEBUG = false;

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

const MAX_CACHE_SIZE = 500;
const scannedTextCache = new Map();
const pendingElementsMap = new Map();

/**
 * Quản lý scannedTextCache với giới hạn dung lượng 500 entry.
 * Ưu tiên xóa entry resolved/stale cũ nhất khi vượt giới hạn, không xóa entry pending.
 */
function setScannedTextCache(key, value) {
    if (scannedTextCache.size >= MAX_CACHE_SIZE && !scannedTextCache.has(key)) {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [k, entry] of scannedTextCache.entries()) {
            if (entry && entry.status !== "pending") {
                const time = entry.resolvedAt || entry.staleAt || entry.createdAt || 0;
                if (time < oldestTime) {
                    oldestTime = time;
                    oldestKey = k;
                }
            }
        }

        if (oldestKey) {
            scannedTextCache.delete(oldestKey);
        }
    }
    scannedTextCache.set(key, value);
}

// Lưu tối đa 50 lượt scan gần nhất để hiển thị trong popup runtime.
const MAX_SCAN_LOG = 50;
const scanLog = [];

const startTime = Date.now();

let totalNodesScanned = 0;
let duplicatesBlocked = 0;
let toxicNodesFound = 0;

let highSeverityCount = 0;
let medSeverityCount = 0;
let lowSeverityCount = 0;

// ─── CONSENT, PROTECTION & SESSION STATE ────────────────────────────────────
let consentGiven = false;
let protectionEnabled = false;

let currentProtectionSessionId = "prot-" + Date.now();
let currentPageSessionId = "page-" + Date.now();
const currentIgnoredElementIds = new Set();

function isConsentGiven() {
    return consentGiven;
}

function setConsentGiven(val) {
    consentGiven = val === true;
}

function isProtectionEnabled() {
    return protectionEnabled;
}

function setProtectionEnabled(val) {
    protectionEnabled = val === true;
    if (protectionEnabled) {
        currentProtectionSessionId = "prot-" + Date.now();
    } else {
        currentIgnoredElementIds.clear();
    }
}

function isScanningAllowed() {
    return consentGiven === true && protectionEnabled === true;
}

function getProtectionSessionId() {
    return currentProtectionSessionId;
}

function getPageSessionId() {
    return currentPageSessionId;
}

function resetPageSessionId() {
    currentPageSessionId = "page-" + Date.now();
    currentIgnoredElementIds.clear();
    scannedTextCache.clear();
}

function ignoreElementInPageSession(elementId) {
    if (elementId) currentIgnoredElementIds.add(elementId);
}

function isElementIgnoredInPageSession(elementId) {
    return elementId ? currentIgnoredElementIds.has(elementId) : false;
}

// ─── TEXT NORMALIZATION FOR DEDUPE ──────────────────────────────────────────
/**
 * Chuẩn hóa text cho contentDedupeKey: NFC, collapse whitespace, trim, lowercase.
 * Raw text gửi backend vẫn giữ nguyên 100% nội dung gốc.
 */
function normalizeTextForDedupe(text) {
    return String(text || "")
        .normalize("NFC")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

// ─── SEVERITY NORMALIZATION (STANDARDIZED FE HELPER) ───────────────────────
/**
 * Standardized Severity Helper:
 * Strictly aligns with backend response schema:
 * { is_toxic: boolean, level: "high" | "warning", score: number }
 * 
 * - is_toxic !== true -> "none"
 * - is_toxic === true && level === "high" -> "high"
 * - is_toxic === true && level === "warning" / "medium" -> "medium"
 * (FE KHÔNG coi "low" là severity chính thức từ backend)
 */
function getDisplaySeverity(item) {
    if (!item || item.is_toxic !== true) {
        return "none";
    }

    const lvl = String(item.level || item.severity || "").toLowerCase();
    if (lvl === "high" || lvl === "severe") {
        return "high";
    }

    return "medium";
}

function normalizeSeverity(result) {
    return getDisplaySeverity(result);
}

// ─── PATTERN TYPE & EXPLANATION DERIVATION (FE RULES FALLBACK) ───────────────
/**
 * Helper gắn pattern_type & explanation bằng Rule ở FE khi backend chưa hỗ trợ.
 * Đánh dấu explanation_source = "backend" | "frontend_rule".
 */
function deriveDetectionMetadata(result, rawText = "") {
    if (!result) {
        return {
            pattern_type: "unclear_harmful_content",
            pattern_label: "Harmful Content",
            explanation: "Potentially harmful content detected on page.",
            explanation_source: "frontend_rule"
        };
    }

    // 1. Ưu tiên dữ liệu do backend trả về nếu có
    if (result.pattern_type && result.explanation) {
        return {
            pattern_type: result.pattern_type,
            pattern_label: result.pattern_label || String(result.pattern_type).replace(/_/g, " ").toUpperCase(),
            explanation: result.explanation,
            explanation_source: "backend"
        };
    }

    // 2. Nếu backend không có, dùng rule phía FE dựa trên text / severity / action / score
    const textLower = String(rawText || result.text || result.raw_text || "").toLowerCase();
    const score = Number(result.score || result.ai_toxicity_score || 0);
    const severity = normalizeSeverity(result);

    let type = "general_hostility";
    let label = "General Hostility";
    let explanation = "Language containing hostility or inappropriate terms.";

    if (/chết|giết|đánh|bắn|thù|chém|kill|die|threat|bóp cổ/i.test(textLower)) {
        type = "threat";
        label = "Threat & Violent Harassment";
        explanation = "Content containing violent words, intimidation, or physical threat.";
    } else if (/mập|béo|xấu|lùn|dị|gầy|biến thái|stdf|ugly|fat|béo phì|mặt mụn/i.test(textLower)) {
        type = "body_shaming";
        label = "Body Shaming";
        explanation = "Derogatory comments targeting appearance, weight, or physical traits.";
    } else if (/ngu|chó|lợn|đần|óc|stupid|idiot|fool|cút|đồ điên/i.test(textLower)) {
        type = "direct_insult";
        label = "Direct Insult";
        explanation = "Personal attack or insulting epithet aimed at degrading an individual.";
    } else if (/bịa|vu khống|lừa|tin đồn|fake|scam|đặt điều/i.test(textLower)) {
        type = "rumor_or_defamation";
        label = "Rumor or Defamation";
        explanation = "Potentially misleading claim or unverified defamatory rumor.";
    } else if (/cả lũ|hùa|bầy đàn|tẩy chay|pile on/i.test(textLower)) {
        type = "coordinated_pile_on";
        label = "Coordinated Attack";
        explanation = "Aggressive group pile-on or organized targeted harassment.";
    } else if (severity === "high" || score >= 75) {
        type = "direct_insult";
        label = "High-Severity Attack";
        explanation = "Personal attack targeting individual dignity with high toxicity.";
    }

    return {
        pattern_type: type,
        pattern_label: label,
        explanation: explanation,
        explanation_source: "frontend_rule"
    };
}

// ─── SCAN LOG & COUNTERS ─────────────────────────────────────────────────────

function pushScanLog(entry) {
    const existingIndex = scanLog.findIndex((e) => e.element_id === entry.element_id);
    if (existingIndex !== -1) {
        scanLog[existingIndex] = { ...scanLog[existingIndex], ...entry };
        return;
    }

    scanLog.unshift(entry);

    if (scanLog.length > MAX_SCAN_LOG) {
        scanLog.pop();
    }
}

function updateScanLogStatus(elementId, patch) {
    const index = scanLog.findIndex(
        (entry) => entry.element_id === elementId
    );

    if (index === -1) {
        return { updated: false, firstResolution: false };
    }

    const oldEntry = scanLog[index];
    const firstResolution = oldEntry.status === "pending";

    scanLog[index] = {
        ...oldEntry,
        ...patch
    };

    return { updated: true, firstResolution };
}

function incrementTotalNodesScanned() {
    totalNodesScanned++;
}

function incrementDuplicatesBlocked() {
    duplicatesBlocked++;
}

function incrementToxicNodesFound() {
    toxicNodesFound++;
}

function incrementHighSeverityCount() {
    highSeverityCount++;
}

function incrementMedSeverityCount() {
    medSeverityCount++;
}

function incrementLowSeverityCount() {
    lowSeverityCount++;
}

function getScannerStats() {
    return {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        totalScanned: totalNodesScanned,
        cachedCount: scannedTextCache.size,
        duplicates: duplicatesBlocked,
        toxicFound: toxicNodesFound,
        highSeverity: highSeverityCount,
        medSeverity: medSeverityCount,
        lowSeverity: 0,
        recentScans: scanLog.slice(0, 20),
        consentGiven: consentGiven,
        protectionEnabled: protectionEnabled,
        isScanningAllowed: isScanningAllowed()
    };
}

// ─── BACKGROUND SCRIPT MESSAGE LISTENER ────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Force a rescan if triggered by background.js (Tab Switch / Alarm)
    if (request.action === "force_rescan") {
        if (typeof scanExistingContent === "function" && isScanningAllowed()) {
            console.log("[SafeHer Voice] Received force_rescan from background...");
            scanExistingContent();
        }
    }
    
    // 2. Handle instant cache hits from background.js
    if (request.action === "scan_result" && request.data) {
        const payload = request.data;
        if (payload.element_id && payload.is_toxic === true && (payload.level !== "none")) {
            const toxicElement = document.querySelector(`[data-aegis-id="${payload.element_id}"]`);
            if (toxicElement) {
                applyToxicBlockUI(toxicElement, payload);
            }
        }
    }
});