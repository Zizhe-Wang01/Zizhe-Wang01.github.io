const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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
    (/^docs\/(?:ai|robotics|notes)\/[A-Za-z0-9_./-]+\.md$/.test(path) && !path.includes(".."))
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
  if (!response.ok) throw new Error(data.message || `GitHub API ${response.status}`);
  return data;
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

  const session = await seal({ token: result.access_token, exp: Date.now() + 8 * 60 * 60 * 1000 }, env.SESSION_SECRET);
  const separator = state.returnTo.includes("#") ? "&" : "#";
  return Response.redirect(`${state.returnTo}${separator}session=${encodeURIComponent(session)}`, 302);
}

async function getFile(request, env, session) {
  const path = new URL(request.url).searchParams.get("path");
  if (!isAllowedMarkdownPath(path)) return json({ error: "Invalid Markdown path" }, 400, corsHeaders(request, env));

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubRequest(
    env,
    session.token,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodedPath}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`
  );
  const content = decoder.decode(base64UrlDecode(data.content.replace(/\s/g, "").replace(/\+/g, "-").replace(/\//g, "_")));
  return json({ path: data.path, sha: data.sha, content }, 200, corsHeaders(request, env));
}

async function updateFile(request, env, session) {
  const body = await request.json().catch(() => null);
  if (!body || !isAllowedMarkdownPath(body.path) || typeof body.content !== "string" || typeof body.sha !== "string") {
    return json({ error: "Invalid update request" }, 400, corsHeaders(request, env));
  }
  if (encoder.encode(body.content).byteLength > 2 * 1024 * 1024) {
    return json({ error: "Markdown file is too large" }, 413, corsHeaders(request, env));
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
      } catch (error) {
        return json({ error: error.message }, 502, corsHeaders(request, env));
      }
    }

    return json({ error: "Not found" }, 404, corsHeaders(request, env));
  }
};
