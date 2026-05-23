async function getApiKey() {
  const result = await chrome.storage.sync.get(["deepseekApiKey", "deepseekBaseUrl"]);
  return {
    key: result.deepseekApiKey || "",
    baseUrl: result.deepseekBaseUrl || "https://api.deepseek.com"
  };
}

async function getTheme() {
  const result = await chrome.storage.sync.get(["theme"]);
  return result.theme || "light";
}

async function callDeepSeekAPI(pageContent, apiKey, baseUrl) {
  const systemPrompt = `你是一个网页内容总结助手。用户会给你一个网页的标题和正文内容，请你做以下事情：

1. **一句话总结**：用一句话概括这个页面的核心内容（不超过50字）
2. **关键要点**：提取3-8个关键要点，每个要点一行，用列表形式
3. **详细总结**：用2-4段话详细总结页面内容（总字数不超过500字）

请使用以下格式输出：
---
## 一句话总结
（内容）

## 关键要点
- 要点1
- 要点2
...

## 详细总结
（内容）
---

请用中文输出总结，除非原文是英文且用户要求英文。如果页面内容为空或无意义，直接说明。`;

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `标题：${pageContent.title}\n\n正文内容：${pageContent.text}` }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`API 请求失败 (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "（API 返回为空）";
}

// ======= Message handler =======

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "summarize" && message.tabId) {
    handleSummarize(message.tabId).catch(err => {
      console.error("Summarize error:", err);
    });
  }
});

async function handleSummarize(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.url?.startsWith("chrome://")) return;

    const { key, baseUrl } = await getApiKey();
    if (!key) {
      const theme = await getTheme();
      await chrome.scripting.executeScript({
        target: { tabId },
        func: showError,
        args: ["请先设置 DeepSeek API Key：右键扩展图标 → 选项", theme]
      });
      return;
    }

    // Step 1: Clean the page (remove overlays, banners, etc.)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/cleaner.js"]
    });

    // Step 2: Extract content — before replacing the page
    const extractResults = await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/extract.js"]
    });

    const pageContent = extractResults[0]?.result;

    if (pageContent?.isDebug) {
      const theme = await getTheme();
      await chrome.scripting.executeScript({
        target: { tabId },
        func: showDebug,
        args: [{ title: pageContent.title, debugText: pageContent.text, url: tab.url, theme }]
      });
      return;
    }

    if (!pageContent || !pageContent.text || pageContent.text.length < 50) {
      const textLen = (pageContent?.text || "").length;
      const hint = textLen === 0
        ? "无法从该页面提取任何文字内容。可能原因：页面需要登录后才能查看内容、内容通过 Shadow DOM 或 iframe 动态加载、或页面为纯图片/视频页面。"
        : `仅提取到 ${textLen} 个字符，不足以生成有意义的总结。页面可能主要是图片、视频，或正文被登录墙完全隐藏。`;
      const theme = await getTheme();
      await chrome.scripting.executeScript({
        target: { tabId },
        func: showError,
        args: [hint, theme]
      });
      return;
    }

    // Step 2: Show loading screen while calling API
    const theme = await getTheme();
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showLoading,
      args: [theme]
    });

    const summary = await callDeepSeekAPI(pageContent, key, baseUrl);

    await chrome.scripting.executeScript({
      target: { tabId },
      func: showSummary,
      args: [{ title: pageContent.title, url: tab.url, summary, theme }]
    });
  } catch (err) {
    const theme = await getTheme().catch(() => "light");
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showError,
      args: [err.message || "未知错误", theme]
    });
  }
}

// ======= Injected page functions =======

function showLoading(theme) {
  var css = ':root{--bg:#f8f9fa;--card-bg:#fff;--text:#1a1a2e;--text-secondary:#666;--text-muted:#999;--border:#eef2ff;--pre-bg:#f1f5f9;--accent:#4f46e5;--error-bg:#fef2f2;--btn-sec-bg:#eef2ff;--btn-sec-text:#4f46e5}:root.dark{--bg:#1a1a2e;--card-bg:#16213e;--text:#e0e0e0;--text-secondary:#aaa;--text-muted:#777;--border:#2a2a4a;--pre-bg:#0f0f23;--accent:#7c3aed;--error-bg:#2a1215;--btn-sec-bg:#2a2a4a;--btn-sec-text:#a78bfa}';
  var icon = theme === 'dark' ? '&#9789;' : '&#9788;';
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.innerHTML = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>AI 页面净化器</title><style>'+css+'*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);display:flex;align-items:center;justify-content:center;min-height:100vh;transition:background .3s}.loading-box{text-align:center}.spinner{width:48px;height:48px;border:4px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}p{color:var(--text-secondary);font-size:16px}.theme-toggle{position:fixed;top:16px;right:16px;width:36px;height:36px;border:none;border-radius:50%;cursor:pointer;font-size:18px;background:var(--card-bg);box-shadow:0 1px 4px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;transition:background .3s;z-index:9999}.theme-toggle:hover{background:var(--border)}</style></head><body><button class="theme-toggle" onclick="(function(){var h=document.documentElement;h.classList.toggle(\'dark\');var t=h.classList.contains(\'dark\')?\'dark\':\'light\';localStorage.setItem(\'ai-theme\',t);this.innerHTML=t===\'dark\'?\'&#9789;\':\'&#9788;\'})()" title="切换主题">'+icon+'</button><div class="loading-box"><div class="spinner"></div><p>AI 正在总结页面内容...</p></div></body></html>';
}

function showError(message, theme) {
  var css = ':root{--bg:#f8f9fa;--card-bg:#fff;--text:#1a1a2e;--text-secondary:#666;--text-muted:#999;--border:#eef2ff;--pre-bg:#f1f5f9;--accent:#4f46e5;--error-bg:#fef2f2;--btn-sec-bg:#eef2ff;--btn-sec-text:#4f46e5}:root.dark{--bg:#1a1a2e;--card-bg:#16213e;--text:#e0e0e0;--text-secondary:#aaa;--text-muted:#777;--border:#2a2a4a;--pre-bg:#0f0f23;--accent:#7c3aed;--error-bg:#2a1215;--btn-sec-bg:#2a2a4a;--btn-sec-text:#a78bfa}';
  // Read current theme from DOM to respect any user toggle during loading
  var currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  var icon = currentTheme === 'dark' ? '&#9789;' : '&#9788;';
  function esc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
  document.documentElement.classList.toggle('dark', currentTheme === 'dark');
  document.documentElement.innerHTML = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>出错了</title><style>'+css+'*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--error-bg);display:flex;align-items:center;justify-content:center;min-height:100vh;transition:background .3s}.error-box{background:var(--card-bg);border-radius:12px;padding:40px;max-width:480px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;transition:background .3s}.icon{font-size:48px;margin-bottom:16px}h2{color:#dc2626;margin-bottom:12px;font-size:20px}p{color:var(--text-secondary);line-height:1.6;font-size:15px;word-break:break-word}.btn{display:inline-block;margin-top:20px;padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px}.btn:hover{opacity:.9}.theme-toggle{position:fixed;top:16px;right:16px;width:36px;height:36px;border:none;border-radius:50%;cursor:pointer;font-size:18px;background:var(--card-bg);box-shadow:0 1px 4px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;transition:background .3s;z-index:9999}.theme-toggle:hover{background:var(--border)}</style></head><body><button class="theme-toggle" onclick="(function(){var h=document.documentElement;h.classList.toggle(\'dark\');var t=h.classList.contains(\'dark\')?\'dark\':\'light\';localStorage.setItem(\'ai-theme\',t);this.innerHTML=t===\'dark\'?\'&#9789;\':\'&#9788;\'})()" title="切换主题">'+icon+'</button><div class="error-box"><div class="icon">&#9888;</div><h2>出错了</h2><p>'+esc(message)+'</p><button class="btn" onclick="location.reload()">返回原页面</button></div></body></html>';
}

function showDebug({ title, debugText, url, theme }) {
  var icon = theme === 'dark' ? '&#9789;' : '&#9788;';
  function esc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
  var lines = debugText.split("\n").map(function(l) { return '<div class="line">'+l.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</div>'; }).join("");
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.innerHTML = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Debug - '+esc(title)+'</title><style>body{font-family:"Fira Code","JetBrains Mono",monospace;background:#1a1a2e;color:#e0e0e0;padding:32px 20px}.container{max-width:800px;margin:0 auto}h1{color:#7c3aed;margin-bottom:4px;font-size:18px}.url{color:#888;font-size:12px;margin-bottom:24px;word-break:break-all}.card{background:#16213e;border-radius:12px;padding:24px 28px}.line{font-size:13px;line-height:1.8;padding:2px 0;border-bottom:1px solid #1e2d4a;word-break:break-all}.actions{margin-top:20px;display:flex;gap:12px}.btn{padding:10px 20px;border:none;border-radius:10px;font-size:14px;cursor:pointer;background:#4f46e5;color:white}.btn:hover{opacity:.9}.theme-toggle{position:fixed;top:16px;right:16px;width:36px;height:36px;border:none;border-radius:50%;cursor:pointer;font-size:18px;background:#16213e;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;z-index:9999}.theme-toggle:hover{background:#2a2a4a}</style></head><body><button class="theme-toggle" onclick="(function(){var h=document.documentElement;h.classList.toggle(\'dark\');var t=h.classList.contains(\'dark\')?\'dark\':\'light\';localStorage.setItem(\'ai-theme\',t);this.innerHTML=t===\'dark\'?\'&#9789;\':\'&#9788;\'})()" title="切换主题">'+icon+'</button><div class="container"><h1>Diagnostic Output</h1><div class="url">'+esc(url)+'</div><div class="card">'+lines+'</div><div class="actions"><button class="btn" onclick="location.reload()">返回原页面</button></div></div></body></html>';
}

function showSummary({ title, url, summary, theme }) {
  var css = ':root{--bg:#f8f9fa;--card-bg:#fff;--text:#1a1a2e;--text-secondary:#666;--text-muted:#999;--border:#eef2ff;--pre-bg:#f1f5f9;--accent:#4f46e5;--error-bg:#fef2f2;--btn-sec-bg:#eef2ff;--btn-sec-text:#4f46e5}:root.dark{--bg:#1a1a2e;--card-bg:#16213e;--text:#e0e0e0;--text-secondary:#aaa;--text-muted:#777;--border:#2a2a4a;--pre-bg:#0f0f23;--accent:#7c3aed;--error-bg:#2a1215;--btn-sec-bg:#2a2a4a;--btn-sec-text:#a78bfa}';
  // Read current theme from DOM to respect any user toggle during loading
  var currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  var icon = currentTheme === 'dark' ? '&#9789;' : '&#9788;';
  function esc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
  document.documentElement.classList.toggle('dark', currentTheme === 'dark');

  var safeHtml = summary
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```(\w*)\n?/g, "<pre><code>").replace(/```/g, "</code></pre>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.*)/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/## (.*)/g, "<h2>$1</h2>").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");

  var domain = '';
  try { domain = new URL(url).hostname; } catch(e) { domain = url; }

  document.documentElement.innerHTML = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>'+esc(title)+' - AI 总结</title><style>'+css+'*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.7;transition:background .3s,color .3s}.container{max-width:720px;margin:0 auto;padding:32px 20px 60px}.header{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;border-radius:16px;padding:28px 32px;margin-bottom:24px;box-shadow:0 4px 24px rgba(79,70,229,.2);position:relative}.header .label{font-size:12px;text-transform:uppercase;letter-spacing:2px;opacity:.8;margin-bottom:6px}.header h1{font-size:22px;font-weight:700;line-height:1.4}.header .meta{margin-top:10px;font-size:13px;opacity:.75}.header .meta a{color:white}.card{background:var(--card-bg);border-radius:12px;padding:24px 28px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.04);transition:background .3s}.card h2{font-size:16px;color:var(--accent);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);display:flex;align-items:center;gap:8px;transition:color .3s,border-color .3s}.summary-content{color:var(--text);font-size:15px}.summary-content p{margin-bottom:12px}.summary-content ul{padding-left:20px;margin-bottom:12px}.summary-content li{margin-bottom:4px}.summary-content strong{color:var(--accent)}.summary-content pre{background:var(--pre-bg);border-radius:8px;padding:12px 16px;overflow-x:auto;font-size:13px;margin-bottom:12px;transition:background .3s}.summary-content code{font-family:"JetBrains Mono","Fira Code",monospace;font-size:13px}.actions{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;align-items:center}.btn{padding:10px 20px;border:none;border-radius:10px;font-size:14px;cursor:pointer;font-weight:500;transition:all .15s}.btn-primary{background:var(--accent);color:white}.btn-primary:hover{opacity:.9;transform:translateY(-1px)}.btn-secondary{background:var(--btn-sec-bg);color:var(--btn-sec-text);text-decoration:none;display:inline-block}.btn-secondary:hover{opacity:.8}.footer{text-align:center;color:var(--text-muted);font-size:12px;margin-top:32px}.theme-toggle{position:fixed;top:16px;right:16px;width:40px;height:40px;border:none;border-radius:50%;cursor:pointer;font-size:20px;background:var(--card-bg);box-shadow:0 2px 8px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;transition:all .3s;z-index:9999}.theme-toggle:hover{background:var(--border);transform:scale(1.08)}</style></head><body><button class="theme-toggle" onclick="(function(){var h=document.documentElement;h.classList.toggle(\'dark\');var t=h.classList.contains(\'dark\')?\'dark\':\'light\';localStorage.setItem(\'ai-theme\',t);this.innerHTML=t===\'dark\'?\'&#9789;\':\'&#9788;\'})()" title="切换主题">'+icon+'</button><div class="container"><div class="header"><div class="label">AI 总结</div><h1>'+esc(title)+'</h1><div class="meta">来源：<a href="'+esc(url)+'">'+esc(domain)+'</a></div></div><div class="card"><h2>总结内容</h2><div class="summary-content"><p>'+(safeHtml || '(暂无总结内容)')+'</p></div></div><div class="actions"><button class="btn btn-primary" onclick="location.reload()">返回原页面</button><a class="btn btn-secondary" href="'+esc(url)+'" target="_blank">在新标签页打开原文</a></div><div class="footer">Powered by DeepSeek AI &middot; AI 页面净化器</div></div></body></html>';
}
