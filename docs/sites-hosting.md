# ChatGPT Sites hosting

This checkout adapts the original application for an owner-private ChatGPT Site.
Keep `.openai/hosting.json` as an ignored, local deployment configuration. Create
it locally with the project ID returned by Sites; do not commit a Site's identity
to this GitHub repository. The deployment archive still needs this local file.

```json
{ "project_id": "<your-sites-project-id>" }
```

Run `pnpm build && node scripts/build-sites.mjs` using Node.js 24 or newer.
Deploy `.openai/hosting.json` and `dist/server/index.js` together.
Run `node scripts/test-sites.mjs` after building. Embedded assets are compressed
to reduce the bundle size, then decompressed before returning a response. Sites
dispatch manages HTTP transport compression; do not return precompressed bodies.

Image request regression tests run the actual built handler in workerd through
Miniflare 4.20260730.0. Install Miniflare in a separate test directory, then run
`NODE_PATH=<test-directory>/node_modules POSE_ASSET_ROOT=<original-checkout> node scripts/test-sites-worker.cjs`.
Set `POSE_LIVE_IMAGES=1 NODE_USE_ENV_PROXY=1` to compare live source images with
the original checkout. This validates thumbnails, full-size bytes, redirect
rejection, and that visitor credentials never reach the image host. Workers
does not support `redirect: 'error'`; use `manual` and reject redirect statuses.

The Worker embeds the built frontend and all JSON data. The image routes stream
images from the public source repository at commit
`488939139c69acfe078372b39d4bd0c457dc060e`, without forwarding visitor credentials.
This preserves same-origin image downloads and canvas export. Source-host
availability is required; existing external anime references remain external.

The existing allowlisted `/api/proxy` handler is retained. No API keys are
bundled. Users configure image-provider credentials in the application.

Image providers cannot fetch owner-private Site URLs. The browser therefore
reads same-origin reference images with its existing session and includes the
original bytes as image data URLs, even when URL mode was previously saved.
Blob references are also embedded; external public image URLs stay unchanged.
No session cookies are forwarded to the provider. Verify this request behavior
with `node scripts/test-reference-transport.mjs`.

The development-only `/comfy` localhost proxy is unavailable when hosted.
Use a reachable ComfyUI HTTPS endpoint with appropriate CORS configuration,
or run the original application locally for same-machine ComfyUI.
