'use strict';

// DOM 元素
const elements = {
  status: null,
  openIssuesBtn: null
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] 开始初始化');

  // 获取 DOM 元素
  elements.status = document.getElementById('status');
  elements.openIssuesBtn = document.getElementById('open-issues-btn');

  console.log('[Popup] DOM 元素获取完成');

  // 强制设置允许所有域名（后台处理）
  chrome.storage.local.set({ allowedDomains: ['*'] }, () => {
    console.log('[Popup] 已设置允许所有域名');
    showStatus('扩展已启用，支持所有域名跨域请求', 'success');
  });

  // 绑定事件
  if (elements.openIssuesBtn) {
    elements.openIssuesBtn.addEventListener('click', () => {
      const url = 'https://github.com/leeguooooo/cross-request-master/issues';
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        try {
          location.href = url;
        } catch (e2) {
          // ignore
        }
      }
    });
  }

  console.log('[Popup] 初始化完成');
});

// 显示状态信息
function showStatus(message, type = 'info', duration = 3000) {
  console.log('[Popup] 显示状态:', { message, type });

  elements.status.textContent = message;
  elements.status.className = `status ${type}`;

  // 自动隐藏
  setTimeout(() => {
    elements.status.style.display = 'none';
  }, duration);
}

// HTML 转义
// function _escapeHtml(text) {
//   const div = document.createElement('div');
//   div.textContent = text;
//   return div.innerHTML;
// }

// 不再支持 cURL 弹窗开关/永久关闭，相关状态逻辑已移除
