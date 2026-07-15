# Zosia's Notes editor Worker

This Worker provides GitHub OAuth and restricts writes to Markdown files under
`docs/ai`, `docs/robotics`, and `docs/notes` in this repository. It can also
create a Markdown article and add it to an approved `mkdocs.yml` navigation
marker in one Git commit.

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
