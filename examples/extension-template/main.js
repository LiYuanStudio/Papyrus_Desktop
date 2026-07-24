/**
 * Papyrus 扩展示例 - JavaScript/浏览器版本
 * 
 * 这是一个完整的浏览器扩展示例，展示了如何使用 Papyrus MCP API。
 */

class PapyrusClient {
  constructor(baseUrl = 'http://127.0.0.1:8000') {
    this.baseUrl = baseUrl;
    this.apiUrl = `${baseUrl}/api`;
  }

  async checkConnection() {
    try {
      const r = await fetch(`${this.apiUrl}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      const data = await r.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  async listNotes() {
    const r = await fetch(`${this.apiUrl}/mcp/notes`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return data.notes;
  }

  async getNote(noteId) {
    const r = await fetch(`${this.apiUrl}/mcp/notes/${noteId}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async createNote(title, content, tags = []) {
    const r = await fetch(`${this.apiUrl}/mcp/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async updateNote(noteId, updates) {
    const r = await fetch(`${this.apiUrl}/mcp/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async searchNotes(query, limit = 10) {
    const r = await fetch(`${this.apiUrl}/mcp/notes/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        search_content: true, 
        limit 
      })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return data.results;
  }

  async renderMarkdown(content) {
    const r = await fetch(`${this.apiUrl}/markdown/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return data.html;
  }
}

/**
 * Web Clipper 扩展
 * 
 * 保存当前网页到 Papyrus
 */
class WebClipperExtension {
  EXTENSION_TAG = 'web-clipper';

  constructor(client) {
    this.client = client;
  }

  async clipCurrentPage() {
    const title = document.title;
    const url = location.href;
    const selection = window.getSelection().toString();
    
    const content = `# ${title}

**来源:** ${url}  
**剪藏时间:** ${new Date().toLocaleString()}

---

## 选中内容

${selection || '*无选中内容*'}

## 页面信息

- **URL:** ${url}
- **标题:** ${title}
`;

    const result = await this.client.createNote(
      title,
      content,
      [this.EXTENSION_TAG, 'web', location.hostname]
    );
    
    return result;
  }

  async clipSelection() {
    const selection = window.getSelection().toString();
    if (!selection.trim()) {
      throw new Error('没有选中文本');
    }

    const content = `## 来自: ${document.title}

${selection}

---

原文: ${location.href}
`;

    const result = await this.client.createNote(
      `剪藏: ${document.title.substring(0, 50)}`,
      content,
      [this.EXTENSION_TAG, 'selection']
    );
    
    return result;
  }
}

/**
 * 快速笔记扩展
 * 
 * 创建快速笔记到 Papyrus
 */
class QuickNoteExtension {
  EXTENSION_TAG = 'quick-note';

  constructor(client) {
    this.client = client;
  }

  async createQuickNote(text) {
    const timestamp = new Date().toLocaleString();
    
    const content = `# 快速笔记

**时间:** ${timestamp}

${text}
`;

    const result = await this.client.createNote(
      `快速笔记 ${new Date().toLocaleTimeString()}`,
      content,
      [this.EXTENSION_TAG, 'quick']
    );
    
    return result;
  }
}

// ===== 浏览器扩展集成示例 =====

// 如果是浏览器扩展环境
if (typeof chrome !== 'undefined' && chrome.runtime) {
  
  // 后台脚本
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const client = new PapyrusClient();
    
    (async () => {
      try {
        switch (request.action) {
          case 'clipPage':
            const clipper = new WebClipperExtension(client);
            const result = await clipper.clipCurrentPage();
            sendResponse({ success: true, data: result });
            break;
            
          case 'clipSelection':
            const selClipper = new WebClipperExtension(client);
            const selResult = await selClipper.clipSelection();
            sendResponse({ success: true, data: selResult });
            break;
            
          case 'quickNote':
            const quick = new QuickNoteExtension(client);
            const noteResult = await quick.createQuickNote(request.text);
            sendResponse({ success: true, data: noteResult });
            break;
            
          case 'checkConnection':
            const connected = await client.checkConnection();
            sendResponse({ connected });
            break;
            
          default:
            sendResponse({ error: 'Unknown action' });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    
    return true; // 保持消息通道开放
  });

  // 上下文菜单（右键菜单）
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'clipSelection',
      title: '保存到 Papyrus',
      contexts: ['selection']
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'clipSelection') {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      }, (results) => {
        const text = results[0].result;
        const client = new PapyrusClient();
        const quick = new QuickNoteExtension(client);
        quick.createQuickNote(text);
      });
    }
  });
}

// ===== 控制台测试代码 =====

async function demo() {
  console.log('🚀 Papyrus 扩展示例 (JavaScript)');
  console.log('='.repeat(40));
  
  const client = new PapyrusClient();
  
  // 检查连接
  console.log('\n📡 检查 Papyrus 连接...');
  const connected = await client.checkConnection();
  if (!connected) {
    console.error('❌ 错误: 无法连接到 Papyrus');
    return;
  }
  console.log('✅ 已连接到 Papyrus');
  
  // 获取笔记列表
  console.log('\n📝 获取笔记列表...');
  try {
    const notes = await client.listNotes();
    console.log(`   共有 ${notes.length} 篇笔记`);
    notes.slice(0, 3).forEach(note => {
      console.log(`   - ${note.title}`);
    });
  } catch (e) {
    console.error('   获取失败:', e.message);
  }
  
  // 创建测试笔记
  console.log('\n✏️ 创建测试笔记...');
  try {
    const result = await client.createNote(
      'JS 扩展测试笔记',
      '# 测试\n\n来自 JavaScript 扩展的测试笔记',
      ['js-extension', 'test']
    );
    console.log(`   已创建: ${result.id}`);
  } catch (e) {
    console.error('   创建失败:', e.message);
  }
  
  console.log('\n✅ 演示完成!');
}

// 如果在浏览器控制台中运行，自动执行 demo
if (typeof window !== 'undefined' && !chrome?.runtime) {
  window.PapyrusClient = PapyrusClient;
  window.WebClipperExtension = WebClipperExtension;
  window.QuickNoteExtension = QuickNoteExtension;
  window.papyrusDemo = demo;
  
  console.log('💡 提示: 运行 papyrusDemo() 开始演示');
}
