import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import worker from '../dist/server/index.js'

const root = path.resolve(import.meta.dirname, '..')
const request = (pathname, method = 'GET') => worker.fetch(new Request(`https://test.invalid${pathname}`, { method }), {})
const index = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8')
for (const route of ['/', '/poses', '/costumes', '/portraits', '/studio', '/settings', '/guide']) {
  const response = await request(route)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-encoding'), null)
  assert.equal(await response.text(), index, `${route} must return directly readable HTML`)
}
async function verifyFiles(directory, prefix) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    const url = `${prefix}/${entry.name}`
    if (entry.isDirectory()) await verifyFiles(file, url)
    else {
      const response = await request(url)
      assert.equal(response.status, 200, url)
      assert.equal(response.headers.get('content-encoding'), null, url)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(file), url)
    }
  }
}
await verifyFiles(path.join(root, 'dist/assets'), '/assets')
await verifyFiles(path.join(root, 'data'), '/data')
assert.equal((await request('/', 'HEAD')).body, null)
assert.equal((await request('/missing.js')).status, 404)
assert.equal((await request('/api/proxy')).status, 405)
assert.equal((await request('/comfy/system_stats')).status, 503)
console.log('PASS: readable HTML on all routes; JS, CSS, fonts and catalogs exactly match the original files; HEAD and error responses.')
