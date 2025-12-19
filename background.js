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