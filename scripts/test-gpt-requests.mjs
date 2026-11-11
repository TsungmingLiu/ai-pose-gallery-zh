import assert from 'node:assert/strict'
import path from 'node:path'
import { createServer } from 'vite'

const root = path.resolve(import.meta.dirname, '..')
const server = await createServer({
  root, configFile: false,
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { middlewareMode: true }, appType: 'custom',
})
const originalFetch = globalThis.fetch
let requests = []
globalThis.fetch = async (url, init) => {
  requests.push({ url, init })
  return Response.json({ data: [{ b64_json: 'dGVzdA==' }] })
}

try {
  const { generateCharacterImage, PROVIDER_META } = await server.ssrLoadModule('/src/services/aiGenerator.ts')
  for (const model of ['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare']) {
    assert.ok(PROVIDER_META.gpt.models.some(option => option.value === model))
  }
  const recipe = { portrait: null, costume: null, pose: null, extraImages: [{ url: 'data:image/png;base64,dGVzdA==' }] }
  const cases = [
    ['gpt-image-2.6-sunburst', 'high', undefined, 'max'],
    ['gpt-image-2.6-sunburst', 'low', undefined],
    ['gpt-image-2.6-flare', 'high', undefined, 'xhigh'],
    ['gpt-image-2.6-flare', 'auto', undefined],
    ['gpt-image-2.5-sunburst', 'high', undefined],
    ['gpt-image-2.5-sunburst', 'low', undefined],
    ['gpt-image-2.5-sunburst-2026-09-08', 'high', undefined],
    ['gpt-image-2.5-flare', 'high', undefined],
    ['gpt-image-2.5', 'high', undefined],
    ['gpt-image-2', 'high', undefined],
    ['gpt-image-2-2026-04-21', 'high', undefined],
    ['gpt-image-1.5', 'high', 'high'],
    ['gpt-image-1.5', 'low', 'low'],
    ['gpt-image-1.5', 'auto', undefined],
    ['custom', 'high', undefined],
  ]
  let checked = 0
  for (const endpointMode of ['images_edits_json', 'images_edits', 'responses']) {
    for (const useProxy of [false, true]) {
      for (const [model, inputFidelity, expected, quality = 'high'] of cases) {
        requests = []
        const result = await generateCharacterImage({
          recipe, prompt: 'test prompt',
          config: {
            activeProvider: 'gpt', imagePassMode: 'url', sendStitchedSheet: false, useProxy,
            providers: { gpt: { model, customModel: ' gpt-image-2.5-sunburst ', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' } },
            gptParams: { endpointMode, inputFidelity, size: '1024x1536', quality, background: 'auto', outputFormat: 'png', moderation: 'auto' },
          },
        })
        assert.equal(requests.length, 1, 'No retries or extra image-generation calls')
        assert.equal(result.modelUsed, model === 'custom' ? 'gpt-image-2.5-sunburst' : model)
        const { url, init } = requests[0]
        assert.equal(url, useProxy ? '/api/proxy' : `https://api.openai.com/v1/${endpointMode === 'responses' ? 'responses' : 'images/edits'}`)
        const payload = init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(init.body)
        const options = endpointMode === 'responses' ? payload.tools[0] : payload
        assert.equal(options.input_fidelity, expected, `${model} / ${endpointMode} / ${inputFidelity}`)
        assert.equal(Object.hasOwn(options, 'input_fidelity'), expected !== undefined)
        assert.equal(options.quality, quality)
        assert.equal(options.size, '1024x1536')
        if (endpointMode === 'images_edits') assert.ok(init.body.get('image[]') instanceof Blob)
        checked++
      }
    }
  }
  console.log(`PASS: ${checked} captured OpenAI requests across JSON, multipart and Responses, direct and proxied. No external API calls.`)
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
