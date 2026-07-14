const notesEditor = {
  apiUrl: (window.ZOSIA_EDITOR_API || "").replace(/\/$/, ""),
  sessionKey: "zosia-notes-editor-session",
  visibilityKey: "zosia-notes-editor-visible",
  pollTimer: null,
  baseline: null
};

function isSiteEditorVisible() {
  const url = new URL(window.location.href);
  const setting = url.searchParams.get("edit");

  if (setting === "1") {
    window.localStorage.setItem(notesEditor.visibilityKey, "true");
  } else if (setting === "0") {
    window.localStorage.removeItem(notesEditor.visibilityKey);
  }

  if (setting === "1" || setting === "0") {
    url.searchParams.delete("edit");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return window.localStorage.getItem(notesEditor.visibilityKey) === "true";
}

function editorPathFromEditLink(link) {
  const url = new URL(link.href);
  const marker = "/edit/main/";
  const index = url.pathname.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.pathname.slice(index + marker.length));
}

function editorUrl(path) {
  const url = new URL(`${window.location.origin}/editor/`);
  url.searchParams.set("path", path);
  url.searchParams.set("return", `${window.location.pathname}${window.location.search}`);
  return url.toString();
}

function enableSiteEditLinks() {
  const visible = isSiteEditorVisible();

  document.querySelectorAll('a[rel~="edit"]').forEach((link) => {
    link.hidden = !visible;
    if (!visible) return;
    if (link.dataset.siteEditorEnabled === "true") return;
    const path = editorPathFromEditLink(link);
    if (!path) return;

    link.href = editorUrl(path);
    link.removeAttribute("target");
    link.rel = "edit";
    link.title = "编辑这篇文章";
    link.dataset.siteEditorEnabled = "true";
  });
}

function showPublishStatus(message) {
  let status = document.querySelector(".cms-sync-status");
  if (!status) {
    status = document.createElement("div");
    status.className = "cms-sync-status";
    status.setAttribute("role", "status");
    document.body.appendChild(status);
  }
  status.textContent = message;
}

async function fetchPublishedArticle() {
  const url = new URL(window.location.href);
  url.searchParams.delete("editor-published");
  url.searchParams.set("publish-check", Date.now().toString());
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const page = new DOMParser().parseFromString(html, "text/html");
  return page.querySelector(".md-content__inner")?.innerHTML.trim() ?? "";
}

async function pollForPublish(attempt = 0) {
  try {
    const current = await fetchPublishedArticle();
    if (notesEditor.baseline && current !== notesEditor.baseline) {
      showPublishStatus("新内容已发布，正在刷新...");
      const url = new URL(window.location.href);
      url.searchParams.delete("editor-published");
      window.setTimeout(() => window.location.replace(url), 300);
      return;
    }
  } catch (_) {
    // GitHub Pages can briefly be unavailable while switching deployments.
  }

  if (attempt >= 150) {
    showPublishStatus("发布仍在进行，可稍后手动刷新");
    return;
  }

  showPublishStatus("修改已提交，正在等待网站发布...");
  notesEditor.pollTimer = window.setTimeout(() => pollForPublish(attempt + 1), 2000);
}

async function beginPublishPolling() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("editor-published") || notesEditor.pollTimer) return;

  try {
    notesEditor.baseline = await fetchPublishedArticle();
  } catch (_) {
    notesEditor.baseline = document.querySelector(".md-content__inner")?.innerHTML.trim() ?? "";
  }
  pollForPublish();
}

function readEditorSession() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const session = hash.get("session");
  if (session) {
    window.sessionStorage.setItem(notesEditor.sessionKey, session);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  return session || window.sessionStorage.getItem(notesEditor.sessionKey);
}

function safeReturnPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

async function editorRequest(path, options = {}) {
  const session = readEditorSession();
  const headers = new Headers(options.headers || {});
  if (session) headers.set("Authorization", `Bearer ${session}`);
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${notesEditor.apiUrl}${path}`, {
    ...options,
    headers
  });
  if (response.status === 401) {
    window.sessionStorage.removeItem(notesEditor.sessionKey);
    throw new Error("LOGIN_REQUIRED");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function showEditorError(message) {
  document.querySelector("#notes-editor")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-login")?.setAttribute("hidden", "");
  const error = document.querySelector("#notes-editor-error");
  const text = document.querySelector("#notes-editor-error-message");
  if (text) text.textContent = message;
  error?.removeAttribute("hidden");
}

function showEditorLogin() {
  document.querySelector("#notes-editor")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-error")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-login")?.removeAttribute("hidden");
}

async function initializeEditorPage() {
  const root = document.querySelector("#notes-editor");
  if (!root) return;

  document.querySelector('a[rel~="edit"]')?.setAttribute("hidden", "");
  if (!notesEditor.apiUrl) {
    showEditorError("Cloudflare Worker 地址尚未配置。");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const path = params.get("path");
  const returnPath = safeReturnPath(params.get("return"));
  if (!path) {
    showEditorError("没有指定要编辑的文章。");
    return;
  }

  document.querySelector("#notes-editor-login-button")?.addEventListener("click", () => {
    const returnTo = window.location.href.split("#")[0];
    window.location.assign(`${notesEditor.apiUrl}/auth/start?return_to=${encodeURIComponent(returnTo)}`);
  });
  document.querySelector("#notes-editor-cancel")?.addEventListener("click", () => {
    window.location.assign(returnPath);
  });

  try {
    const file = await editorRequest(`/api/file?path=${encodeURIComponent(path)}`);
    const title = document.querySelector("#notes-editor-title");
    const content = document.querySelector("#notes-editor-content");
    if (title) title.textContent = path.split("/").pop();
    if (content) content.value = file.content;
    root.dataset.sha = file.sha;
    root.removeAttribute("hidden");

    document.querySelector("#notes-editor-save")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = document.querySelector("#notes-editor-status");
      button.disabled = true;
      if (status) status.textContent = "正在提交...";
      try {
        await editorRequest("/api/file", {
          method: "PUT",
          body: JSON.stringify({
            path,
            sha: root.dataset.sha,
            content: content.value,
            message: `更新 ${path.split("/").pop()}`
          })
        });
        const destination = new URL(returnPath, window.location.origin);
        destination.searchParams.set("editor-published", Date.now().toString());
        window.location.assign(destination);
      } catch (error) {
        if (status) status.textContent = `保存失败：${error.message}`;
        button.disabled = false;
      }
    });
  } catch (error) {
    if (error.message === "LOGIN_REQUIRED") showEditorLogin();
    else showEditorError(error.message);
  }
}

function initializeSiteEditor() {
  enableSiteEditLinks();
  initializeEditorPage();
  beginPublishPolling();
}

if (typeof document$ !== "undefined") {
  document$.subscribe(initializeSiteEditor);
} else {
  document.addEventListener("DOMContentLoaded", initializeSiteEditor);
}
