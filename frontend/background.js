// background.js
// SafeHer Voice Service Worker (WebSocket Background Connector)

let socket = null;
let socketGeneration = 0;
let reconnectInterval = 1000;
const MAX_RECONNECT_INTERVAL = 30000;
let pingIntervalId = null;

const pendingTabMap = new Map();
const pendingFeedbackQueue = [];
let activeFeedback = null;
let activeFeedbackTimeout = null;

const outboundQueue = [];
const queuedRequestKeys = new Set();
const inFlightRequestKeys = new Set();
const completedRequestKeys = new Map();
const activeTimeouts = new Map();

// ==========================================
// ORCHESTRATOR UPGRADE 1: Global Memory Cache
// ==========================================
const globalScanCache = new Map();
const CACHE_LIMIT = 5000;

function cacheSuccessfulScan(originalText, responseData) {
  if (!originalText) return;
  const normalized = originalText.trim().toLowerCase();

  // Prevent memory leaks using a simple LRU eviction
  if (globalScanCache.size >= CACHE_LIMIT) {
    const firstKey = globalScanCache.keys().next().value;
    globalScanCache.delete(firstKey);
  }
  globalScanCache.set(normalized, responseData);
}

// Top-level execution: Set WS status false before creating WebSocket connection
try {
  chrome.storage.local.set({ safeher_ws_connected: false });
} catch (e) {}

/**
 * Tạo requestKey nội bộ FE theo đủ context.
 * Key này KHÔNG gửi sang backend.
 */
function buildRequestKey({
  action,
  tabId,
  frameId,
  pageSessionId,
  protectionSessionId,
  elementId,
}) {
  return [
    action || "",
    tabId ?? "",
    frameId ?? 0,
    pageSessionId || "",
    protectionSessionId || "",
    elementId || "",
  ].join(":");
}

/**
 * Quản lý vòng đời request.
 */
function cleanupRequestLifecycle(requestKey, finalStatus) {
  if (!requestKey) return;
  queuedRequestKeys.delete(requestKey);
  inFlightRequestKeys.delete(requestKey);
  completedRequestKeys.set(requestKey, {
    status: finalStatus,
    completedAt: Date.now(),
  });
}

/**
 * Tự động xóa completedRequestKeys theo TTL 3 phút.
 */
const COMPLETED_TTL_MS = 180000; // 3 phút TTL
function pruneCompletedRequestKeys() {
  const NOW = Date.now();
  for (const [key, val] of completedRequestKeys.entries()) {
    if (NOW - val.completedAt > COMPLETED_TTL_MS) {
      completedRequestKeys.delete(key);
    }
  }
}
setInterval(pruneCompletedRequestKeys, 60000);

// Tab closed listener to cleanup maps
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [elementId, item] of pendingTabMap.entries()) {
    if (item.tabId === tabId) {
      if (activeTimeouts.has(elementId)) {
        clearTimeout(activeTimeouts.get(elementId));
        activeTimeouts.delete(elementId);
      }
      if (item.requestKey) {
        cleanupRequestLifecycle(item.requestKey, "stale");
      }
      pendingTabMap.delete(elementId);
    }
  }
});

/**
 * Timeout riêng cho scan_text.
 * Hỗ trợ retry tối đa 2 lần, giữ cùng requestKey.
 */
function scheduleScanTimeout(context) {
  const elementId = context.elementId;
  if (activeTimeouts.has(elementId)) {
    clearTimeout(activeTimeouts.get(elementId));
  }

  const timer = setTimeout(() => {
    activeTimeouts.delete(elementId);
    const currentContext = pendingTabMap.get(elementId);
    if (!currentContext || currentContext.requestKey !== context.requestKey)
      return;

    if (currentContext.retryCount < 2) {
      inFlightRequestKeys.delete(currentContext.requestKey);
      currentContext.retryCount++;
      currentContext.state = "retrying";
      console.log(
        `[SafeHer Voice] Timeout for ${elementId}. Retrying (${currentContext.retryCount}/2)...`,
      );

      const payload = {
        action: "scan_text",
        text: currentContext.text,
        element_id: elementId,
        tab_name: currentContext.tabName,
      };

      sendScanPayload(payload, currentContext, { isRetry: true });
    } else {
      console.warn(
        `[SafeHer Voice] Request for ${elementId} failed after max retries.`,
      );
      currentContext.state = "failed";

      cleanupRequestLifecycle(currentContext.requestKey, "failed");

      const failedResponse = {
        message_type: "scan_response",
        element_id: elementId,
        is_toxic: false,
        level: "none",
        status: "failed",
        tab_id: currentContext.tabId,
        page_session_id: currentContext.pageSessionId,
        protection_session_id: currentContext.protectionSessionId,
        timestamp: currentContext.sourceTimestamp,
        request_key: currentContext.requestKey,
      };
      chrome.tabs
        .sendMessage(currentContext.tabId, failedResponse, {
          frameId: currentContext.frameId,
        })
        .catch(() => {});
      pendingTabMap.delete(elementId);
    }
  }, 18000);

  activeTimeouts.set(elementId, timer);
}

/**
 * Timeout riêng cho submit_feedback.
 * Khi confirmation_timeout: rotate socket connection trước khi gửi feedback tiếp theo.
 */
function scheduleFeedbackConfirmationTimeout(context) {
  if (activeFeedbackTimeout) {
    clearTimeout(activeFeedbackTimeout);
    activeFeedbackTimeout = null;
  }

  activeFeedbackTimeout = setTimeout(() => {
    activeFeedbackTimeout = null;
    if (!activeFeedback || activeFeedback.requestKey !== context.requestKey)
      return;

    console.warn(
      `[SafeHer Voice] Feedback confirmation timeout for ${context.elementId}`,
    );
    context.state = "confirmation_timeout";

    const timeoutMsg = {
      action: "feedback_timeout",
      element_id: context.elementId,
      status: "confirmation_timeout",
      page_session_id: context.pageSessionId,
      protection_session_id: context.protectionSessionId,
    };
    chrome.tabs
      .sendMessage(context.tabId, timeoutMsg, { frameId: context.frameId })
      .catch(() => {});

    cleanupRequestLifecycle(context.requestKey, "confirmation_timeout");

    // Giải phóng activeFeedback, chủ động đóng socket cũ và reconnect socket mới
    activeFeedback = null;

    if (socket) {
      try {
        socket.close();
      } catch (e) {}
      socket = null;
    }
    chrome.storage.local.set({ safeher_ws_connected: false });
    setTimeout(connectWebSocket, 500);
  }, 18000);
}

/**
 * Xử lý feedback tiếp theo trong queue qua activeFeedback.
 */
function processNextFeedback() {
  if (activeFeedback !== null) return;
  if (pendingFeedbackQueue.length === 0) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  activeFeedback = pendingFeedbackQueue.shift();
  activeFeedback.socketGeneration = socket.socketGeneration;

  queuedRequestKeys.delete(activeFeedback.requestKey);
  inFlightRequestKeys.add(activeFeedback.requestKey);

  activeFeedback.state = "sent";
  activeFeedback.sentAt = Date.now();

  socket.send(JSON.stringify(activeFeedback.payload));

  scheduleFeedbackConfirmationTimeout(activeFeedback);
}

/**
 * Flush scan outbound queue khi socket kết nối thành công.
 */
function flushOutboundQueue() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  while (outboundQueue.length > 0 && socket.readyState === WebSocket.OPEN) {
    const item = outboundQueue.shift();
    if (item && item.payload && item.context) {
      queuedRequestKeys.delete(item.requestKey);
      inFlightRequestKeys.add(item.requestKey);
      item.context.state = "in_flight";
      socket.send(JSON.stringify(item.payload));
      scheduleScanTimeout(item.context);
    }
  }
}

/**
 * Gửi scan payload sang backend nếu WebSocket OPEN, nếu ngắt thì xếp vào outboundQueue.
 */
function sendScanPayload(payload, context, options = {}) {
  const requestKey = context.requestKey;
  const isRetry = options.isRetry === true;

  if (socket && socket.readyState === WebSocket.OPEN) {
    queuedRequestKeys.delete(requestKey);
    inFlightRequestKeys.add(requestKey);
    context.state = "in_flight";
    socket.send(JSON.stringify(payload));
    scheduleScanTimeout(context);
    return { accepted: true, status: "sent" };
  }

  if (
    !isRetry &&
    (queuedRequestKeys.has(requestKey) || inFlightRequestKeys.has(requestKey))
  ) {
    return { accepted: true, status: "already_queued" };
  }

  inFlightRequestKeys.delete(requestKey);
  queuedRequestKeys.add(requestKey);
  context.state = "queued";

  for (let i = outboundQueue.length - 1; i >= 0; i--) {
    if (outboundQueue[i].requestKey === requestKey) {
      outboundQueue.splice(i, 1);
    }
  }

  outboundQueue.push({
    payload: payload,
    context: context,
    requestKey: requestKey,
    elementId: payload.element_id,
    queuedAt: Date.now(),
    retryCount: context.retryCount || 0,
    state: "queued",
  });

  connectWebSocket();
  return { accepted: true, status: "queued" };
}

/**
 * Kết nối với Python daemon qua WebSocket.
 */
function connectWebSocket() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  console.log(
    "[SafeHer Voice] Attempting to connect to local Python Daemon...",
  );
  socketGeneration += 1;
  const currentGen = socketGeneration;

  const ws = new WebSocket("ws://127.0.0.1:8083/scan");
  ws.socketGeneration = currentGen;
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;
    console.log(
      `[SafeHer Voice] Connected to local Python Daemon (Generation ${ws.socketGeneration})!`,
    );
    chrome.storage.local.set({ safeher_ws_connected: true });

    reconnectInterval = 1000;
    flushOutboundQueue();
    processNextFeedback();

    if (pingIntervalId) {
      clearInterval(pingIntervalId);
    }

    pingIntervalId = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send("ping");
      }
    }, 25000);
  };

  ws.onmessage = (event) => {
    if (socket !== ws) return;
    const messageSocketGeneration = ws.socketGeneration;

    try {
      const response = JSON.parse(event.data);

      // FIFO correlation cho Feedback Response qua activeFeedback
      if (response.action === "feedback_processed") {
        const context = activeFeedback;

        if (!context) {
          console.warn("[SafeHer Voice] Orphan feedback response received");
          return;
        }

        if (context.socketGeneration !== messageSocketGeneration) {
          console.warn(
            `[SafeHer Voice] Ignored late feedback response from old socket generation`,
          );
          return;
        }

        if (activeFeedbackTimeout) {
          clearTimeout(activeFeedbackTimeout);
          activeFeedbackTimeout = null;
        }

        context.state = "completed";

        const enrichedFeedback = {
          ...response,
          element_id: context.elementId,
          page_session_id: context.pageSessionId,
          protection_session_id: context.protectionSessionId,
        };
        chrome.tabs
          .sendMessage(context.tabId, enrichedFeedback, {
            frameId: context.frameId,
          })
          .catch(() => {});

        cleanupRequestLifecycle(context.requestKey, "completed");

        const feedbackData = response.data || {};
        const userState = feedbackData.user_state || {};
        const newUnlocks = feedbackData.new_unlocks || {};

        chrome.storage.local.get(["unlocked_badges", "total_points"], (res) => {
          const oldBadges = Array.isArray(res.unlocked_badges)
            ? res.unlocked_badges
            : [];
          const newBadgesNow = Array.isArray(newUnlocks.badges_awarded_now)
            ? newUnlocks.badges_awarded_now
            : [];
          const mergedBadges = [...new Set([...oldBadges, ...newBadgesNow])];
          const backendTotalPoints = Number(userState.total_points);
          const updatedTotalPoints = Number.isFinite(backendTotalPoints)
            ? backendTotalPoints
            : Number(res.total_points) || 0;

          chrome.storage.local.set({
            total_points: updatedTotalPoints,
            daily_points_progress: userState.daily_points_progress ?? 0,
            daily_cap: userState.daily_cap ?? 500,
            current_rank: userState.current_rank || "Rookie Scout",
            unlocked_badges: mergedBadges,
          });
        });

        activeFeedback = null;
        processNextFeedback();
        return;
      }

      if (response.element_id) {
        const context = pendingTabMap.get(response.element_id);
        if (!context) {
          return;
        }

        const requestKey = context.requestKey;

        // Chống duplicate scan response
        if (requestKey && completedRequestKeys.has(requestKey)) {
          console.log(
            `[SafeHer Voice] Ignored duplicate scan response for requestKey: ${requestKey}`,
          );
          return;
        }

        // Xóa scan timeout
        if (activeTimeouts.has(response.element_id)) {
          clearTimeout(activeTimeouts.get(response.element_id));
          activeTimeouts.delete(response.element_id);
        }

        // SAVE TO GLOBAL CACHE before returning to the frontend
        cacheSuccessfulScan(context.text, response);

        // Đánh dấu completed trước khi gửi sang tab để tránh race condition
        cleanupRequestLifecycle(requestKey, "completed");

        const enrichedResponse = {
          ...response,
          message_type: "scan_response",
          tab_id: context.tabId,
          tab_name: context.tabName,
          page_url: context.pageUrl,
          page_session_id: context.pageSessionId,
          protection_session_id: context.protectionSessionId,
          timestamp: context.sourceTimestamp,
          request_key: context.requestKey,
        };

        chrome.tabs
          .sendMessage(context.tabId, enrichedResponse, {
            frameId: context.frameId,
          })
          .catch(() => {});
        pendingTabMap.delete(response.element_id);
      }
    } catch (error) {
      if (event.data !== "pong") {
        console.error(
          "[SafeHer Voice] Failed to parse WebSocket message:",
          error,
        );
      }
    }
  };

  ws.onclose = () => {
    if (socket === ws) {
      console.log(
        `[SafeHer Voice] Disconnected. Retrying in ${reconnectInterval / 1000}s...`,
      );
      chrome.storage.local.set({ safeher_ws_connected: false });

      if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
      }

      socket = null;

      setTimeout(connectWebSocket, reconnectInterval);

      reconnectInterval = Math.min(
        reconnectInterval * 2,
        MAX_RECONNECT_INTERVAL,
      );
    }
  };

  ws.onerror = (error) => {
    if (socket === ws) {
      console.warn("[SafeHer Voice] WebSocket error:", error);
      chrome.storage.local.set({ safeher_ws_connected: false });
    }
  };
}

// Start WebSocket connection at SW startup
connectWebSocket();

/**
 * Nhận message từ content script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const currentTabId = sender.tab && sender.tab.id ? sender.tab.id : 0;
  const currentFrameId = sender.frameId ?? 0;
  const currentTabName =
    request.tab_name || (sender.tab && sender.tab.title) || "";
  const currentTabUrl = (sender.tab && sender.tab.url) || "";
  const currentTimestamp = request.timestamp || Date.now();

  // Xử lý thông báo dọn dẹp stale request từ FE
  if (request.action === "cleanup_stale_request") {
    const requestKey = request.request_key;
    if (requestKey) {
      queuedRequestKeys.delete(requestKey);
      inFlightRequestKeys.delete(requestKey);
      completedRequestKeys.set(requestKey, {
        status: "stale",
        completedAt: Date.now(),
      });
      for (const [elementId, item] of pendingTabMap.entries()) {
        if (item.requestKey === requestKey) {
          if (activeTimeouts.has(elementId)) {
            clearTimeout(activeTimeouts.get(elementId));
            activeTimeouts.delete(elementId);
          }
          pendingTabMap.delete(elementId);
        }
      }
      for (let i = outboundQueue.length - 1; i >= 0; i--) {
        if (outboundQueue[i].requestKey === requestKey) {
          outboundQueue.splice(i, 1);
        }
      }
    }
    sendResponse({ success: true });
    return true;
  }

  /*
   * Quét text tự động hoặc manual scan từ scanner.js / tooltip.js.
   */
  if (request.action === "scan_text" || request.action === "manual_scan") {
    // INTERCEPT WITH CACHE CHECK FIRST
    const normalizedText = (request.text || "").trim().toLowerCase();
    if (globalScanCache.has(normalizedText)) {
      console.log(`[SafeHer Voice] CACHE HIT for: ${request.element_id}`);
      const cachedData = globalScanCache.get(normalizedText);

      // Return cache hit instantly to the tab
      chrome.tabs
        .sendMessage(
          currentTabId,
          {
            action: "scan_result",
            data: { ...cachedData, element_id: request.element_id },
          },
          { frameId: currentFrameId },
        )
        .catch(() => {});

      sendResponse({
        success: true,
        result: { accepted: true, status: "cache_hit" },
      });
      return true;
    }

    // If Cache Miss, proceed to WebSocket Pipeline
    const requestKey = buildRequestKey({
      action: "scan_text",
      tabId: currentTabId,
      frameId: currentFrameId,
      pageSessionId: request.page_session_id || "",
      protectionSessionId: request.protection_session_id || "",
      elementId: request.element_id,
    });

    if (
      queuedRequestKeys.has(requestKey) ||
      inFlightRequestKeys.has(requestKey)
    ) {
      sendResponse({
        success: true,
        result: { accepted: true, status: "already_queued" },
      });
      return true;
    }

    const context = {
      tabId: currentTabId,
      frameId: currentFrameId,
      tabName: currentTabName,
      pageUrl: currentTabUrl,
      pageSessionId: request.page_session_id || "",
      protectionSessionId: request.protection_session_id || "",
      sourceTimestamp: currentTimestamp,
      text: request.text,
      elementId: request.element_id,
      queuedAt: Date.now(),
      state: "queued",
      retryCount: 0,
      requestKey: requestKey,
      isManual: request.action === "manual_scan",
    };

    pendingTabMap.set(request.element_id, context);

    // CHỈ GỬI ĐÚNG SCHEMA CỦA BACKEND PYTHON
    const payload = {
      action: "scan_text",
      text: request.text,
      element_id: request.element_id,
      tab_name: currentTabName,
      timestamp: request.timestamp || Date.now(),
    };

    const result = sendScanPayload(payload, context);
    sendResponse({ success: true, result: result });
    return true;
  }

  /*
   * Gửi đánh giá/correction cho model (submit_feedback).
   */
  if (request.action === "submit_feedback") {
    const requestKey = buildRequestKey({
      action: "submit_feedback",
      tabId: currentTabId,
      frameId: currentFrameId,
      pageSessionId: request.page_session_id || "",
      protectionSessionId: request.protection_session_id || "",
      elementId: request.element_id,
    });

    if (
      queuedRequestKeys.has(requestKey) ||
      inFlightRequestKeys.has(requestKey)
    ) {
      sendResponse({
        success: true,
        result: { accepted: true, status: "already_queued" },
      });
      return true;
    }

    // CHỈ GỬI ĐÚNG SCHEMA SUBMIT_FEEDBACK BACKEND CẦN
    const payload = {
      action: "submit_feedback",
      user_id: request.user_id || "local_user",
      element_id: request.element_id,
      raw_text: request.raw_text,
      ai_toxicity_score: request.ai_toxicity_score,
      youth_severity_score: request.youth_severity_score,
      opt_in: request.opt_in ?? false,
    };

    const feedbackContext = {
      payload: payload,
      tabId: currentTabId,
      frameId: currentFrameId,
      elementId: request.element_id,
      pageSessionId: request.page_session_id || "",
      protectionSessionId: request.protection_session_id || "",
      createdAt: Date.now(),
      requestKey: requestKey,
      state: "queued",
    };

    queuedRequestKeys.add(requestKey);
    pendingFeedbackQueue.push(feedbackContext);

    processNextFeedback();
    connectWebSocket();

    sendResponse({
      success: true,
      result: { accepted: true, status: "queued" },
    });
    return true;
  }

  return false;
});

// ==========================================
// ORCHESTRATOR UPGRADE 2 & 3: Tab Hooks & Alarms
// ==========================================

// Auto-rescan when switching tabs
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && !tab.url.startsWith("chrome://")) {
      console.log(
        `[SafeHer Voice] Tab switched: ${tab.title}. Forcing rescan...`,
      );
      chrome.tabs
        .sendMessage(tab.id, { action: "force_rescan" })
        .catch(() => {});
    }
  });
});

// Auto-rescan periodically to catch quiet DOM updates
chrome.alarms.create("periodic_scan", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "periodic_scan") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith("chrome://")) {
        chrome.tabs
          .sendMessage(tabs[0].id, { action: "force_rescan" })
          .catch(() => {});
      }
    });
  }
});
