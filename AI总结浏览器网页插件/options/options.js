const apiKeyInput = document.getElementById("apiKey");
const baseUrlInput = document.getElementById("baseUrl");
const saveBtn = document.getElementById("saveBtn");
const toast = document.getElementById("toast");

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.className = "toast" + (isError ? " error" : "");
  setTimeout(() => {
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  }, 10);
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(["deepseekApiKey", "deepseekBaseUrl"]);
  if (result.deepseekApiKey) apiKeyInput.value = result.deepseekApiKey;
  if (result.deepseekBaseUrl) baseUrlInput.value = result.deepseekBaseUrl;
}

async function saveSettings() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showToast("请输入 API Key", true);
    return;
  }
  if (!key.startsWith("sk-")) {
    showToast("API Key 格式可能不正确，应以 sk- 开头", true);
    return;
  }
  const baseUrl = baseUrlInput.value.trim() || "https://api.deepseek.com";
  await chrome.storage.sync.set({
    deepseekApiKey: key,
    deepseekBaseUrl: baseUrl
  });
  showToast("设置已保存");
}

saveBtn.addEventListener("click", saveSettings);
loadSettings();
