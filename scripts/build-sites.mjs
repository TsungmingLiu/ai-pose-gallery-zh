import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { stripTypeScriptTypes } from 'node:module'

const root = path.resolve(import.meta.dirname, '..')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.csv': 'text/csv; charset=utf-8' }
const assets = {}
function addTree(directory, prefix) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (prefix === '' && entry.name === 'server') continue
    const file = path.join(directory, entry.name)
    const url = `${prefix}/${entry.name}`
    if (entry.isDirectory()) addTree(file, url)
    else assets[url] = [mime[path.extname(file)] || 'application/octet-stream', gzipSync(fs.readFileSync(file), { level: 9 }).toString('base64')]
  }
}
addTree(path.join(root, 'dist'), '')
addTree(path.join(root, 'data'), '/data')
for (const name of ['og-cover.jpg', 'robots.txt', 'sitemap.xml']) {
  assets[`/${name}`] = [mime[path.extname(name)], gzipSync(fs.readFileSync(path.join(root, name))).toString('base64')]
}
const proxy = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'functions/api/proxy.ts'), 'utf8'))
const handler = fs.readFileSync(path.join(root, 'sites-worker.js'), 'utf8')
const output = `${proxy}\nconst SITE_ASSETS = ${JSON.stringify(assets)};\n${handler}`
fs.mkdirSync(path.join(root, 'dist/server'), { recursive: true })
fs.writeFileSync(path.join(root, 'dist/server/index.js'), output)
console.log(`Sites Worker: ${Object.keys(assets).length} assets, ${output.length} characters`)
