import assert from 'node:assert/strict'
import path from 'node:path'
import { createServer } from 'vite'

const root = path.resolve(import.meta.dirname, '..')
const server = await createServer({ root, configFile: false, resolve: { alias: { '@': path.join(root, 'src') } }, server: { middlewareMode: true }, appType: 'custom' })
const originals = { fetch: globalThis.fetch, window: globalThis.window, FileReader: globalThis.FileReader }
const origin = 'https://private-site.example'
globalThis.window = { location: new URL(origin + '/studio') }
globalThis.FileReader = class {
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    this.onload()
  }
}
const bytes = Buffer.from('RIFF-test-image-bytes')
const embedded = `data:image/webp;base64,${bytes.toString('base64')}`
const publicUrl = 'https://public.example/reference.webp'
const sources = ['img/portrait/local.webp', origin + '/img/costume/local.webp', '/img/pose.webp', 'blob:' + origin + '/upload', publicUrl, 'data:image/png;base64,dGVzdA==']
let imageStatus = 200
let imageType = 'image/webp'
let imageRequests = []
let apiRequests = []
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith('https://api.openai.com/') || url === '/api/proxy') {
    apiRequests.push({ url, init })
    return Response.json({ data: [{ b64_json: 'dGVzdA==' }] })
  }
  imageRequests.push(url)
  assert.equal(init.credentials, 'same-origin')
  assert.equal(new Headers(init.headers).has('authorization'), false, 'API key must not reach image downloads')
  assert.notEqual(url, publicUrl, 'Public external URL stays a URL')
  return new Response(bytes, { status: imageStatus, headers: { 'content-type': imageType } })
}

try {
  const { generateCharacterImage } = await server.ssrLoadModule('/src/services/aiGenerator.ts')
  const { referenceNeedsInlineData } = await server.ssrLoadModule('/src/lib/recipeImages.ts')
  assert.equal(referenceNeedsInlineData('//private-site.example/img/a.webp'), true)
  assert.equal(referenceNeedsInlineData('//public.example/img/a.webp'), false)
  const recipe = { portrait: { 原图: sources[0] }, costume: { 原图: sources[1] }, pose: { 原图: sources[2] }, extraImages: sources.slice(3).map(url => ({ url })) }
  const config = {
    activeProvider: 'gpt', imagePassMode: 'url', sendStitchedSheet: false, useProxy: false,
    providers: { gpt: { model: 'gpt-image-2.5-sunburst', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' } },
    gptParams: { endpointMode: 'images_edits_json', inputFidelity: 'high', size: 'auto', quality: 'high', background: 'auto', outputFormat: 'png', moderation: 'auto' },
  }
  for (const endpointMode of ['images_edits_json', 'responses', 'chat']) {
    for (const useProxy of [false, true]) {
      imageRequests = []; apiRequests = []
      config.gptParams.endpointMode = endpointMode; config.useProxy = useProxy
      await generateCharacterImage({ recipe, prompt: 'Test reference transport', config })
      assert.equal(imageRequests.length, 4)
      assert.equal(apiRequests.length, 1)
      const { init } = apiRequests[0]
      const payload = JSON.parse(init.body)
      const refs = endpointMode === 'images_edits_json' ? payload.images.map(image => image.image_url)
        : endpointMode === 'responses' ? payload.input[0].content.filter(item => item.type === 'input_image').map(item => item.image_url)
        : payload.messages[0].content.filter(item => item.type === 'image_url').map(item => item.image_url.url)
      assert.deepEqual(refs, [embedded, embedded, embedded, embedded, publicUrl, sources[5]])
      assert.ok(!init.body.includes(origin), 'Private Site and blob URLs must never be sent to the image API')
      assert.equal(new Headers(init.headers).has('cookie'), false)
    }
  }
  for (const failure of [{ status: 401, type: 'image/webp', message: /HTTP 401/ }, { status: 200, type: 'text/html', message: /不是图片/ }]) {
    imageStatus = failure.status; imageType = failure.type; apiRequests = []
    await assert.rejects(generateCharacterImage({ recipe, prompt: 'test', config }), failure.message)
    assert.equal(apiRequests.length, 0, 'Failed downloads must stop before an image-generation call')
  }
  console.log('PASS: private references become inline image bytes; public URLs and image order preserved; no cookies sent to API; failed downloads stop generation.')
} finally {
  Object.assign(globalThis, originals)
  await server.close()
}
