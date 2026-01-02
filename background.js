// background.js

function log(...args) {
  console.log("[bg]", ...args);
}

// ========== 스토리지 기반 popupIndex ==========

async function getPopupIndex() {
  const { popupIndex = {} } = await chrome.storage.session.get('popupIndex');
  return new Map(Object.entries(popupIndex));
}

async function setPopupIndex(map) {
  await chrome.storage.session.set({ popupIndex: Object.fromEntries(map) });
}

async function registerPopup(key, tabId, windowId) {
  const index = await getPopupIndex();
  index.set(key, { tabId, windowId, lastSeen: Date.now() });
  await setPopupIndex(index);
  log("REGISTER_POPUP", key, "=>", { tabId, windowId });
}

async function getPopup(key) {
  const index = await getPopupIndex();
  return index.get(key);
}

async function deletePopup(key) {
  const index = await getPopupIndex();
  index.delete(key);
  await setPopupIndex(index);
}

async function deletePopupByTabId(tabId) {
  const index = await getPopupIndex();
  for (const [key, v] of index.entries()) {
    if (v.tabId === tabId) index.delete(key);
  }
  await setPopupIndex(index);
}

// ========== 유틸 함수 ==========

async function focusPopup(tabId, windowId) {
  await chrome.windows.update(windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getKeyFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__CHAT_POPUP_KEY__?.() || null
  });
  return result;
}

async function openPopupFromChatTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__OPEN_CHAT_POPUP__?.()
  });
}

// ========== 메인 로직 ==========

async function ensurePopupForCurrentChat() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const key = await getKeyFromTab(tab.id);
  if (!key) {
    log("key is null on", tab.url);
    return;
  }

  const cached = await getPopup(key);
  if (cached) {
    try {
      const t = await chrome.tabs.get(cached.tabId);
      if (t?.id) {
        log("focus existing popup:", key, cached);
        await focusPopup(t.id, t.windowId);
        return;
      }
    } catch (_) {
      await deletePopup(key);
    }
  }

  log("no popup found for key. opening via menu click:", key);
  await openPopupFromChatTab(tab.id);
}

// ========== 이벤트 리스너 (단축키/아이콘) ==========

chrome.action.onClicked.addListener(() => ensurePopupForCurrentChat());
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "ensure-chat-popup") ensurePopupForCurrentChat();
});

// ========== 메시지 처리 ==========

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 팝업 등록
  if (request?.type === "REGISTER_POPUP" && request.key && sender.tab?.id != null) {
    registerPopup(request.key, sender.tab.id, sender.tab.windowId)
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  // 줌 설정
  if (request.action === "SET_ZOOM") {
    if (sender.tab && sender.tab.id) {
      chrome.tabs.setZoomSettings(sender.tab.id, { scope: "per-tab" }, () => {
        if (chrome.runtime.lastError) {
          console.error("줌 설정 변경 실패:", chrome.runtime.lastError);
          return;
        }
        chrome.tabs.setZoom(sender.tab.id, request.zoomFactor);
      });
    }
    return;
  }

  // 줌 조회
  if (request.action === "GET_ZOOM") {
    if (sender.tab && sender.tab.id) {
      chrome.tabs.getZoom(sender.tab.id, (zoomFactor) => {
        sendResponse({ zoomFactor });
      });
      return true;
    }
  }
});

// 탭 닫힘 시 정리
chrome.tabs.onRemoved.addListener((tabId) => {
  deletePopupByTabId(tabId);
});