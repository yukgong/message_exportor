// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. 배율 설정 요청
    if (request.action === "SET_ZOOM") {
        if (sender.tab && sender.tab.id) {
            
            // ★ 핵심 변경 사항: 줌 설정을 'per-tab'으로 변경
            // 이렇게 하면 같은 사이트를 여러 개 띄워도 '이 탭'만 배율이 바뀝니다.
            chrome.tabs.setZoomSettings(sender.tab.id, { scope: 'per-tab' }, () => {
                if (chrome.runtime.lastError) {
                    console.error("줌 설정 변경 실패:", chrome.runtime.lastError);
                    return;
                }
                // 설정 변경 후 실제 줌 적용
                chrome.tabs.setZoom(sender.tab.id, request.zoomFactor);
            });
        }
    } 
    
    // 2. 현재 배율 조회 요청
    else if (request.action === "GET_ZOOM") {
        if (sender.tab && sender.tab.id) {
            chrome.tabs.getZoom(sender.tab.id, (zoomFactor) => {
                sendResponse({ zoomFactor: zoomFactor });
            });
            return true; // 비동기 응답 필수
        }
    }
});


// ======================
// 팝업 인덱스 (key -> popup tab/window)
// ======================
// background.js (MV3 service worker)

const popupIndex = new Map(); // key -> { tabId, windowId, lastSeen }

function log(...args) {
  console.log("[bg]", ...args);
}

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

async function ensurePopupForCurrentChat() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const key = await getKeyFromTab(tab.id);
  if (!key) {
    log("key is null on", tab.url);
    return;
  }

  const cached = popupIndex.get(key);
  if (cached) {
    try {
      const t = await chrome.tabs.get(cached.tabId);
      if (t?.id) {
        log("focus existing popup:", key, cached);
        await focusPopup(t.id, t.windowId);
        return;
      }
    } catch (_) {
      popupIndex.delete(key);
    }
  }

  log("no popup found for key. opening via menu click:", key);
  await openPopupFromChatTab(tab.id);
}

// 아이콘/단축키
chrome.action.onClicked.addListener(() => ensurePopupForCurrentChat());
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "ensure-chat-popup") ensurePopupForCurrentChat();
});

// 메시지 처리: 팝업 등록 + 기존 줌
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 팝업 등록
  if (request?.type === "REGISTER_POPUP" && request.key && sender.tab?.id != null && sender.tab.windowId != null) {
    popupIndex.set(request.key, {
      tabId: sender.tab.id,
      windowId: sender.tab.windowId,
      lastSeen: Date.now()
    });
    log("REGISTER_POPUP", request.key, "=>", popupIndex.get(request.key));
    sendResponse?.({ ok: true });
    return;
  }

  // ===== 기존 줌 기능 =====
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

  if (request.action === "GET_ZOOM") {
    if (sender.tab && sender.tab.id) {
      chrome.tabs.getZoom(sender.tab.id, (zoomFactor) => {
        sendResponse({ zoomFactor });
      });
      return true;
    }
  }
});

// 팝업 탭 닫히면 매핑 정리
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [key, v] of popupIndex.entries()) {
    if (v.tabId === tabId) popupIndex.delete(key);
  }
});
