# Editor deployment note

This directory is excluded from MkDocs. The public editor page is `index.md`.

Set `window.ZOSIA_EDITOR_API` in `docs/javascripts/editor-config.js` to the
deployed Worker URL after running `npx wrangler deploy` in `worker/`.
