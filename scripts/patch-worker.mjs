// Patches worker.js to serve static assets via env.ASSETS before falling back to Next.js handler
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workerPath = join(__dirname, '..', '.open-next', 'worker.js')

let code = readFileSync(workerPath, 'utf-8')

// Add ASSETS-based static file serving BEFORE the middleware/handler call
const patch = `
            // Serve static files via env.ASSETS before falling back to Next.js
            if (env.ASSETS) {
              const assetUrl = new URL(request.url)
              // Only serve specific static paths
              if (
                assetUrl.pathname.startsWith('/_next/') ||
                assetUrl.pathname === '/favicon.ico' ||
                assetUrl.pathname === '/robots.txt' ||
                assetUrl.pathname === '/BUILD_ID'
              ) {
                try {
                  const assetResponse = await env.ASSETS.fetch(request)
                  if (assetResponse.status !== 404) return assetResponse
                } catch {}
              }
            }

            // - \`Request\`s are handled by the Next server
`

code = code.replace(
  `// - \`Request\`s are handled by the Next server`,
  patch
)

writeFileSync(workerPath, code, 'utf-8')
console.log('Patched worker.js with ASSETS static file serving')
