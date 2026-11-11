// Run with Miniflare 4 available in NODE_PATH (or installed locally).
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Miniflare, Response } = require('miniflare')

const root = path.resolve(__dirname, '..')
const imageOrigin = 'https://raw.githubusercontent.com'
const revisionPath = '/TsungmingLiu/ai-pose-gallery-zh/488939139c69acfe078372b39d4bd0c457dc060e'

async function main() {
  const assetRoot = process.env.POSE_ASSET_ROOT
  assert.ok(assetRoot, 'Set POSE_ASSET_ROOT to the original image checkout')
  const seen = new Set()
  const paths = [
    '/thumbs/costume/SPR-0001.webp',
    '/thumbs/portrait/f1d68538d4e.webp',
    '/img/costume/SPR-0001.webp',
    '/img/portrait/f1d68538d4e.webp',
  ]
  const fixtures = new Map()
  for (const imagePath of paths) {
    const bytes = await fs.readFile(path.join(assetRoot, imagePath))
    fixtures.set(imagePath, bytes)
  }
  const runtime = new Miniflare({
    modules: true,
    scriptPath: process.env.POSE_WORKER_BUNDLE || path.join(root, 'dist/server/index.js'),
    compatibilityDate: '2025-10-01',
    outboundService: async request => {
      const url = new URL(request.url)
      assert.equal(url.origin, imageOrigin)
      assert.ok(url.pathname.startsWith(revisionPath + '/'))
      assert.equal(request.headers.get('authorization'), null)
      assert.equal(request.headers.get('cookie'), null)
      const imagePath = url.pathname.slice(revisionPath.length)
      if (imagePath === '/thumbs/redirect.webp') return new Response(null, { status: 302, headers: { location: 'https://unexpected.invalid/image.webp' } })
      assert.ok(fixtures.has(imagePath), imagePath)
      seen.add(imagePath)
      if (process.env.POSE_LIVE_IMAGES === '1') {
        // Keep test network traffic on Node's inherited environment proxy while
        // executing the deployed handler and Request construction in workerd.
        const upstream = await globalThis.fetch(request.url, { method: request.method, redirect: 'manual' })
        return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: Object.fromEntries(upstream.headers) })
      }
      return new Response(fixtures.get(imagePath), { headers: { 'content-type': 'image/webp' } })
    },
  })
  try {
    const home = await runtime.dispatchFetch('https://site.invalid/')
    assert.equal(home.status, 200)
    assert.match(await home.text(), /<!DOCTYPE html>/i)
    for (const [imagePath, bytes] of fixtures) {
      const response = await runtime.dispatchFetch('https://site.invalid' + imagePath, { headers: { authorization: 'test-visitor-secret', cookie: 'test-session=private' } })
      assert.equal(response.status, 200, imagePath)
      assert.match(response.headers.get('content-type'), /image\/webp/)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes, imagePath)
    }
    const redirect = await runtime.dispatchFetch('https://site.invalid/thumbs/redirect.webp')
    assert.equal(redirect.status, 502, await redirect.text())
    assert.equal(redirect.headers.get('cache-control'), 'no-store')
    assert.equal(seen.size, fixtures.size)
    console.log('PASS (workerd): readable HTML, thumbnail and full-resolution image bytes, redirects rejected without following them.')
  } finally {
    await runtime.dispose()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
