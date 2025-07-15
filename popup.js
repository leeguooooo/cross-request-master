'use strict';

// DOM 元素
const elements = {
  allowAll: null,
  domainList: null,
  newDomain: null,
  addBtn: null,
  status: null,
  securityWarning: null,
  // 请求历史相关元素
  historyList: null,
  clearHistory: null,
  curlOutput: null,
  curlCommand: null,
  copyCurl: null
};

// 当前域名列表
let currentDomains = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] 开始初始化');
  
  // 获取 DOM 元素
  elements.allowAll = document.getElementById('allowAll');
  elements.domainList = document.getElementById('domainList');
  elements.newDomain = document.getElementById('newDomain');
  elements.addBtn = document.getElementById('addBtn');
  elements.status = document.getElementById('status');
  elements.securityWarning = document.getElementById('securityWarning');
  
  // 请求历史相关元素
  elements.historyList = document.getElementById('historyList');
  elements.clearHistory = document.getElementById('clearHistory');
  elements.curlOutput = document.getElementById('curlOutput');
  elements.curlCommand = document.getElementById('curlCommand');
  elements.copyCurl = document.getElementById('copyCurl');

  console.log('[Popup] DOM 元素获取完成');

  // 加载域名列表和请求历史
  loadDomains();
  loadRequestHistory();

  // 绑定事件
  elements.allowAll.addEventListener('change', handleAllowAllChange);
  elements.addBtn.addEventListener('click', handleAddDomain);
  elements.newDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddDomain();
    }
  });
  
  // 请求历史相关事件
  elements.clearHistory.addEventListener('click', handleClearHistory);
  elements.copyCurl.addEventListener('click', handleCopyCurl);
  
  
  
  console.log('[Popup] 初始化完成');
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

// 请求历史相关功能

// 显示调试信息
function showDebugInfo(message) {
  const debugInfo = document.getElementById('debugInfo');
  const debugText = document.getElementById('debugText');
  if (debugInfo && debugText) {
    debugInfo.style.display = 'block';
    debugText.innerHTML = message;
  }
}

// 加载请求历史
function loadRequestHistory() {
  console.log('[Popup] 开始加载请求历史');
  showDebugInfo('正在加载请求历史...');
  
  // 从 Chrome 存储读取历史记录
  chrome.storage.local.get(['requestHistory'], (result) => {
    console.log('[Popup] Chrome 存储读取结果:', result);
    
    if (chrome.runtime.lastError) {
      console.error('[Popup] Chrome 存储读取错误:', chrome.runtime.lastError);
      showDebugInfo('Chrome 存储读取错误: ' + chrome.runtime.lastError.message);
      elements.historyList.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
      return;
    }

    const chromeHistory = result.requestHistory || [];
    showDebugInfo(`Chrome 存储: ${chromeHistory.length} 条记录<br>等待 content script 同步数据...`);
    
    // 先显示已有的数据
    renderRequestHistory(chromeHistory);
    
    // 如果 Chrome 存储中没有数据，等待 3 秒后重新检查
    if (chromeHistory.length === 0) {
      setTimeout(() => {
        chrome.storage.local.get(['requestHistory'], (result2) => {
          if (!chrome.runtime.lastError) {
            const newHistory = result2.requestHistory || [];
            if (newHistory.length > 0) {
              showDebugInfo(`Chrome 存储: ${newHistory.length} 条记录（已同步）`);
              renderRequestHistory(newHistory);
            } else {
              showDebugInfo(`Chrome 存储: 0 条记录（同步后仍为空）`);
            }
          }
        });
      }, 3000);
    }
  });
}

// 渲染请求历史
function renderRequestHistory(history) {
  if (history.length === 0) {
    elements.historyList.innerHTML = '<div class="empty-state">暂无请求记录</div>';
    return;
  }

  elements.historyList.innerHTML = history.map((request, index) => {
    const timestamp = new Date(request.timestamp).toLocaleString();
    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-url">${escapeHtml(request.url)}</div>
          <div class="history-meta">
            <span class="history-method ${request.method}">${request.method}</span>
            <span class="history-time">${timestamp}</span>
          </div>
        </div>
        <button class="generate-curl-btn" data-index="${index}">生成 cURL</button>
      </div>
    `;
  }).join('');

  // 绑定生成 cURL 按钮事件
  document.querySelectorAll('.generate-curl-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      generateCurlFromHistory(history[index]);
    });
  });
}

// 从历史记录生成 cURL 命令
function generateCurlFromHistory(request) {
  const curl = generateCurlCommand(request.url, request.method, request.headers, request.body);
  
  // 显示生成的命令
  elements.curlCommand.textContent = curl;
  elements.curlOutput.style.display = 'block';
  
  showStatus('cURL 命令生成成功', 'success');
}

// 生成 cURL 命令字符串
function generateCurlCommand(url, method, headers, body) {
  let curl = `curl -X ${method}`;
  
  // 添加请求头
  if (headers && typeof headers === 'object') {
    Object.entries(headers).forEach(([key, value]) => {
      // 过滤掉空值
      if (value && value.trim && value.trim() !== '') {
        curl += ` \\\n  -H "${key}: ${value}"`;
      }
    });
  }
  
  // 添加请求体（只有非 GET 请求且有数据时才添加）
  if (body && (method !== 'GET' && method !== 'DELETE')) {
    // 如果 body 是对象，转换为 JSON 字符串
    let bodyStr = body;
    if (typeof body === 'object') {
      bodyStr = JSON.stringify(body);
    }
    curl += ` \\\n  -d '${bodyStr}'`;
  }
  
  // 添加 URL（放在最后）
  curl += ` \\\n  "${url}"`;
  
  return curl;
}

// 清空请求历史
function handleClearHistory() {
  chrome.storage.local.remove(['requestHistory'], () => {
    if (chrome.runtime.lastError) {
      console.error('[Popup] 清空历史失败:', chrome.runtime.lastError);
      showStatus('清空失败: ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    
    console.log('[Popup] 请求历史已清空');
    elements.historyList.innerHTML = '<div class="empty-state">暂无请求记录</div>';
    elements.curlOutput.style.display = 'none';
    showStatus('请求历史已清空', 'success');
  });
}

// 复制 cURL 命令到剪贴板
function handleCopyCurl() {
  const curlText = elements.curlCommand.textContent;
  
  // 使用 Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(curlText).then(() => {
      showStatus('cURL 命令已复制到剪贴板', 'success');
    }).catch(() => {
      // 降级到旧的复制方法
      fallbackCopy(curlText);
    });
  } else {
    // 降级到旧的复制方法
    fallbackCopy(curlText);
  }
}

// 降级复制方法
function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    document.execCommand('copy');
    showStatus('cURL 命令已复制到剪贴板', 'success');
  } catch (e) {
    showStatus('复制失败，请手动复制', 'error');
  } finally {
    document.body.removeChild(textarea);
  }
}

