(function () {
  "use strict";

  // ---- Pre-processing ----
  function runPreprocessing() {
    // Click "expand" / "read more" buttons
    const triggers = [
      "展开", "阅读全文", "阅读更多", "显示全部", "展开全文",
      "read more", "show more", "expand", "查看全部", "继续阅读",
      "展开阅读", "打开全文", "view more", "see more"
    ];
    document.querySelectorAll("button, a, span, div, [role='button']").forEach(el => {
      const text = (el.textContent || "").trim().toLowerCase();
      if (triggers.some(t => text.includes(t))) {
        try { el.click(); } catch (_) {}
      }
    });

    // Remove overlay/mask layers (may block reading, cleaner.js may have missed them)
    document.querySelectorAll("[class*='overlay'], [class*='mask'], [class*='modal'], [class*='Modal'], [class*='dialog']").forEach(el => {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex) || 0;
      if (zIndex > 100 && (style.position === "fixed" || style.position === "absolute")) {
        try { el.remove(); } catch (_) {}
      }
    });

    // Unlock scrolling
    ["hidden", "clip"].forEach(v => {
      if (document.documentElement.style.overflow === v) document.documentElement.style.overflow = "";
      if (document.body.style.overflow === v) document.body.style.overflow = "";
    });
    document.documentElement.style.position = "";
    document.body.style.position = "";
  }

  runPreprocessing();

  // ---- Title extraction ----
  function getTitle() {
    const og = document.querySelector("meta[property='og:title']");
    if (og && og.getAttribute("content")) return og.getAttribute("content").trim();
    const h1 = document.querySelector("h1");
    if (h1) return h1.textContent.trim();
    return (document.title || "").trim();
  }

  // ---- Main approach: clone body → strip junk → grab text ----
  // Tags that are always junk (remove entirely from clone)
  const REMOVE_TAGS = [
    "script", "style", "noscript", "iframe", "svg", "canvas",
    "video", "audio", "object", "embed", "template",
    "input", "textarea", "select", "button", "option", "datalist",
    "link", "meta", "code", "pre"
  ];

  // Structural junk selectors
  const REMOVE_SELECTORS = [
    "nav", "[role='navigation']",
    "footer", "[role='contentinfo']",
    "header", "[role='banner']",
    "aside", "[role='complementary']",
    ".comments", ".comment-list", ".comment-area", ".post-comments",
    "#comments", "[id*='comment']",
    ".sidebar", ".side-bar", ".related-posts", ".recommended",
    ".you-may-like", ".read-next", ".also-read",
    ".advertisement", ".ad", ".sponsored", ".promo", "[class*='ad-']",
    ".share-buttons", ".social-share", ".post-actions",
    ".breadcrumb", ".pagination", ".toc", ".table-of-contents",
    ".nav", ".navbar", ".navigation", ".menu",
    ".cookie", ".gdpr", ".consent-banner", "#onetrust-consent-sdk",
    ".newsletter", ".subscribe", ".signup",
    "[class*='banner']", "[class*='popup']", "[class*='overlay']"
  ];

  function getAllText() {
    // Clone body and strip junk
    const clone = document.body.cloneNode(true);

    REMOVE_TAGS.forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });

    REMOVE_SELECTORS.forEach(sel => {
      try {
        clone.querySelectorAll(sel).forEach(el => {
          // Don't remove if it has substantial paragraph content
          const pCount = el.querySelectorAll("p").length;
          if (pCount >= 3) return;
          el.remove();
        });
      } catch (_) {}
    });

    // Remove elements with display:none in their inline style
    clone.querySelectorAll("*").forEach(el => {
      try {
        const style = el.getAttribute("style") || "";
        if (/display\s*:\s*none/i.test(style)) {
          const textLen = (el.textContent || "").trim().length;
          if (textLen < 200) el.remove();
        }
      } catch (_) {}
    });

    const text = (clone.textContent || "");

    return text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/^\s+|\s+$/gm, "")
      .trim();
  }

  // ---- Fallback: direct TreeWalker (no filtering) ----
  function getDirectText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.replace(/^\s+|\s+$/g, "");
      if (t.length > 0) parts.push(t);
    }
    return parts.join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ---- Execute ----
  try {
    const title = getTitle();

    let text = getAllText();

    if (text.length < 50) {
      text = getDirectText();
    }

    if (text.length >= 50) {
      return { title, text: text.slice(0, 30000) };
    }

    return { title, text: "" };
  } catch (err) {
    return { title: document.title || "", text: "" };
  }
})();
