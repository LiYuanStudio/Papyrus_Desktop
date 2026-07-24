/**
 * Content Script - 注入到页面的脚本
 * 
 * 可以获取页面内容，与页面交互
 */

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelection') {
    const selection = window.getSelection().toString();
    sendResponse({ selection });
  }
  
  if (request.action === 'getPageInfo') {
    sendResponse({
      title: document.title,
      url: location.href,
      selection: window.getSelection().toString(),
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || '',
        author: document.querySelector('meta[name="author"]')?.content || ''
      }
    });
  }
  
  return true;
});

console.log('📓 Papyrus Web Clipper 已加载');
