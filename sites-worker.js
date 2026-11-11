// App assets are embedded at build time. Images use the exact public source revision.
const IMAGE_ORIGIN = 'https://raw.githubusercontent.com/TsungmingLiu/ai-pose-gallery-zh/488939139c69acfe078372b39d4bd0c457dc060e'
const APP_ROUTES = new Set(['/', '/poses', '/costumes', '/portraits', '/studio', '/settings', '/guide'])

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/proxy') {
      return request.method === 'POST'
        ? onRequestPost({ request, env })
        : Response.json({ error: { message: 'Method Not Allowed' } }, { status: 405 })
    }
    if (url.pathname === '/comfy' || url.pathname.startsWith('/comfy/')) {
      return Response.json({ error: { message: '雲端網站無法使用本機 /comfy 代理。請在接口配置填寫可連線的 ComfyUI HTTPS 位址，或在本機執行本專案。' } }, { status: 503 })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 })
    if (/^\/(img|thumbs)\/[a-zA-Z0-9_./-]+\.(webp|png|jpg|jpeg)$/.test(url.pathname)) {
      try {
        // Never forward cookies, authorization, or other visitor headers to the image host.
        // Workers supports manual/follow, but rejects the standard "error" mode.
        const upstream = await fetch(IMAGE_ORIGIN + url.pathname, { method: request.method, redirect: 'manual' })
        if (upstream.status >= 300 && upstream.status < 400) {
          await upstream.body?.cancel()
          console.error(JSON.stringify({ event: 'image_redirect_rejected', path: url.pathname, status: upstream.status }))
          return new Response('Image unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
        }
        const headers = new Headers({
          'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': upstream.ok ? 'public, max-age=86400' : 'no-store',
        })
        return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers })
      } catch (error) {
        console.error(JSON.stringify({ event: 'image_fetch_failed', path: url.pathname, error: error instanceof Error ? error.message : String(error) }))
        return new Response('Image unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
      }
    }
    const route = url.pathname.replace(/\/$/, '') || '/'
    const entry = SITE_ASSETS[url.pathname] || (APP_ROUTES.has(route) ? SITE_ASSETS['/index.html'] : null)
    if (!entry) return new Response('Not Found', { status: 404 })
    const bytes = request.method === 'HEAD' ? null : Uint8Array.from(atob(entry[1]), c => c.charCodeAt(0))
    // Sites dispatch owns transport compression. Return decoded content so the
    // HTML remains readable even when dispatch rewrites transport headers.
    const body = bytes ? new Response(bytes).body.pipeThrough(new DecompressionStream('gzip')) : null
    return new Response(body, { headers: {
      'Content-Type': entry[0],
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    } })
  },
}
