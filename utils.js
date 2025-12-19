// utils.js - 유틸리티 함수 모음

// ============================================================
// 템플릿 치환 관련 함수들
// ============================================================

/**
 * 한글 마지막 글자에 받침(종성)이 있는지 확인
 * @param {string} char - 확인할 글자
 * @returns {boolean} 받침이 있으면 true
 */
function hasJongseong(char) {
    if (!char) return false;
    const code = char.charCodeAt(0);
    // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
    if (code < 0xAC00 || code > 0xD7A3) return false;
    return (code - 0xAC00) % 28 !== 0;
}

/**
 * 이름에서 끝 두글자 추출 (이름이 2글자면 그대로)
 * @param {string} name - 전체 이름
 * @returns {string} 끝 두글자
 */
function getNameLastTwo(name) {
    if (!name) return '';
    const trimmed = name.trim();
    if (trimmed.length <= 2) return trimmed;
    return trimmed.slice(-2);
}

/**
 * 템플릿 변수 치환 함수
 * {{name.full}}, {{name.part.hard}} 등의 변수를 실제 값으로 치환
 * @param {string} text - 템플릿 텍스트
 * @param {object} variables - 치환할 변수 객체
 * @returns {string} 치환된 텍스트
 */
function replaceTemplateVariables(text, variables) {
    // {{name.xxx}} 형식 지원
    return text.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
        // 점(.)으로 분리된 키 처리
        const keys = key.split('.');
        let value = variables;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return match; // 키를 찾지 못하면 원본 유지
            }
        }
        
        return value !== undefined ? value : match;
    });
}

/**
 * 현재 사용 가능한 모든 템플릿 변수 반환
 * @param {Element} fromElement - 컨텍스트 요소 (선택사항)
 * @returns {object} 변수 객체
 */
function getTemplateVariables(fromElement) {
    const { name } = getChatRoomInfo(fromElement);
    const fullName = name || '학생';
    const lastTwo = getNameLastTwo(fullName);
    const lastChar = lastTwo.slice(-1);
    
    return {
        name: {
            // {{name.full}} : 이름 전체
            full: fullName,
            part: {
                // {{name.part.hard}} : 끝 두글자 + " 학생"
                hard: lastTwo + ' 학생',
                // {{name.part.sweet}} : 끝 두글자 + 받침에 따라 "아/야"
                sweet: lastTwo + (hasJongseong(lastChar) ? '아' : '야'),
                // {{name.part.plain}} : 끝 두글자 + 받침에 따라 "밀당이/은서"
                plain: lastTwo + (hasJongseong(lastChar) ? '이' : ''),
            }
        }
    };
}

/**
 * 편집 가능한 요소인지 확인
 * @param {Element} el - 확인할 요소
 * @returns {boolean}
 */
function isEditableElement(el) {
    if (!el) return false;
    return el.isContentEditable || 
           el.tagName === 'INPUT' || 
           el.tagName === 'TEXTAREA' ||
           el.getAttribute('role') === 'textbox';
}

// ============================================================
// 템플릿 저장/관리 (chrome.storage)
// ============================================================

const DEFAULT_TEMPLATES = [
    { id: 1, name: '인사 (풀네임)', text: '{{name.full}}님, 밀당PT에 오신 것을 환영합니다.', shortcut:'1' }
];

/**
 * 저장된 템플릿 목록 가져오기
 * @returns {Promise<Array>}
 */
async function getTemplates() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['templates'], (result) => {
                if (result.templates && result.templates.length > 0) {
                    resolve(result.templates);
                } else {
                    // 처음 사용시 기본 템플릿 저장
                    saveTemplates(DEFAULT_TEMPLATES);
                    resolve(DEFAULT_TEMPLATES);
                }
            });
        } else {
            // chrome.storage 없을 경우 localStorage 사용
            const stored = localStorage.getItem('chat_templates');
            if (stored) {
                resolve(JSON.parse(stored));
            } else {
                localStorage.setItem('chat_templates', JSON.stringify(DEFAULT_TEMPLATES));
                resolve(DEFAULT_TEMPLATES);
            }
        }
    });
}

/**
 * 템플릿 목록 저장
 * @param {Array} templates
 */
async function saveTemplates(templates) {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ templates }, resolve);
        } else {
            localStorage.setItem('chat_templates', JSON.stringify(templates));
            resolve();
        }
    });
}

/**
 * 새 템플릿 추가
 * @param {string} name - 템플릿 이름
 * @param {string} text - 템플릿 내용
 * @param {string} shortcut - 단축키 (선택사항)
 */
async function addTemplate(name, text, shortcut = '') {
    const templates = await getTemplates();
    const newId = Math.max(...templates.map(t => t.id), 0) + 1;
    const newTemplate = { id: newId, name, text };
    if (shortcut) newTemplate.shortcut = shortcut;
    templates.push(newTemplate);
    await saveTemplates(templates);
    return templates;
}

/**
 * 템플릿 삭제
 * @param {number} id - 삭제할 템플릿 ID
 */
async function deleteTemplate(id) {
    const templates = await getTemplates();
    const filtered = templates.filter(t => t.id !== id);
    await saveTemplates(filtered);
    return filtered;
}

/**
 * 템플릿 수정
 * @param {number} id - 수정할 템플릿 ID
 * @param {string} name - 새 이름
 * @param {string} text - 새 내용
 * @param {string} shortcut - 단축키 (선택사항)
 */
async function updateTemplate(id, name, text, shortcut = '') {
    const templates = await getTemplates();
    const idx = templates.findIndex(t => t.id === id);
    if (idx !== -1) {
        const updated = { id, name, text };
        if (shortcut) updated.shortcut = shortcut;
        templates[idx] = updated;
    }
    await saveTemplates(templates);
    return templates;
}

// ============================================================
// 토스트 알림
// ============================================================

/**
 * 토스트 메시지 표시
 * @param {string} message - 표시할 메시지
 * @param {string} type - 'success' | 'info' | 'warning'
 * @param {number} duration - 표시 시간 (ms)
 */
function showToast(message, type = 'success', duration = 2500) {
    // 기존 토스트 제거
    const existingToast = document.getElementById('template-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'template-toast';
    
    const bgColors = {
        success: '#E1F4EC',
        info: '#E4F3FF',
        warning: '#FFF0E5'
    };
    
    toast.innerHTML = `
        <span style="margin-right: 8px;">✨</span>
        <span>${message}</span>
    `;
    
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: ${bgColors[type] || bgColors.success};
        color: #000;
        padding: 14px 24px;
        border-radius: 12px;
        z-index: 999999;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4);
        display: flex;
        align-items: center;
        animation: slideInToast 0.3s ease-out;
    `;
    
    // 애니메이션 스타일 추가
    if (!document.getElementById('toast-animation-style')) {
        const style = document.createElement('style');
        style.id = 'toast-animation-style';
        style.textContent = `
            @keyframes slideInToast {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOutToast {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutToast 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
