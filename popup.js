'use strict';

// DOM 元素
const elements = {
  allowAll: null,
  domainList: null,
  newDomain: null,
  addBtn: null,
  status: null,
  securityWarning: null
};

// 当前域名列表
let currentDomains = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 获取 DOM 元素
  elements.allowAll = document.getElementById('allowAll');
  elements.domainList = document.getElementById('domainList');
  elements.newDomain = document.getElementById('newDomain');
  elements.addBtn = document.getElementById('addBtn');
  elements.status = document.getElementById('status');
  elements.securityWarning = document.getElementById('securityWarning');

  // 加载域名列表
  loadDomains();

  // 绑定事件
  elements.allowAll.addEventListener('change', handleAllowAllChange);
  elements.addBtn.addEventListener('click', handleAddDomain);
  elements.newDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddDomain();
    }
  });
});

// 加载域名列表
function loadDomains() {
  console.log('[Popup] 开始加载域名列表');
  
  // 直接从存储读取，避免 Service Worker 消息传递问题
  chrome.storage.local.get(['allowedDomains'], (result) => {
    console.log('[Popup] 存储读取结果:', result);
    
    if (chrome.runtime.lastError) {
      console.error('[Popup] 存储读取错误:', chrome.runtime.lastError);
      showStatus('加载失败: ' + chrome.runtime.lastError.message, 'error');
      elements.domainList.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
      return;
    }

    console.log('[Popup] 解析域名列表:', result.allowedDomains);
    currentDomains = result.allowedDomains || ['*']; // 默认允许所有域名
    renderDomains();
    
    // 更新允许所有域名的复选框状态
    const hasWildcard = currentDomains.includes('*');
    elements.allowAll.checked = hasWildcard;
    elements.securityWarning.style.display = hasWildcard ? 'block' : 'none';
    
    // 如果允许所有域名，禁用添加功能
    updateAddControls(!hasWildcard);
    
    console.log('[Popup] 域名列表加载完成');
  });
}

// 渲染域名列表
function renderDomains() {
  if (currentDomains.length === 0 || (currentDomains.length === 1 && currentDomains[0] === '*')) {
    elements.domainList.innerHTML = '<div class="empty-state">暂无特定域名限制</div>';
    return;
  }

  const filteredDomains = currentDomains.filter(d => d !== '*');
  elements.domainList.innerHTML = filteredDomains.map(domain => `
    <div class="domain-item">
      <span class="domain-name">${escapeHtml(domain)}</span>
      <button class="delete-btn" data-domain="${escapeHtml(domain)}">删除</button>
    </div>
  `).join('');

  // 绑定删除按钮事件
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', handleDeleteDomain);
  });
}

// 处理允许所有域名复选框变化
function handleAllowAllChange(e) {
  const allowAll = e.target.checked;
  
  if (allowAll) {
    // 设置为允许所有域名
    saveDomains(['*']);
    elements.securityWarning.style.display = 'block';
    showStatus('已设置为允许所有域名', 'success');
  } else {
    // 清空域名列表
    saveDomains([]);
    elements.securityWarning.style.display = 'none';
    showStatus('已清除所有域名', 'success');
  }
  
  updateAddControls(!allowAll);
}

// 处理添加域名
function handleAddDomain() {
  const domain = elements.newDomain.value.trim();
  
  if (!domain) {
    showStatus('请输入域名', 'error');
    return;
  }

  // 验证域名格式
  if (!isValidDomain(domain)) {
    showStatus('域名格式不正确', 'error');
    return;
  }

  // 检查是否已存在
  if (currentDomains.includes(domain)) {
    showStatus('该域名已存在', 'error');
    return;
  }

  // 添加域名
  const newDomains = currentDomains.filter(d => d !== '*');
  newDomains.push(domain);
  saveDomains(newDomains);
  
  elements.newDomain.value = '';
  showStatus('域名添加成功', 'success');
}

// 处理删除域名
function handleDeleteDomain(e) {
  const domain = e.target.dataset.domain;
  const newDomains = currentDomains.filter(d => d !== domain);
  saveDomains(newDomains);
  showStatus('域名已删除', 'success');
}

// 保存域名列表
function saveDomains(domains) {
  console.log('[Popup] 保存域名列表:', domains);
  
  // 直接保存到存储，避免 Service Worker 消息传递问题
  chrome.storage.local.set({ allowedDomains: domains }, () => {
    if (chrome.runtime.lastError) {
      console.error('[Popup] 保存失败:', chrome.runtime.lastError);
      showStatus('保存失败: ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    
    console.log('[Popup] 保存成功');
    currentDomains = domains;
    renderDomains();
    
    // 通知 background script 更新内存中的域名列表
    chrome.runtime.sendMessage({
      action: 'reloadAllowedDomains'
    }).catch(() => {
      // 忽略通知失败，因为域名已经保存到存储了
      console.log('[Popup] 通知 background script 失败，但域名已保存');
    });
  });
}

// 验证域名格式
function isValidDomain(domain) {
  // 支持通配符子域名
  if (domain.startsWith('*.')) {
    domain = domain.substring(2);
  }
  
  // 基本的域名验证正则
  const domainRegex = /^([a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.)*[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) || 
         /^localhost(:\d+)?$/.test(domain) || 
         /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(domain);
}

// 显示状态消息
function showStatus(message, type) {
  elements.status.textContent = message;
  elements.status.className = 'status ' + type;
  
  setTimeout(() => {
    elements.status.className = 'status';
  }, 3000);
}

// 更新添加控件状态
function updateAddControls(enabled) {
  elements.newDomain.disabled = !enabled;
  elements.addBtn.disabled = !enabled;
  
  if (!enabled) {
    elements.newDomain.placeholder = '允许所有域名时无法添加特定域名';
  } else {
    elements.newDomain.placeholder = '输入域名，如: *.example.com';
  }
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}