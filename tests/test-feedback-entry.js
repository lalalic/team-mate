import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, 'www/support.html'), 'utf8')
const script = fs.readFileSync(path.join(root, 'www/feedback.js'), 'utf8')

assert.match(html, /id="feedbackForm"/)
assert.match(html, /type="file"[^>]+accept="image\/png,image\/jpeg,image\/webp"/)
assert.match(html, /Do not upload meeting transcripts, credentials, API keys, access tokens/)
assert.match(html, /id="safeToShare"[^>]+required/)
assert.match(script, /neo\.feedback\.v1/)
assert.match(script, /recordType:'product_feedback'/)
assert.match(script, /FormData/)
assert.match(script, /recordId \|\| result\.id \|\| result\.status === 'recorded'/)
console.log('feedback entry checks passed')
