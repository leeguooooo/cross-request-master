'use strict';

// DOM 元素
const elements = {
  status: null,
  enableCurlBtn: null
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] 开始初始化');
  
  // 获取 DOM 元素
  elements.status = document.getElementById('status');
  elements.enableCurlBtn = document.getElementById('enable-curl-btn');

  console.log('[Popup] DOM 元素获取完成');

  // 强制设置允许所有域名（后台处理）
  chrome.storage.local.set({ allowedDomains: ['*'] }, () => {
    console.log('[Popup] 已设置允许所有域名');
    showStatus('扩展已启用，支持所有域名跨域请求', 'success');
  });
  
  // 加载 cURL 弹窗设置状态
  loadCurlDisplaySettings();
  
  // 绑定事件
  elements.enableCurlBtn.addEventListener('click', handleEnableCurl);
  
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
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 加载 cURL 弹窗设置状态
function loadCurlDisplaySettings() {
  try {
    chrome.runtime.sendMessage({
      action: 'getCurlDisplayDisabled'
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Popup] 获取 cURL 显示状态失败:', chrome.runtime.lastError);
        // 默认为未禁用状态（启用）
        updateCurlButtonState(false);
        return;
      }
      
      const isDisabled = response && response.disabled;
      console.log('[Popup] cURL 显示状态:', isDisabled ? '已禁用' : '已启用');
      updateCurlButtonState(isDisabled);
    });
  } catch (error) {
    console.error('[Popup] 发送消息失败:', error);
    // 默认为未禁用状态（启用）
    updateCurlButtonState(false);
  }
}

// 更新 cURL 按钮状态
function updateCurlButtonState(isDisabled) {
  if (isDisabled) {
    elements.enableCurlBtn.textContent = '启用弹窗';
    elements.enableCurlBtn.className = 'btn btn-success';
    elements.enableCurlBtn.disabled = false;
  } else {
    elements.enableCurlBtn.textContent = '已启用';
    elements.enableCurlBtn.className = 'btn btn-primary';
    elements.enableCurlBtn.disabled = true;
  }
}

// 处理启用 cURL 弹窗
function handleEnableCurl() {
  // 先更新 UI 状态，提供即时反馈
  elements.enableCurlBtn.disabled = true;
  elements.enableCurlBtn.textContent = '启用中...';
  
  try {
    chrome.runtime.sendMessage({
      action: 'setCurlDisplayDisabled',
      disabled: false
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Popup] 启用 cURL 显示失败:', chrome.runtime.lastError);
        showStatus('启用失败，请重试', 'error');
        // 恢复按钮状态
        updateCurlButtonState(true);
        return;
      }
      
      if (response && response.success) {
        console.log('[Popup] cURL 显示已启用');
        updateCurlButtonState(false);
        showStatus('cURL 弹窗已启用', 'success');
      } else {
        console.warn('[Popup] 未收到成功响应:', response);
        showStatus('启用可能失败，请检查扩展状态', 'error');
        // 恢复按钮状态
        updateCurlButtonState(true);
      }
    });
  } catch (error) {
    console.error('[Popup] 发送消息失败:', error);
    showStatus('发送消息失败，请重试', 'error');
    // 恢复按钮状态
    updateCurlButtonState(true);
  }
}