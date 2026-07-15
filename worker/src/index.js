const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NAVIGATION_PATH = "docs/navigation.json";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64Encode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(JSON.stringify(value))
  );
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);
  return base64UrlEncode(result);
}

async function unseal(value, secret) {
  try {
    const bytes = base64UrlDecode(value);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await encryptionKey(secret),
      bytes.slice(12)
    );
    const payload = JSON.parse(decoder.decode(decrypted));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (origin !== env.ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function isAllowedReturnUrl(value, env) {
  try {
    const url = new URL(value);
    return url.origin === env.ALLOWED_ORIGIN && url.pathname.startsWith("/editor/");
  } catch (_) {
    return false;
  }
}

function isAllowedMarkdownPath(path) {
  return typeof path === "string" && (
    path === "docs/index.md" ||
    /^docs\/(?!editor(?:\/|$))[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.md$/.test(path)
  );
}

async function githubRequest(env, token, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "zosias-notes-editor",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `GitHub API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function decodeGitHubContent(content) {
  return decoder.decode(base64UrlDecode(content.replace(/\s/g, "").replace(/\+/g, "-").replace(/\//g, "_")));
}

async function getRepositoryFile(env, token, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubRequest(
    env,
    token,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodedPath}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`
  );
  return { ...data, decodedContent: decodeGitHubContent(data.content) };
}

async function repositoryFileExists(env, token, path) {
  try {
    await getRepositoryFile(env, token, path);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function commitFiles(env, token, files, message) {
  const repo = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const ref = await githubRequest(env, token, `${repo}/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`);
  const parentSha = ref.object.sha;
  const parent = await githubRequest(env, token, `${repo}/git/commits/${parentSha}`);
  const blobs = await Promise.all(files.map(async (file) => {
    const blob = await githubRequest(env, token, `${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" })
    });
    return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const tree = await githubRequest(env, token, `${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs })
  });
  const commit = await githubRequest(env, token, `${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: message.slice(0, 120), tree: tree.sha, parents: [parentSha] })
  });
  await githubRequest(env, token, `${repo}/git/refs/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return commit.sha;
}

function validTitle(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120 && !/[\r\n]/.test(value);
}

function validSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

function findSection(items, id) {
  for (const item of items) {
    if (item.type !== "section") continue;
    if (item.id === id) return item;
    const nested = findSection(item.items || [], id);
    if (nested) return nested;
  }
  return null;
}

function findSectionByIndex(items, indexPath) {
  for (const item of items) {
    if (item.type !== "section") continue;
    if (item.index === indexPath) return item;
    const nested = findSectionByIndex(item.items || [], indexPath);
    if (nested) return nested;
  }
  return null;
}

function markdownTitle(content) {
  const match = content.match(/^#\s+(.+?)\s*(?:\{[^}]+\})?\s*$/m);
  return match?.[1]?.trim() || null;
}

function pathExists(items, path) {
  return items.some((item) => (
    item.path === path || item.index === path ||
    (item.type === "section" && pathExists(item.items || [], path))
  ));
}

function sectionPrefixExists(items, prefix) {
  return items.some((item) => (
    (item.type === "section" && item.pathPrefix === prefix) ||
    (item.type === "section" && sectionPrefixExists(item.items || [], prefix))
  ));
}

async function getNavigation(env, token) {
  const file = await getRepositoryFile(env, token, NAVIGATION_PATH);
  const navigation = JSON.parse(file.decodedContent);
  if (!navigation || navigation.version !== 1 || !Array.isArray(navigation.items)) {
    throw new Error("Unsupported navigation data");
  }
  return { file, navigation };
}

function navigationContent(navigation) {
  return `${JSON.stringify(navigation, null, 2)}\n`;
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  return unseal(authorization.slice(7), env.SESSION_SECRET);
}

async function startAuth(request, env) {
  const returnTo = new URL(request.url).searchParams.get("return_to");
  if (!isAllowedReturnUrl(returnTo, env)) return json({ error: "Invalid return URL" }, 400);

  const state = await seal({ returnTo, exp: Date.now() + 10 * 60 * 1000 }, env.SESSION_SECRET);
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${new URL(request.url).origin}/auth/callback`);
  authorize.searchParams.set("scope", "public_repo");
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize, 302);
}

async function finishAuth(request, env) {
  const url = new URL(request.url);
  const state = await unseal(url.searchParams.get("state") || "", env.SESSION_SECRET);
  const code = url.searchParams.get("code");
  if (!state || !code) return json({ error: "Invalid or expired OAuth callback" }, 400);

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) return json({ error: result.error_description || "GitHub login failed" }, 401);

  const user = await githubRequest(env, result.access_token, "/user");
  if (user.login.toLowerCase() !== env.GITHUB_LOGIN.toLowerCase()) {
    return json({ error: "This GitHub account is not allowed to edit the site" }, 403);
  }

  const session = await seal({ token: result.access_token, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, env.SESSION_SECRET);
  const separator = state.returnTo.includes("#") ? "&" : "#";
  return Response.redirect(`${state.returnTo}${separator}session=${encodeURIComponent(session)}`, 302);
}

async function getFile(request, env, session) {
  const path = new URL(request.url).searchParams.get("path");
  if (!isAllowedMarkdownPath(path)) return json({ error: "Invalid Markdown path" }, 400, corsHeaders(request, env));

  const data = await getRepositoryFile(env, session.token, path);
  return json({ path: data.path, sha: data.sha, content: data.decodedContent }, 200, corsHeaders(request, env));
}

async function updateFile(request, env, session) {
  const body = await request.json().catch(() => null);
  if (!body || !isAllowedMarkdownPath(body.path) || typeof body.content !== "string" || typeof body.sha !== "string") {
    return json({ error: "Invalid update request" }, 400, corsHeaders(request, env));
  }
  if (encoder.encode(body.content).byteLength > 2 * 1024 * 1024) {
    return json({ error: "Markdown file is too large" }, 413, corsHeaders(request, env));
  }

  const { navigation } = await getNavigation(env, session.token);
  const relativePath = body.path.replace(/^docs\//, "");
  const directory = findSectionByIndex(navigation.items, relativePath);
  if (directory) {
    const title = markdownTitle(body.content);
    if (!validTitle(title)) {
      return json({ error: "目录页必须保留一个一级标题" }, 400, corsHeaders(request, env));
    }
    const current = await getRepositoryFile(env, session.token, body.path);
    if (current.sha !== body.sha) {
      return json({ error: "文章已在其他地方更新，请刷新后重试" }, 409, corsHeaders(request, env));
    }
    directory.title = title;
    const commit = await commitFiles(env, session.token, [
      { path: body.path, content: body.content },
      { path: NAVIGATION_PATH, content: navigationContent(navigation) }
    ], typeof body.message === "string" ? body.message : `更新 ${body.path}`);
    return json({ commit }, 200, corsHeaders(request, env));
  }

  const encodedPath = body.path.split("/").map(encodeURIComponent).join("/");
  const data = await githubRequest(
    env,
    session.token,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodedPath}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: typeof body.message === "string" ? body.message.slice(0, 120) : `更新 ${body.path}`,
        content: base64Encode(encoder.encode(body.content)),
        sha: body.sha,
        branch: env.GITHUB_BRANCH
      })
    }
  );
  return json({ commit: data.commit.sha }, 200, corsHeaders(request, env));
}

async function navigationResponse(request, env, session) {
  const { navigation } = await getNavigation(env, session.token);
  return json(navigation, 200, corsHeaders(request, env));
}

async function createArticle(request, env, session) {
  const body = await request.json().catch(() => null);
  if (!body || !validTitle(body.title) || !validSlug(body.slug) || typeof body.directoryId !== "string") {
    return json({ error: "请填写有效的标题、URL 名称和所属目录" }, 400, corsHeaders(request, env));
  }

  const { navigation } = await getNavigation(env, session.token);
  const directory = findSection(navigation.items, body.directoryId);
  if (!directory || typeof directory.pathPrefix !== "string") {
    return json({ error: "所选目录不存在" }, 400, corsHeaders(request, env));
  }

  const relativePath = `${directory.pathPrefix}/${body.slug}.md`;
  const repositoryPath = `docs/${relativePath}`;
  if (pathExists(navigation.items, relativePath) || await repositoryFileExists(env, session.token, repositoryPath)) {
    return json({ error: "这个 URL 名称已经被使用" }, 409, corsHeaders(request, env));
  }

  const title = body.title.trim();
  directory.items ||= [];
  directory.items.push({ type: "page", path: relativePath });
  const commit = await commitFiles(env, session.token, [
    { path: repositoryPath, content: `# ${title}\n\n` },
    { path: NAVIGATION_PATH, content: navigationContent(navigation) }
  ], `新建文章：${title}`);

  return json({
    commit,
    path: repositoryPath,
    url: `/${relativePath.replace(/\.md$/, "/")}`
  }, 201, corsHeaders(request, env));
}

async function createDirectory(request, env, session) {
  const body = await request.json().catch(() => null);
  if (!body || !validTitle(body.title) || !validSlug(body.slug) || !(body.parentId === null || typeof body.parentId === "string")) {
    return json({ error: "请填写有效的目录名称和 URL 名称" }, 400, corsHeaders(request, env));
  }

  const { navigation } = await getNavigation(env, session.token);
  const parent = body.parentId ? findSection(navigation.items, body.parentId) : null;
  if (body.parentId && !parent) {
    return json({ error: "上级目录不存在" }, 400, corsHeaders(request, env));
  }

  const pathPrefix = parent ? `${parent.pathPrefix}/${body.slug}` : body.slug;
  const indexPath = `${pathPrefix}/index.md`;
  const repositoryPath = `docs/${indexPath}`;
  if (sectionPrefixExists(navigation.items, pathPrefix) || await repositoryFileExists(env, session.token, repositoryPath)) {
    return json({ error: "这个目录 URL 已经被使用" }, 409, corsHeaders(request, env));
  }

  const title = body.title.trim();
  const directory = {
    type: "section",
    id: `dir-${body.slug}-${crypto.randomUUID().slice(0, 8)}`,
    title,
    pathPrefix,
    index: indexPath,
    items: []
  };
  if (parent) {
    parent.items ||= [];
    parent.items.push(directory);
  } else {
    navigation.items.push(directory);
  }

  const indexContent = `---\nhide:\n  - toc\n---\n\n# ${title} {.directory-title}\n\n## 文章 {.directory-heading}\n\n<!-- auto-directory -->\n`;
  const commit = await commitFiles(env, session.token, [
    { path: repositoryPath, content: indexContent },
    { path: NAVIGATION_PATH, content: navigationContent(navigation) }
  ], `新建目录：${title}`);

  return json({ commit, directory }, 201, corsHeaders(request, env));
}

async function renameDirectory(request, env, session) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !validTitle(body.title)) {
    return json({ error: "请填写有效的目录名称" }, 400, corsHeaders(request, env));
  }

  const { navigation } = await getNavigation(env, session.token);
  const directory = findSection(navigation.items, body.id);
  if (!directory) return json({ error: "目录不存在" }, 404, corsHeaders(request, env));

  const title = body.title.trim();
  directory.title = title;
  const files = [{ path: NAVIGATION_PATH, content: navigationContent(navigation) }];
  if (directory.index) {
    const indexFile = await getRepositoryFile(env, session.token, `docs/${directory.index}`);
    const content = indexFile.decodedContent.replace(/^#\s+.*$/m, (heading) => {
      const attributes = heading.match(/\s+\{[^}]+\}\s*$/)?.[0] || "";
      return `# ${title}${attributes}`;
    });
    files.push({ path: `docs/${directory.index}`, content });
  }
  const commit = await commitFiles(env, session.token, files, `重命名目录：${title}`);
  return json({ commit, directory }, 200, corsHeaders(request, env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (url.pathname === "/auth/start" && request.method === "GET") return startAuth(request, env);
    if (url.pathname === "/auth/callback" && request.method === "GET") return finishAuth(request, env);

    if (url.pathname.startsWith("/api/")) {
      const session = await authenticate(request, env);
      if (!session) return json({ error: "Authentication required" }, 401, corsHeaders(request, env));
      try {
        if (url.pathname === "/api/file" && request.method === "GET") return await getFile(request, env, session);
        if (url.pathname === "/api/file" && request.method === "PUT") return await updateFile(request, env, session);
        if (url.pathname === "/api/navigation" && request.method === "GET") return await navigationResponse(request, env, session);
        if (url.pathname === "/api/article" && request.method === "POST") return await createArticle(request, env, session);
        if (url.pathname === "/api/directory" && request.method === "POST") return await createDirectory(request, env, session);
        if (url.pathname === "/api/directory" && request.method === "PUT") return await renameDirectory(request, env, session);
      } catch (error) {
        const status = error.status === 401 ? 401 : 502;
        return json({ error: error.message }, status, corsHeaders(request, env));
      }
    }

    return json({ error: "Not found" }, 404, corsHeaders(request, env));
  }
};
