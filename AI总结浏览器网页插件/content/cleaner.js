(function () {
  "use strict";

  const KEYWORDS = {
    login: ["登录", "登陆", "sign in", "log in", "login", "注册", "register", "sign up", "signup"],
    cookie: [
      "cookie", "cookies", "gdpr", "隐私", "privacy",
      "我们使用 cookie", "we use cookie", "本网站使用", "this site uses",
      "接受", "accept", "同意", "consent", "数据分析"
    ],
    newsletter: [
      "subscribe", "newsletter", "订阅", "邮件", "email",
      "subscribe to our", "join our", "第一时间", "notify",
      "newsletter", "mailing list"
    ],
    ad: [
      "广告", "advertisement", "sponsored", "赞助",
      "推广", "promoted", "ad ", " ads", "-ad-",
      "google_ad", "doubleclick", "adsense"
    ]
  };

  const AD_SELECTORS = [
    "[id*='google_ads']", "[class*='google_ads']",
    "[id*='advertisement']", "[class*='advertisement']",
    "[class*='sponsored']", "[id*='sponsored']",
    "[data-ad]", "[data-advertisement]",
    "[aria-label*='广告']", "[aria-label*='advertisement']",
    "ins.adsbygoogle", "[id*='google_ads_iframe']"
  ];

  const COOKIE_SELECTORS = [
    "[id*='cookie']", "[class*='cookie']",
    "[id*='gdpr']", "[class*='gdpr']",
    "[id*='consent']", "[class*='consent']",
    "[aria-label*='cookie']", "[aria-label*='gdpr']",
    "[data-testid*='cookie']",
    "#onetrust-consent-sdk", "#CybotCookiebotDialog",
    ".cc-banner", ".cookie-banner", ".cookie-notice",
    "#cookie-law-info-bar", ".cookie-consent"
  ];

  function matchesKeywords(text, list) {
    const lower = text.toLowerCase();
    return list.some(kw => lower.includes(kw.toLowerCase()));
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && style.opacity !== "0"
      && el.offsetWidth > 0
      && el.offsetHeight > 0;
  }

  function isOverlay(el) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const zIndex = parseInt(style.zIndex) || 0;

    const coversViewport =
      rect.width >= window.innerWidth * 0.8 &&
      rect.height >= window.innerHeight * 0.5;

    const isFixed = style.position === "fixed" || style.position === "absolute";

    return isFixed && zIndex > 100 && coversViewport;
  }

  function isLoginModal(el) {
    const text = (el.textContent || "").trim().slice(0, 200);
    const hasLoginKeyword = matchesKeywords(text, KEYWORDS.login);
    const hasPasswordField = el.querySelector("input[type='password']");
    const hasEmailField = el.querySelector("input[type='email']");
    return (hasLoginKeyword && (hasPasswordField || hasEmailField)) || hasLoginKeyword;
  }

  function isCookieBanner(el) {
    const text = (el.textContent || "").trim().slice(0, 300);
    return matchesKeywords(text, KEYWORDS.cookie);
  }

  function isNewsletterPopup(el) {
    const text = (el.textContent || "").trim().slice(0, 200);
    const hasEmailInput = el.querySelector("input[type='email']");
    return matchesKeywords(text, KEYWORDS.newsletter) && !el.querySelector("input[type='password']");
  }

  function isAd(el) {
    const text = (el.textContent || "").trim().slice(0, 100);
    const tag = el.tagName.toLowerCase();

    for (const sel of AD_SELECTORS) {
      try { if (el.matches(sel) || el.closest(sel)) return true; } catch (_) {}
    }

    if (tag === "ins" && (el.className || "").includes("ad")) return true;

    if (el.hasAttribute("data-ad-client") || el.hasAttribute("data-ad-slot")) return true;

    return matchesKeywords(text, KEYWORDS.ad);
  }

  function removeElement(el) {
    if (el && el.parentNode && document.contains(el)) {
      el.remove();
    }
  }

  function restoreBodyScroll() {
    const html = document.documentElement;
    const body = document.body;
    const overflowStyles = ["hidden", "scroll", "clip"];
    if (overflowStyles.includes(html.style.overflow)) html.style.overflow = "";
    if (overflowStyles.includes(body.style.overflow)) body.style.overflow = "";
    html.style.position = "";
    body.style.position = "";
    html.style.width = "";
    body.style.width = "";
  }

  function scanAndClean() {
    restoreBodyScroll();

    const allElements = document.querySelectorAll("div, section, aside, dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true']");

    for (const el of allElements) {
      if (!document.contains(el) || !isVisible(el)) continue;

      if (isOverlay(el)) {
        if (isCookieBanner(el)) { removeElement(el); continue; }
        if (isLoginModal(el)) { removeElement(el); continue; }
        if (isNewsletterPopup(el)) { removeElement(el); continue; }
      }

      if (isAd(el)) { removeElement(el); continue; }
    }

    for (const sel of COOKIE_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (isVisible(el)) removeElement(el);
        });
      } catch (_) {}
    }

    for (const sel of AD_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (isVisible(el)) removeElement(el);
        });
      } catch (_) {}
    }
  }

  scanAndClean();

  const observer = new MutationObserver(() => {
    scanAndClean();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false
  });

  let debounceTimer;
  const debouncedObserver = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanAndClean, 500);
  });

  debouncedObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });
})();
