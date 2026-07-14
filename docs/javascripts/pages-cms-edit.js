const pagesCms = {
  baseUrl: "https://app.pagescms.org/Zizhe-Wang01/Zizhe-Wang01.github.io/main",
  editing: false,
  leftPage: false,
  baseline: null,
  pollTimer: null,
  focusHandlerInstalled: false
};

const pagesCmsCollections = [
  ["docs/ai/", "ai_notes"],
  ["docs/robotics/", "robotics_notes"],
  ["docs/notes/", "general_notes"]
];

function getPagesCmsUrl(path) {
  if (path === "docs/index.md") {
    return `${pagesCms.baseUrl}/file/home`;
  }

  const collection = pagesCmsCollections.find(([prefix]) => path.startsWith(prefix));
  if (!collection) return pagesCms.baseUrl;

  return `${pagesCms.baseUrl}/collection/${collection[1]}/edit/${encodeURIComponent(path)}`;
}

function getEditPath(link) {
  const url = new URL(link.href);
  const marker = "/edit/main/";
  const index = url.pathname.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.pathname.slice(index + marker.length));
}

async function fetchArticleHtml() {
  const url = new URL(window.location.href);
  url.searchParams.set("cms-check", Date.now().toString());

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const page = new DOMParser().parseFromString(html, "text/html");
  return page.querySelector(".md-content__inner")?.innerHTML.trim() ?? "";
}

function showCmsStatus(message) {
  let status = document.querySelector(".cms-sync-status");
  if (!status) {
    status = document.createElement("div");
    status.className = "cms-sync-status";
    status.setAttribute("role", "status");
    document.body.appendChild(status);
  }
  status.textContent = message;
}

function stopCmsPolling(message) {
  if (pagesCms.pollTimer) window.clearTimeout(pagesCms.pollTimer);
  pagesCms.pollTimer = null;
  pagesCms.editing = false;
  pagesCms.leftPage = false;

  if (message) {
    showCmsStatus(message);
    window.setTimeout(() => document.querySelector(".cms-sync-status")?.remove(), 4000);
  }
}

async function pollForPublishedEdit(attempt = 0) {
  if (!pagesCms.editing) return;

  try {
    const current = await fetchArticleHtml();
    if (pagesCms.baseline && current !== pagesCms.baseline) {
      showCmsStatus("内容已发布，正在刷新...");
      window.setTimeout(() => window.location.reload(), 500);
      return;
    }
  } catch (_) {
    // A deployment can briefly make the page unavailable; retry below.
  }

  if (attempt >= 30) {
    stopCmsPolling("暂未检测到新版本，可稍后手动刷新");
    return;
  }

  showCmsStatus("正在等待新内容发布...");
  pagesCms.pollTimer = window.setTimeout(() => pollForPublishedEdit(attempt + 1), 4000);
}

function enablePagesCmsEditing() {
  document.querySelectorAll('a[rel="edit"]').forEach((link) => {
    if (link.dataset.pagesCmsEnabled === "true") return;

    const path = getEditPath(link);
    if (!path) return;

    link.href = getPagesCmsUrl(path);
    link.target = "_blank";
    link.rel = "edit noopener";
    link.title = "在 Pages CMS 中编辑";
    link.dataset.pagesCmsEnabled = "true";

    link.addEventListener("click", async () => {
      pagesCms.editing = true;
      pagesCms.leftPage = false;
      pagesCms.baseline = null;
      document.querySelector(".cms-sync-status")?.remove();

      try {
        pagesCms.baseline = await fetchArticleHtml();
      } catch (_) {
        pagesCms.baseline = null;
      }
    });
  });

  if (pagesCms.focusHandlerInstalled) return;
  pagesCms.focusHandlerInstalled = true;

  window.addEventListener("blur", () => {
    if (pagesCms.editing) pagesCms.leftPage = true;
  });

  window.addEventListener("focus", () => {
    if (!pagesCms.editing || !pagesCms.leftPage || pagesCms.pollTimer) return;
    window.setTimeout(() => pollForPublishedEdit(), 800);
  });
}

if (typeof document$ !== "undefined") {
  document$.subscribe(enablePagesCmsEditing);
} else {
  document.addEventListener("DOMContentLoaded", enablePagesCmsEditing);
}
