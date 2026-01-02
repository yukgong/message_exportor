// popup_controller.js
// popup_controller.js
console.log("[popup_controller] injected:", location.href);

const norm = (s) => (s || "")
  .replace(/\u00A0/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

function buildKey(room, group) {
  room = norm(room);
  group = norm(group);
  if (!room || !group) return null;
  return `${room}__${group}`; // room-first 고정
}

function waitFor(getter, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const v0 = getter();
    if (v0) return resolve(v0);

    const mo = new MutationObserver(() => {
      const v = getter();
      if (v) {
        mo.disconnect();
        resolve(v);
      } else if (Date.now() - start > timeoutMs) {
        mo.disconnect();
        resolve(null);
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function getActiveChatContainer() {
  let el = document.activeElement;

  // activeElement가 body인 경우가 있어서, 마지막으로 클릭한 패널을 기억하는 fallback도 추가할 예정
  if (!el) return null;

  // 내부 요소(버튼/입력창 등)에서 부모로 올라가며 chat-container 찾기
  const container = el.closest?.(".chat-container");
  return container || null;
}

function getRoomAndGroupFromChatMonitor() {
  const container = getActiveChatContainer();
  if (!container) {
    console.log("[popup_controller] no active chat-container (activeElement=", document.activeElement, ")");
    return null;
  }

  // container 내부의 헤더에서만 추출 (오탐 방지)
  const header = container.querySelector("div.d_flex.ai_center.jc_space-between.gap_8px.flex-d_row.p_4px_8px.h_40px");
  if (!header) return null;

  const room = header.querySelector("p.MDSText--variant_subtitle3-B span")?.textContent?.trim() || "";
  const group = header.querySelector("p.MDSText--variant_chat-small-text-R span")?.textContent?.trim() || "";
  if (!room || !group) return null;

  return { room, group };
}


/**
 * ✅ chat-monitor 헤더에서 {room, group} 추출
 * - room: p.MDSText--variant_subtitle3-B span  (강현경)
 * - group: p.MDSText--variant_chat-small-text-R span (test)
 */
function getRoomAndGroupFromChatMonitorHeader() {
  // ✅ 현재 열린 채팅 패널의 헤더에서만 찾기 위한 앵커
  const moreBtn = document.querySelector("#chat-header-more-menu-button");
  if (!moreBtn) return null;

  // moreBtn이 포함된 헤더 컨테이너로 범위를 좁힘
  const header =
    moreBtn.closest("div.d_flex.ai_center.jc_space-between") ||
    moreBtn.parentElement?.parentElement ||
    null;

  if (!header) return null;

  // ✅ 네가 준 HTML 구조 그대로
  const room = header.querySelector("p.MDSText--variant_subtitle3-B span")?.textContent?.trim() || "";
  const group = header.querySelector("p.MDSText--variant_chat-small-text-R span")?.textContent?.trim() || "";

  if (!room || !group) return null;
  return { room, group };
}


/**
 * ✅ student-info 팝업에서 {room, group} 추출
 * 우선 URL의 title=test / 강현경 사용 (가장 안정)
 */
function getRoomAndGroupFromStudentInfoTitleParam() {
  try {
    const u = new URL(location.href);
    const title = (u.searchParams.get("title") || "").trim(); 
    if (!title) return null;

    const m = title.match(/(.+?)\s*\/\s*(.+)/);
    if (!m) return null;

    const group = m[1].trim();
    const room = m[2].trim();
    if (!room || !group) return null;

    return { room, group };
  } catch {
    return null;
  }
}

/**
 * student-info에서 title 파라미터가 없을 때 fallback
 */
function getRoomAndGroupFromStudentInfoDom() {
  const text = (document.querySelector("header")?.textContent || document.title || "").trim();
  const m = text.match(/(.+?)\s*\/\s*(.+)/);
  if (!m) return null;
  return { group: m[1].trim(), room: m[2].trim() };
}

function makeKeySync() {
  if (location.pathname === "/chat-monitor") {
    const rg = getRoomAndGroupFromChatMonitorHeader();
    return rg ? buildKey(rg.room, rg.group) : null;
  }
  if (location.pathname === "/student-info") {
    const rg = getRoomAndGroupFromStudentInfoTitleParam() || getRoomAndGroupFromStudentInfoDom();
    return rg ? buildKey(rg.room, rg.group) : null;
  }
  return null;
}

// bg에서 호출용
window.__CHAT_POPUP_KEY__ = () => {
  if (location.pathname !== "/chat-monitor") return null;
  const rg = getRoomAndGroupFromChatMonitor();
  const key = rg ? buildKey(rg.room, rg.group) : null;
  console.log("[popup_controller] chat-monitor key =", key, rg);
  return key;
};


/**
 * ✅ “팝업 모니터링” 메뉴 클릭으로 팝업 열기
 * - 더보기 버튼 id가 고정: #chat-header-more-menu-button
 * - 메뉴 item은 텍스트 포함("팝업 모니터링")으로 찾기
 */
window.__OPEN_CHAT_POPUP__ = async () => {
  if (location.pathname !== "/chat-monitor") return;

  const container = getActiveChatContainer();
  if (!container) return console.log("[popup_controller] no active container for opening popup");

  // ✅ container 내부에서만 더보기 버튼 찾기 (id 중복 방지)
  const moreBtn =
    container.querySelector("#chat-header-more-menu-button") ||
    container.querySelector('button[aria-haspopup="true"]');

  if (!moreBtn) return console.log("[popup_controller] moreBtn not found in active container");

  moreBtn.click();
  await new Promise(r => setTimeout(r, 200));

  const popupItem = Array.from(document.querySelectorAll("div[role='menuitem'], button, li, a"))
    .find(el => (el.textContent || "").includes("팝업 모니터링"));

  if (!popupItem) return console.log("[popup_controller] popup menu item not found");

  (popupItem.closest("div[role='menuitem'], button, li, a") || popupItem).click();
};

/**
 * ✅ student-info 팝업이면 bg에 등록
 */
(async function registerIfStudentInfoPopup() {
  if (location.pathname !== "/student-info") return;

  let rg = getRoomAndGroupFromStudentInfoTitleParam();
  if (!rg) rg = await waitFor(getRoomAndGroupFromStudentInfoDom, 8000);

  const key = rg ? buildKey(rg.room, rg.group) : null;
  if (!key) {
    console.log("[popup_controller] cannot build key for student-info");
    return;
  }

  chrome.runtime.sendMessage({ type: "REGISTER_POPUP", key }, (res) => {
    console.log("[popup_controller] REGISTER_POPUP key =", key, res);
  });
})();


// 팝업 열기 단축키
window.addEventListener("keydown", function(event) {
  // 'PageDown' 키인지 확인
  if (event.key === "PageDown") {
    
    // 1. 브라우저의 기본 Page Down 동작(스크롤 내려감)을 막고 싶다면 아래 줄 주석 해제
    event.preventDefault(); 

    // 2. 백그라운드로 '팝업 열기' 신호 전송
    chrome.runtime.sendMessage({ action: "trigger-chat-popup" });
  }
});