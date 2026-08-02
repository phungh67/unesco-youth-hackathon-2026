// scanner.js
// SafeHer Voice Scanner & DOM Inspector

const IGNORED_TAGS = [
  "HEADER",
  "NAV",
  "FOOTER",
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "BUTTON",
  "INPUT",
  "TEXTAREA",
];

let mutationObserver = null;
let scanningStarted = false;
let currentUrl = location.href;
let scanTimeout = null;

/**
 * Kiểm tra nội dung có phải UI noise hay không.
 * Upgraded with robust length filtering and boilerplate blacklisting.
 */
function isNoise(text) {
  if (!text || typeof text !== "string") return true;

  const trimmed = text.trim();

  // 1. Strict Length Filter: Real toxic comments or posts are rarely under 20 characters.
  // This instantly blocks names ("Yu Deng"), titles ("Co-president"), and short menu links.
  if (trimmed.length < 20) {
    return true;
  }

  const lowerText = trimmed.toLowerCase();

  // 2. Must contain letters
  const hasLetters = /[a-zA-Z\u00C0-\u1EF9]/;
  if (!hasLetters.test(lowerText)) {
    return true;
  }

  // 3. UI, Footer, and Wikipedia Article Boilerplate Blacklist
  const noiseBlacklist = [
    "thông báo",
    "tất cả",
    "chưa đọc",
    "xem tất cả",
    "đánh dấu là đã đọc",
    "tìm hiểu thêm",
    "file đính kèm",
    "thêm chi tiết",
    "ẩn",
    "chia sẻ",
    "thích",
    "bình luận",
    "hi ad",
    "text is available under the creative commons",
    "terms of use",
    "privacy policy",
    "wikimedia foundation",
    "code of conduct",
    "mobile view",
    "statistics",
    "cookie statement",
    "developers",
    "about wikipedia",
    "disclaimers",
    "full article",
    "full list",
    "free media repository",
    "languages",
  ];

  if (noiseBlacklist.some((ui) => lowerText.includes(ui))) {
    return true;
  }

  // 4. Encyclopedia / News Intro Filter:
  // If a text starts with a date pattern or sounds like an encyclopedia summary (e.g., "X is the fourth...", "1920 – Franco-Syrian"), drop it.
  const encyclopediaPatterns = [
    /is the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(studio album|mov|book|professor|mathematician)/i,
    /was a (french|chinese|german|american|english)\s+(novelist|mathematician|scientist|politician)/i,
    /^\d{4}\s*[–-]\s*/, // Starts with a year range like "1920 – "
    /there are \d+ municipalities/i,
  ];

  if (encyclopediaPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  return false; // Only allow actual conversational text through!
}

/**
 * Hiển thị trạng thái cảnh báo lên phần tử độc hại.
 */
function applyToxicBlockUI(toxicElement, request) {
  const levelLower = (request.level || "").toLowerCase();

  let bgColor = "rgba(255, 165, 0, 0.15)";
  let borderColor = "2px dotted orange";

  if (levelLower === "high" || levelLower === "severe") {
    bgColor = "rgba(255, 0, 0, 0.15)";
    borderColor = "2px dotted red";
  }

  toxicElement.style.backgroundColor = bgColor;
  toxicElement.style.borderBottom = borderColor;
  toxicElement.style.cursor = "help";

  toxicElement.setAttribute("data-aegis-toxic", "true");

  toxicElement.setAttribute("data-aegis-level", request.level || "warning");

  toxicElement.setAttribute("data-aegis-type", request.type || "toxic");

  toxicElement.setAttribute("data-aegis-action", request.action || "blur");

  toxicElement.setAttribute("data-aegis-score", request.score || "0");

  const formattedType = (request.type || "toxic")
    .replace(/_/g, " ")
    .toUpperCase();

  const actionText = (request.action || "blur")
    .replace(/reply -/i, "Auto-reply: ")
    .trim();

  toxicElement.title =
    `SAFEHER VOICE BLOCKED\n` +
    `Type: ${formattedType}\n` +
    `Severity: ${(request.level || "Warning").toUpperCase()} ` +
    `(Score: ${request.score || 0})\n` +
    `Suggestion: ${actionText}`;

  const actionLower = (request.action || "").toLowerCase();

  if (actionLower === "blur" || actionLower === "report") {
    toxicElement.style.filter = "blur(5px)";
  }
}

/**
 * Tạo element_id duy nhất toàn cục chống trùng lặp giữa các tab.
 */
function generateElementId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `aegis-${crypto.randomUUID()}`;
  }
  return `aegis-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Xử lý một phần tử HTML và gửi nội dung cần quét.
 */
function processNode(element) {
  if (!isScanningAllowed()) {
    return;
  }

  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  if (
    IGNORED_TAGS.includes(element.tagName) ||
    element.isContentEditable ||
    element.closest("#aegis-feedback-tooltip")
  ) {
    return;
  }

  const textContent = (element.innerText || element.textContent || "").trim();

  if (textContent.length <= 3 || textContent.length >= 2000) {
    return;
  }

  if (isNoise(textContent)) {
    return;
  }

  if (element.hasAttribute("data-aegis-id")) {
    const prevText = element.dataset.aegisScannedText || "";
    if (prevText === textContent) {
      return;
    }

    element.removeAttribute("data-aegis-toxic");
    element.removeAttribute("data-aegis-level");
    element.removeAttribute("data-aegis-type");
    element.removeAttribute("data-aegis-action");
    element.removeAttribute("data-aegis-score");
    element.style.backgroundColor = "";
    element.style.borderBottom = "";
    element.style.filter = "";
    element.style.cursor = "";
    element.title = "";
  }

  incrementTotalNodesScanned();

  const elementId = generateElementId();

  element.setAttribute("data-aegis-id", elementId);
  element.dataset.aegisScannedText = textContent;

  const pageSessId =
    typeof getPageSessionId === "function" ? getPageSessionId() : "default";
  const protSessId =
    typeof getProtectionSessionId === "function"
      ? getProtectionSessionId()
      : "default";
  const normalizedText =
    typeof normalizeTextForDedupe === "function"
      ? normalizeTextForDedupe(textContent)
      : textContent.trim().replace(/\s+/g, " ").toLowerCase();
  const cacheKey = `${pageSessId}:${normalizedText}`;
  const timestamp = Date.now();

  if (scannedTextCache.has(cacheKey)) {
    incrementDuplicatesBlocked();

    const cachedRecord = scannedTextCache.get(cacheKey);

    pendingElementsMap.set(elementId, {
      elementId: elementId,
      text: textContent,
      normalizedText: normalizedText,
      cacheKey: cacheKey,
      pageSessionId: pageSessId,
      protectionSessionId: protSessId,
      timestamp: timestamp,
    });

    if (cachedRecord.status === "resolved") {
      const payload = cachedRecord.payload
        ? { ...cachedRecord.payload, element_id: elementId }
        : null;
      if (
        payload &&
        payload.is_toxic === true &&
        getDisplaySeverity(payload) !== "none"
      ) {
        applyToxicBlockUI(element, payload);
      }

      if (payload && typeof window.handleScanResponseFromCache === "function") {
        window.handleScanResponseFromCache(payload, elementId, textContent);
      }
      return;
    }

    if (cachedRecord.status === "pending") {
      cachedRecord.waitingIds.push(elementId);
      return;
    }
  }

  setScannedTextCache(cacheKey, {
    status: "pending",
    waitingIds: [elementId],
    createdAt: Date.now(),
  });

  pendingElementsMap.set(elementId, {
    elementId: elementId,
    text: textContent,
    normalizedText: normalizedText,
    cacheKey: cacheKey,
    pageSessionId: pageSessId,
    protectionSessionId: protSessId,
    timestamp: timestamp,
  });

  safeSendMessage({
    action: "scan_text",
    element_id: elementId,
    text: textContent,
    tab_name: document.title,
    page_session_id: pageSessId,
    protection_session_id: protSessId,
    timestamp: timestamp,
  });

  pushScanLog({
    element_id: elementId,
    tab_name: document.title,
    timestamp: timestamp,
    text: textContent,
    status: "pending",
  });
}

/**
 * Duyệt toàn bộ text node trong một DOM tree.
 */
function scanTreeForText(rootNode) {
  if (!rootNode) {
    return;
  }

  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = (node.nodeValue || "").trim();

      return value.length > 3
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let textNode;

  while ((textNode = walker.nextNode())) {
    if (textNode.parentElement) {
      processNode(textNode.parentElement);
    }
  }
}

function scanExistingContent() {
  if (!isScanningAllowed() || !document.body) {
    return;
  }
  scanTreeForText(document.body);
}

function debouncedScan() {
  if (!isScanningAllowed()) {
    return;
  }

  if (scanTimeout) {
    clearTimeout(scanTimeout);
  }

  scanTimeout = setTimeout(() => {
    if (!isScanningAllowed()) {
      return;
    }
    scanExistingContent();
  }, 250);
}

function startMutationObserver() {
  if (!document.body || mutationObserver) {
    return;
  }

  mutationObserver = new MutationObserver((mutations) => {
    if (!isScanningAllowed()) {
      return;
    }

    if (location.href !== currentUrl) {
      currentUrl = location.href;
      debouncedScan();
    }

    let needsScan = false;

    mutations.forEach((mutation) => {
      if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
        if (mutation.target.closest("#aegis-feedback-tooltip")) {
          return;
        }
      } else if (mutation.target && mutation.target.parentElement) {
        if (mutation.target.parentElement.closest("#aegis-feedback-tooltip")) {
          return;
        }
      }

      if (mutation.addedNodes.length > 0 || mutation.type === "characterData") {
        needsScan = true;
      }
    });

    if (needsScan && isScanningAllowed()) {
      debouncedScan();
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

// ─── SCANNER LIFECYCLE MANAGEMENT ────────────────────────────────────────────

function startSafeHerScanning() {
  if (scanningStarted || !isScanningAllowed()) {
    return;
  }

  scanningStarted = true;
  console.log("[SafeHer Voice] Starting DOM Scanner...");
  scanExistingContent();
  startMutationObserver();
}

function stopSafeHerScanning() {
  scanningStarted = false;
  console.log("[SafeHer Voice] Stopping DOM Scanner...");

  if (scanTimeout) {
    clearTimeout(scanTimeout);
    scanTimeout = null;
  }

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

/**
 * SPA Route Mutation Handler
 */
function handleSpaRouteMutation() {
  const newUrl = location.href;
  if (newUrl !== currentUrl) {
    currentUrl = newUrl;
    if (typeof resetPageSessionId === "function") {
      resetPageSessionId();
    }
    if (typeof closeTooltip === "function") {
      closeTooltip();
    }
    const oldHighlights = document.querySelectorAll("[data-aegis-toxic]");
    oldHighlights.forEach((el) => {
      el.removeAttribute("data-aegis-toxic");
      el.removeAttribute("data-aegis-level");
      el.removeAttribute("data-aegis-action");
      el.removeAttribute("data-aegis-score");
      el.style.backgroundColor = "";
      el.style.borderBottom = "";
      el.style.filter = "";
      el.style.cursor = "";
    });

    if (isScanningAllowed()) {
      scanExistingContent();
    }
  }
}

// History API Hooks
(function hookHistoryAPI() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    window.dispatchEvent(new Event("aegis:locationchange"));
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event("aegis:locationchange"));
    return result;
  };

  window.addEventListener("popstate", () => {
    window.dispatchEvent(new Event("aegis:locationchange"));
  });
})();

window.addEventListener("aegis:locationchange", () => {
  if (!isScanningAllowed()) return;
  currentUrl = location.href;
  debouncedScan();
});

window.addEventListener("safeher:locationchange", () => {
  handleSpaRouteMutation();
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("[SafeHer Voice] Tab became active. Forcing re-scan...");
        if (typeof resetPageSessionId === "function") {
            resetPageSessionId();
        }
        if (isScanningAllowed()) {
            scanExistingContent();
        }
    }
});

window.addEventListener("focus", () => {
    if (isScanningAllowed()) {
        scanExistingContent();
    }
});

/*
 * Mouseup handler for manual scan selection & tooltip view
 */
document.addEventListener("mouseup", (event) => {
  const selection = window.getSelection();
  const currentSelectedText = selection ? selection.toString().trim() : "";

  selectedText = currentSelectedText;

  if (
    selectedText.length > 0 &&
    !event.target.closest("#aegis-feedback-tooltip")
  ) {
    if (!isScanningAllowed()) {
      return;
    }

    if (selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    let targetElement;

    if (
      selection.anchorNode &&
      selection.anchorNode.nodeType === Node.TEXT_NODE
    ) {
      targetElement = selection.anchorNode.parentElement;
    } else {
      targetElement = selection.anchorNode;
    }

    if (!targetElement || typeof targetElement.getAttribute !== "function") {
      return;
    }

    let elementId = targetElement.getAttribute("data-aegis-id");

    if (!elementId) {
      elementId = generateElementId();
      targetElement.setAttribute("data-aegis-id", elementId);
    }

    renderTooltipState("MANUAL", elementId);
    openTooltipSmart(rect);
    return;
  }

  const toxicNode = event.target.closest('[data-aegis-toxic="true"]');

  if (toxicNode && selectedText.length === 0) {
    event.preventDefault();
    event.stopPropagation();

    activeAegisId = toxicNode.getAttribute("data-aegis-id");
    renderTooltipState("ASK", activeAegisId);

    const rect = toxicNode.getBoundingClientRect();
    openTooltipSmart(rect);
  } else if (!event.target.closest("#aegis-feedback-tooltip")) {
    closeTooltip();
  }
});

// ─── STORAGE CHANGE LISTENER ─────────────────────────────────────────────────

try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.safeher_consent_given) {
      setConsentGiven(changes.safeher_consent_given.newValue === true);
    }

    if (changes.safeher_protection_enabled) {
      setProtectionEnabled(
        changes.safeher_protection_enabled.newValue === true,
      );
    }

    if (isScanningAllowed()) {
      startSafeHerScanning();
    } else {
      stopSafeHerScanning();
    }
  });
} catch (e) {
  // Running outside extension environment
}

// ─── ASYNC INITIALIZATION ────────────────────────────────────────────────────
async function initializeSafeHerScanner() {
  try {
    const settings = await chrome.storage.local.get([
      "safeher_consent_given",
      "safeher_protection_enabled",
    ]);

    setConsentGiven(settings.safeher_consent_given === true);
    setProtectionEnabled(settings.safeher_protection_enabled === true);

    if (isScanningAllowed()) {
      startSafeHerScanning();
    }
  } catch (e) {
    // Fallback for non-chrome environment
  }
}

initializeSafeHerScanner();
