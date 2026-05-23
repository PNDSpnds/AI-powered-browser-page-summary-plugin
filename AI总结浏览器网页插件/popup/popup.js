const btn = document.getElementById("summarizeBtn");
const status = document.getElementById("status");
const optionsLink = document.getElementById("optionsLink");
const themeToggle = document.getElementById("themeToggle");

// ---- Theme ----
async function loadTheme() {
  const result = await chrome.storage.sync.get(["theme"]);
  applyTheme(result.theme || "light");
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
    themeToggle.innerHTML = "&#9789;";
    themeToggle.title = "切换亮色主题";
  } else {
    document.documentElement.classList.remove("dark");
    themeToggle.innerHTML = "&#9788;";
    themeToggle.title = "切换暗色主题";
  }
}

themeToggle.addEventListener("click", async () => {
  const isDark = document.documentElement.classList.contains("dark");
  const newTheme = isDark ? "light" : "dark";
  await chrome.storage.sync.set({ theme: newTheme });
  applyTheme(newTheme);
});

// ---- API Key check ----
async function checkApiKey() {
  const result = await chrome.storage.sync.get(["deepseekApiKey"]);
  if (!result.deepseekApiKey) {
    status.textContent = "请先设置 API Key";
    status.className = "status error";
    btn.disabled = true;
  }
}

// ---- Summarize ----
btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "处理中...";
  status.textContent = "";
  status.className = "status";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url?.startsWith("chrome://")) {
      status.textContent = "此页面不支持总结";
      status.className = "status error";
      return;
    }

    await chrome.runtime.sendMessage({ type: "summarize", tabId: tab.id });
    window.close();
  } catch (err) {
    status.textContent = err.message || "出错了";
    status.className = "status error";
    btn.disabled = false;
    btn.textContent = "AI 总结";
  }
});

optionsLink.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadTheme();
checkApiKey();
