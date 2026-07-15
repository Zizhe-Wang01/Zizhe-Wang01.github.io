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

function newArticleUrl() {
  const url = new URL(`${window.location.origin}/editor/`);
  url.searchParams.set("new", "1");
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

  if (!visible || window.location.pathname.startsWith("/editor/")) return;
  const editLink = document.querySelector('a[rel~="edit"]');
  if (!editLink || document.querySelector(".notes-create-link")) return;
  const createLink = document.createElement("a");
  createLink.className = "md-content__button md-icon notes-create-link";
  createLink.href = newArticleUrl();
  createLink.title = "新建文章或管理目录";
  createLink.setAttribute("aria-label", createLink.title);
  createLink.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>';
  editLink.insertAdjacentElement("afterend", createLink);
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
    window.localStorage.setItem(notesEditor.sessionKey, session);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  return session || window.localStorage.getItem(notesEditor.sessionKey);
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
    window.localStorage.removeItem(notesEditor.sessionKey);
    throw new Error("LOGIN_REQUIRED");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function showEditorError(message) {
  document.querySelector("#notes-editor")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-create")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-login")?.setAttribute("hidden", "");
  const error = document.querySelector("#notes-editor-error");
  const text = document.querySelector("#notes-editor-error-message");
  if (text) text.textContent = message;
  error?.removeAttribute("hidden");
}

function showEditorLogin() {
  document.querySelector("#notes-editor")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-create")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-error")?.setAttribute("hidden", "");
  document.querySelector("#notes-editor-login")?.removeAttribute("hidden");
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function navigationSections(items, depth = 0, result = []) {
  items.forEach((item) => {
    if (item.type !== "section") return;
    result.push({ ...item, depth });
    navigationSections(item.items || [], depth + 1, result);
  });
  return result;
}

function fillDirectorySelect(select, sections, includeRoot = false) {
  select.replaceChildren();
  if (includeRoot) select.add(new Option("网站顶层", ""));
  sections.forEach((section) => {
    select.add(new Option(`${"　".repeat(section.depth)}${section.title}`, section.id));
  });
}

function renderDirectoryList(sections) {
  const list = document.querySelector("#notes-directory-list");
  if (!list) return;
  list.replaceChildren();
  sections.forEach((section) => {
    const row = document.createElement("div");
    row.className = "notes-directory-list__item";
    row.style.setProperty("--directory-depth", section.depth);
    const input = document.createElement("input");
    input.value = section.title;
    input.maxLength = 120;
    input.setAttribute("aria-label", `${section.title}的新名称`);
    const button = document.createElement("button");
    button.className = "md-button";
    button.type = "button";
    button.textContent = "重命名";
    button.addEventListener("click", async () => {
      const status = document.querySelector("#notes-directory-status");
      button.disabled = true;
      if (status) status.textContent = "正在保存目录名称...";
      try {
        await editorRequest("/api/directory", {
          method: "PUT",
          body: JSON.stringify({ id: section.id, title: input.value.trim() })
        });
        if (status) status.textContent = "目录名称已更新，网站正在自动部署。";
      } catch (error) {
        if (error.message === "LOGIN_REQUIRED") showEditorLogin();
        else if (status) status.textContent = `重命名失败：${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
    row.append(input, button);
    list.append(row);
  });
}

async function initializeCreatePage(returnPath) {
  const root = document.querySelector("#notes-editor-create");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

  try {
    const navigation = await editorRequest("/api/navigation");
    let sections = navigationSections(navigation.items);
    const articleDirectory = document.querySelector("#notes-editor-section");
    const parentDirectory = document.querySelector("#notes-directory-parent");
    fillDirectorySelect(articleDirectory, sections);
    fillDirectorySelect(parentDirectory, sections, true);
    renderDirectoryList(sections);
    root.removeAttribute("hidden");

    const title = document.querySelector("#notes-editor-new-title");
    const slug = document.querySelector("#notes-editor-new-slug");
    let slugWasEdited = false;
    slug?.addEventListener("input", () => { slugWasEdited = true; });
    title?.addEventListener("input", () => {
      if (!slugWasEdited && slug) slug.value = slugify(title.value);
    });

    document.querySelector("#notes-editor-create-submit")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = document.querySelector("#notes-editor-create-status");
      const fallbackSlug = `article-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
      const articleSlug = slugify(slug?.value || "") || fallbackSlug;
      if (slug) slug.value = articleSlug;
      button.disabled = true;
      if (status) status.textContent = "正在创建文章和目录条目...";
      try {
        const article = await editorRequest("/api/article", {
          method: "POST",
          body: JSON.stringify({
            directoryId: articleDirectory?.value,
            title: title?.value.trim(),
            slug: articleSlug
          })
        });
        const destination = new URL(`${window.location.origin}/editor/`);
        destination.searchParams.set("path", article.path);
        destination.searchParams.set("return", article.url);
        destination.searchParams.set("created", "1");
        window.location.assign(destination);
      } catch (error) {
        if (error.message === "LOGIN_REQUIRED") showEditorLogin();
        else if (status) status.textContent = `创建失败：${error.message}`;
        button.disabled = false;
      }
    });

    const directoryTitle = document.querySelector("#notes-directory-title");
    const directorySlug = document.querySelector("#notes-directory-slug");
    let directorySlugWasEdited = false;
    directorySlug?.addEventListener("input", () => { directorySlugWasEdited = true; });
    directoryTitle?.addEventListener("input", () => {
      if (!directorySlugWasEdited && directorySlug) directorySlug.value = slugify(directoryTitle.value);
    });
    document.querySelector("#notes-directory-create")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = document.querySelector("#notes-directory-status");
      button.disabled = true;
      if (status) status.textContent = "正在创建目录...";
      try {
        const created = await editorRequest("/api/directory", {
          method: "POST",
          body: JSON.stringify({
            parentId: parentDirectory?.value || null,
            title: directoryTitle?.value.trim(),
            slug: slugify(directorySlug?.value || "")
          })
        });
        sections.push({ ...created.directory, depth: created.directory.pathPrefix.split("/").length - 1 });
        fillDirectorySelect(articleDirectory, sections);
        fillDirectorySelect(parentDirectory, sections, true);
        renderDirectoryList(sections);
        if (articleDirectory) articleDirectory.value = created.directory.id;
        if (directoryTitle) directoryTitle.value = "";
        if (directorySlug) directorySlug.value = "";
        directorySlugWasEdited = false;
        if (status) status.textContent = "目录已创建并选中，网站正在自动部署。";
      } catch (error) {
        if (error.message === "LOGIN_REQUIRED") showEditorLogin();
        else if (status) status.textContent = `创建目录失败：${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
  } catch (error) {
    root.dataset.initialized = "false";
    if (error.message === "LOGIN_REQUIRED") showEditorLogin();
    else showEditorError(error.message);
  }
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

  document.querySelector("#notes-editor-login-button")?.addEventListener("click", () => {
    const returnTo = window.location.href.split("#")[0];
    window.location.assign(`${notesEditor.apiUrl}/auth/start?return_to=${encodeURIComponent(returnTo)}`);
  });
  document.querySelector("#notes-editor-cancel")?.addEventListener("click", () => {
    window.location.assign(returnPath);
  });
  document.querySelector("#notes-editor-create-cancel")?.addEventListener("click", () => {
    window.location.assign(returnPath);
  });

  if (params.get("new") === "1") {
    await initializeCreatePage(returnPath);
    return;
  }
  if (!path) {
    showEditorError("没有指定要编辑的文章。");
    return;
  }

  try {
    const file = await editorRequest(`/api/file?path=${encodeURIComponent(path)}`);
    const title = document.querySelector("#notes-editor-title");
    const content = document.querySelector("#notes-editor-content");
    if (title) title.textContent = path.split("/").pop();
    if (content) content.value = file.content;
    root.dataset.sha = file.sha;
    root.removeAttribute("hidden");
    if (params.has("created")) {
      const status = document.querySelector("#notes-editor-status");
      if (status) status.textContent = "文章已创建并加入目录，可以继续写作。";
    }

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
