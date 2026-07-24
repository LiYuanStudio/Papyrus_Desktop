// 弹出窗口脚本

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const buttons = document.querySelectorAll('button');
  
  function setButtonsEnabled(enabled) {
    buttons.forEach(btn => btn.disabled = !enabled);
  }
  
  function showResult(text, isError = false) {
    resultEl.textContent = text;
    resultEl.style.display = 'block';
    resultEl.style.color = isError ? '#dc3545' : '#333';
  }
  
  // 检查连接
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkConnection' });
    if (response.connected) {
      statusEl.textContent = '✅ 已连接到 Papyrus';
      statusEl.className = 'status connected';
      setButtonsEnabled(true);
    } else {
      statusEl.textContent = '❌ 无法连接到 Papyrus';
      statusEl.className = 'status disconnected';
    }
  } catch (error) {
    statusEl.textContent = '❌ 扩展错误: ' + error.message;
    statusEl.className = 'status disconnected';
  }
  
  // 保存当前页面
  document.getElementById('btnClipPage').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clipPage' });
      if (response.success) {
        showResult(`✅ 已保存! ID: ${response.data.id}`);
      } else {
        showResult('❌ 保存失败: ' + response.error, true);
      }
    } catch (error) {
      showResult('❌ 错误: ' + error.message, true);
    }
  });
  
  // 保存选中内容
  document.getElementById('btnClipSelection').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clipSelection' });
      if (response.success) {
        showResult(`✅ 已保存选中内容! ID: ${response.data.id}`);
      } else {
        showResult('❌ 保存失败: ' + response.error, true);
      }
    } catch (error) {
      showResult('❌ 错误: ' + error.message, true);
    }
  });
  
  // 快速笔记
  document.getElementById('btnQuickNote').addEventListener('click', async () => {
    const text = prompt('输入快速笔记内容:');
    if (!text) return;
    
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'quickNote',
        text: text 
      });
      if (response.success) {
        showResult(`✅ 已创建快速笔记! ID: ${response.data.id}`);
      } else {
        showResult('❌ 创建失败: ' + response.error, true);
      }
    } catch (error) {
      showResult('❌ 错误: ' + error.message, true);
    }
  });
  
  // 查看笔记列表
  document.getElementById('btnListNotes').addEventListener('click', async () => {
    try {
      // 打开 Papyrus 应用
      chrome.tabs.create({ url: 'http://127.0.0.1:8000' });
    } catch (error) {
      showResult('❌ 错误: ' + error.message, true);
    }
  });
});
