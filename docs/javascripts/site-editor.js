const notesEditor = {
  apiUrl: (window.ZOSIA_EDITOR_API || "").replace(/\/$/, ""),
  sessionKey: "zosia-notes-editor-session",
  visibilityKey: "zosia-notes-editor-visible",
  publishKey: "zosia-notes-editor-publish",
  publishTimer: null,
  publishChecking: false,
  completionTimer: null
};

const commitPattern = /^[0-9a-f]{40}$/;

function currentPagePath() {
  return `${window.location.pathname}${window.location.search}`;
}

function editorPageUrl(parameters) {
  const url = new URL("/editor/", window.location.origin);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

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
  return editorPageUrl({ path, return: currentPagePath() });
}

function managementUrl(mode, parameters = {}) {
  return editorPageUrl({ mode, ...parameters, return: currentPagePath() });
}

function renderContextualEditorActions(visible) {
  document.querySelector(".content-management-actions")?.remove();
  if (!visible || window.location.pathname.startsWith("/editor/")) return;

  const context = document.querySelector(".editor-page-context");
  const editLink = document.querySelector('a[rel~="edit"]');
  if (!context || !editLink) return;

  const pageType = context.dataset.pageType;
  const directoryId = context.dataset.directoryId;
  const toolbar = document.createElement("div");
  toolbar.className = "content-management-actions";
  toolbar.setAttribute("aria-label", "内容管理");

  const addAction = (label, href, primary = false) => {
    const action = document.createElement("a");
    action.className = `md-button${primary ? " md-button--primary" : ""}`;
    action.href = href;
    action.textContent = label;
    toolbar.append(action);
  };

  if (pageType === "article") {
    addAction("编辑本文", editLink.href, true);
    addAction("在此目录新建文章", managementUrl("article", { directory: directoryId }));
  } else if (pageType === "directory") {
    addAction("新建文章", managementUrl("article", { directory: directoryId }), true);
    addAction("新建子目录", managementUrl("directory", { parent: directoryId }));
    addAction("重命名目录", managementUrl("rename", { directory: directoryId }));
    addAction("编辑目录介绍", editLink.href);
  } else if (pageType === "home") {
    addAction("新建顶级目录", managementUrl("directory"), true);
    addAction("编辑首页", editLink.href);
  }

  if (!toolbar.children.length) return;
  editLink.hidden = true;
  context.insertAdjacentElement("afterend", toolbar);
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
  renderContextualEditorActions(visible);
}

function renderSyncStatus(complete = false) {
  const desktopTabs = window.matchMedia("(min-width: 76.25em)").matches
    ? document.querySelector(".md-tabs")
    : null;
  const host = desktopTabs || document.body;
  let status = document.querySelector(".cms-sync-status");
  if (!status) {
    status = document.createElement("div");
    status.className = "cms-sync-status";
    status.setAttribute("role", "status");
  }
  if (status.parentElement !== host) host.prepend(status);
  status.classList.toggle("cms-sync-status--complete", complete);
  const state = complete ? "complete" : "pending";
  if (status.dataset.state !== state) {
    const label = document.createElement("span");
    label.textContent = complete ? "已完成" : "同步中";
    if (complete) {
      status.replaceChildren(label);
    } else {
      const spinner = document.createElement("span");
      spinner.className = "cms-sync-status__spinner";
      spinner.setAttribute("aria-hidden", "true");
      status.replaceChildren(spinner, label);
    }
    status.dataset.state = state;
  }
  return status;
}

function readPendingPublish() {
  const commit = window.localStorage.getItem(notesEditor.publishKey);
  return commitPattern.test(commit || "") ? commit : null;
}

function startBackgroundPublish(commit) {
  if (!commitPattern.test(commit || "")) return;
  window.localStorage.setItem(notesEditor.publishKey, commit);
  if (notesEditor.publishTimer) window.clearTimeout(notesEditor.publishTimer);
  if (notesEditor.completionTimer) window.clearTimeout(notesEditor.completionTimer);
  notesEditor.publishTimer = null;
  notesEditor.completionTimer = null;
  renderSyncStatus();
}

async function checkBackgroundPublish() {
  if (notesEditor.publishChecking) return;
  notesEditor.publishChecking = true;
  notesEditor.publishTimer = null;
  const pendingCommit = readPendingPublish();
  if (!pendingCommit) {
    document.querySelector(".cms-sync-status")?.remove();
    notesEditor.publishChecking = false;
    return;
  }

  renderSyncStatus();
  try {
    const response = await fetch(`/deployment.json?check=${Date.now()}`, { cache: "no-store" });
    const deployment = response.ok ? await response.json() : null;
    if (deployment?.sha === pendingCommit && readPendingPublish() === pendingCommit) {
      window.localStorage.removeItem(notesEditor.publishKey);
      const status = renderSyncStatus(true);
      notesEditor.completionTimer = window.setTimeout(() => {
        if (!readPendingPublish()) status.remove();
        notesEditor.completionTimer = null;
      }, 3000);
      notesEditor.publishChecking = false;
      return;
    }
  } catch (_) {
    // The status stays non-blocking when GitHub Pages is temporarily unreachable.
  }

  notesEditor.publishChecking = false;
  notesEditor.publishTimer = window.setTimeout(checkBackgroundPublish, 10000);
}

function initializeBackgroundPublish() {
  if (!readPendingPublish()) return;
  renderSyncStatus();
  if (!notesEditor.publishTimer && !notesEditor.publishChecking) checkBackgroundPublish();
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
  showEditorPanel("notes-editor-error");
  const text = document.querySelector("#notes-editor-error-message");
  if (text) text.textContent = message;
}

function showEditorLogin() {
  showEditorPanel("notes-editor-login");
}

function showEditorPanel(visibleId) {
  ["notes-editor", "notes-editor-create", "notes-editor-login", "notes-editor-error"]
    .forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = id !== visibleId;
    });
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

function bindSlugSuggestion(titleInput, slugInput) {
  let manuallyEdited = false;
  slugInput?.addEventListener("input", () => { manuallyEdited = true; });
  titleInput?.addEventListener("input", () => {
    if (!manuallyEdited && slugInput) slugInput.value = slugify(titleInput.value);
  });
}

function timestampSlug(prefix) {
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `${prefix}-${timestamp}`;
}

function openCreatedEditor(created, type, returnPath) {
  startBackgroundPublish(created.commit);
  window.location.assign(editorPageUrl({
    path: created.path,
    return: created.url,
    back: returnPath,
    created: type
  }));
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

async function initializeCreatePage(returnPath) {
  const root = document.querySelector("#notes-editor-create");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

  try {
    const navigation = await editorRequest("/api/navigation");
    const sections = navigationSections(navigation.items);
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") || (params.get("new") === "1" ? "article" : "");
    const heading = document.querySelector("#notes-editor-create-heading");
    const description = document.querySelector("#notes-editor-create-description");
    const submit = document.querySelector("#notes-editor-create-submit");
    const status = document.querySelector("#notes-editor-create-status");
    const articleFields = document.querySelector("#notes-editor-article-fields");
    const directoryFields = document.querySelector("#notes-editor-directory-fields");
    const renameFields = document.querySelector("#notes-editor-rename-fields");
    const articleDirectory = document.querySelector("#notes-editor-section");
    const parentDirectory = document.querySelector("#notes-directory-parent");
    fillDirectorySelect(articleDirectory, sections);
    fillDirectorySelect(parentDirectory, sections, true);

    if (mode === "article") {
      heading.textContent = "新建文章";
      description.textContent = "文章会自动加入当前目录，创建后直接进入编辑。";
      submit.textContent = "创建并开始编辑";
      articleFields.removeAttribute("hidden");
      const selectedDirectory = params.get("directory");
      if (selectedDirectory && sections.some((section) => section.id === selectedDirectory)) {
        articleDirectory.value = selectedDirectory;
        articleDirectory.disabled = true;
      }
    } else if (mode === "directory") {
      heading.textContent = params.get("parent") ? "新建子目录" : "新建顶级目录";
      description.textContent = "目录创建后会出现在左侧导航，并拥有自己的目录首页。";
      submit.textContent = "创建目录";
      directoryFields.removeAttribute("hidden");
      const selectedParent = params.get("parent");
      if (selectedParent && sections.some((section) => section.id === selectedParent)) {
        parentDirectory.value = selectedParent;
      }
      parentDirectory.disabled = true;
    } else if (mode === "rename") {
      const directory = sections.find((section) => section.id === params.get("directory"));
      if (!directory) throw new Error("要重命名的目录不存在");
      heading.textContent = "重命名目录";
      description.textContent = "只修改显示名称，现有文章网址保持不变。";
      submit.textContent = "保存新名称";
      renameFields.removeAttribute("hidden");
      document.querySelector("#notes-directory-rename-title").value = directory.title;
    } else {
      throw new Error("没有指定内容管理操作");
    }

    root.removeAttribute("hidden");

    const articleTitle = document.querySelector("#notes-editor-new-title");
    const articleSlug = document.querySelector("#notes-editor-new-slug");
    const directoryTitle = document.querySelector("#notes-directory-title");
    const directorySlug = document.querySelector("#notes-directory-slug");
    bindSlugSuggestion(articleTitle, articleSlug);
    bindSlugSuggestion(directoryTitle, directorySlug);

    submit.addEventListener("click", async () => {
      submit.disabled = true;
      try {
        if (mode === "article") {
          const slug = slugify(articleSlug?.value || "") || timestampSlug("article");
          if (articleSlug) articleSlug.value = slug;
          status.textContent = "正在创建文章...";
          const created = await editorRequest("/api/article", {
            method: "POST",
            body: JSON.stringify({
              directoryId: articleDirectory?.value,
              title: articleTitle?.value.trim(),
              slug
            })
          });
          openCreatedEditor(created, "article", returnPath);
        } else if (mode === "directory") {
          status.textContent = "正在创建目录...";
          const created = await editorRequest("/api/directory", {
            method: "POST",
            body: JSON.stringify({
              parentId: parentDirectory?.value || null,
              title: directoryTitle?.value.trim(),
              slug: slugify(directorySlug?.value || "") || timestampSlug("directory")
            })
          });
          openCreatedEditor(created, "directory", returnPath);
        } else {
          status.textContent = "正在保存目录名称...";
          const updated = await editorRequest("/api/directory", {
            method: "PUT",
            body: JSON.stringify({
              id: params.get("directory"),
              title: document.querySelector("#notes-directory-rename-title")?.value.trim()
            })
          });
          startBackgroundPublish(updated.commit);
          window.location.assign(returnPath);
        }
      } catch (error) {
        if (error.message === "LOGIN_REQUIRED") showEditorLogin();
        else status.textContent = `操作失败：${error.message}`;
        submit.disabled = false;
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
  if (root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

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

  if (params.has("mode") || params.get("new") === "1") {
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
    if (params.get("created") === "article") {
      const status = document.querySelector("#notes-editor-status");
      if (status) status.textContent = "文章已创建并加入目录，可以继续写作。";
    } else if (params.get("created") === "directory") {
      const status = document.querySelector("#notes-editor-status");
      if (status) status.textContent = "目录已创建，可以补充目录介绍。";
    }

    document.querySelector("#notes-editor-save")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = document.querySelector("#notes-editor-status");
      button.disabled = true;
      if (status) status.textContent = "正在提交...";
      try {
        const updated = await editorRequest("/api/file", {
          method: "PUT",
          body: JSON.stringify({
            path,
            sha: root.dataset.sha,
            content: content.value,
            message: `更新 ${path.split("/").pop()}`
          })
        });
        startBackgroundPublish(updated.commit);
        const destination = params.has("created")
          ? safeReturnPath(params.get("back"))
          : returnPath;
        window.location.assign(destination);
      } catch (error) {
        if (error.message === "LOGIN_REQUIRED") showEditorLogin();
        else if (status) status.textContent = `保存失败：${error.message}`;
        button.disabled = false;
      }
    });
  } catch (error) {
    if (error.message === "LOGIN_REQUIRED") showEditorLogin();
    else showEditorError(error.message);
  }
}

function initializeSiteEditor() {
  initializeBackgroundPublish();
  enableSiteEditLinks();
  initializeEditorPage();
}

if (typeof document$ !== "undefined") {
  document$.subscribe(initializeSiteEditor);
} else {
  document.addEventListener("DOMContentLoaded", initializeSiteEditor);
}
