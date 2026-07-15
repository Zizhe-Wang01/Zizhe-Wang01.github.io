# Zosia's Notes editor Worker

This Worker provides GitHub OAuth and restricts writes to Markdown files in
this repository's `docs` tree (excluding the editor itself). It can create and
edit articles, create nested directories, and rename directory titles. The
navigation source of truth is `docs/navigation.json`; multi-file changes are
committed atomically and reject stale revisions instead of overwriting them.

## One-time setup

1. Create a GitHub OAuth App.
   - Homepage URL: `https://zizhe-wang01.github.io`
   - Callback URL: use the Worker URL plus `/auth/callback`
2. From this directory, authenticate and deploy:

   ```bash
   npx wrangler login
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   npx wrangler deploy
   ```

   Generate `SESSION_SECRET` with `openssl rand -hex 32`.
3. Confirm the deployed Worker URL in `docs/javascripts/editor-config.js`.
4. Build and deploy the MkDocs site.

Never commit OAuth secrets to this repository.

The browser stores the encrypted editor session locally for 30 days. GitHub is
only opened again when that session expires or is rejected.

The public site does not render management controls by default. The owner can
enable contextual controls on a device by visiting a page once with `?edit=1`,
and disable them with `?edit=0`. Every read and write API still requires a
valid session for the configured `GITHUB_LOGIN` account.
