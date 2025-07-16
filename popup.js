'use strict';

// DOM 元素
const elements = {
  status: null,
  // 请求历史相关元素
  historyList: null,
  clearHistory: null,
  curlOutput: null,
  curlCommand: null,
  copyCurl: null
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] 开始初始化');
  
  // 获取 DOM 元素
  elements.status = document.getElementById('status');
  
  // 请求历史相关元素
  elements.historyList = document.getElementById('historyList');
  elements.clearHistory = document.getElementById('clearHistory');
  elements.curlOutput = document.getElementById('curlOutput');
  elements.curlCommand = document.getElementById('curlCommand');
  elements.copyCurl = document.getElementById('copyCurl');

  console.log('[Popup] DOM 元素获取完成');

  // 强制设置允许所有域名（后台处理）
  chrome.storage.local.set({ allowedDomains: ['*'] }, () => {
    console.log('[Popup] 已设置允许所有域名');
  });

  // 加载请求历史
  loadRequestHistory();

  // 绑定事件
  elements.clearHistory.addEventListener('click', handleClearHistory);
  elements.copyCurl.addEventListener('click', handleCopyCurl);
  
  console.log('[Popup] 初始化完成');
});

// 显示状态消息
function showStatus(message, type) {
  elements.status.textContent = message;
  elements.status.className = 'status ' + type;
  
  setTimeout(() => {
    elements.status.className = 'status';
  }, 3000);
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 请求历史相关功能

// 加载请求历史
function loadRequestHistory() {
  console.log('[Popup] 开始加载请求历史');
  
  // 从 Chrome 存储读取历史记录
  chrome.storage.local.get(['requestHistory'], (result) => {
    console.log('[Popup] Chrome 存储读取结果:', result);
    
    if (chrome.runtime.lastError) {
      console.error('[Popup] Chrome 存储读取错误:', chrome.runtime.lastError);
      elements.historyList.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
      return;
    }

    const chromeHistory = result.requestHistory || [];
    
    // 先显示已有的数据
    renderRequestHistory(chromeHistory);
    
    // 如果 Chrome 存储中没有数据，等待 3 秒后重新检查
    if (chromeHistory.length === 0) {
      setTimeout(() => {
        chrome.storage.local.get(['requestHistory'], (result2) => {
          if (!chrome.runtime.lastError) {
            const newHistory = result2.requestHistory || [];
            if (newHistory.length > 0) {
              renderRequestHistory(newHistory);
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