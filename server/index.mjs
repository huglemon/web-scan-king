import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const distDir = resolve(__dirname, '../dist')
const uploadDir = join(tmpdir(), 'inwind-docs-scan-pdf')
const port = Number(process.env.PORT ?? 3000)
const maxPdfBytes = Number(process.env.PDF_PREVIEW_MAX_BYTES ?? 30 * 1024 * 1024)
const pdfTtlMs = Number(process.env.PDF_PREVIEW_TTL_MS ?? 30 * 60 * 1000)

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.json', 'application/json; charset=utf-8'],
])

await mkdir(uploadDir, { recursive: true })

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', getPublicBaseUrl(request))

    if (requestUrl.pathname === '/healthz') {
      sendJson(response, 200, { ok: true })
      return
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/pdf-preview'
    ) {
      await handlePdfUpload(request, response, requestUrl)
      return
    }

    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      requestUrl.pathname.startsWith('/api/pdf-preview/')
    ) {
      await handlePdfDownload(request, response, requestUrl)
      return
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      await serveStaticFile(request, response, requestUrl)
      return
    }

    sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      sendJson(response, 413, { error: error.message })
      return
    }

    console.error(error)
    sendJson(response, 500, { error: 'Internal server error' })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`inWind Docs Scan listening on ${port}`)
})

setInterval(() => {
  cleanupExpiredPdfs().catch((error) => console.error(error))
}, Math.min(pdfTtlMs, 10 * 60 * 1000)).unref()

async function handlePdfUpload(request, response, requestUrl) {
  const contentType = request.headers['content-type'] ?? ''

  if (!contentType.includes('application/pdf')) {
    sendJson(response, 415, { error: 'Only PDF uploads are supported' })
    return
  }

  const buffer = await readRequestBody(request, maxPdfBytes)
  const id = randomUUID()
  const fileName = createSafePdfFileName(requestUrl.searchParams.get('name'))
  const filePath = join(uploadDir, `${id}.pdf`)
  const expiresAt = Date.now() + pdfTtlMs

  await writeFile(filePath, buffer)

  const publicUrl = new URL(
    `/api/pdf-preview/${id}/${encodeURIComponent(fileName)}`,
    getPublicBaseUrl(request),
  )

  sendJson(response, 201, {
    url: publicUrl.href,
    fileName,
    size: buffer.byteLength,
    expiresAt: new Date(expiresAt).toISOString(),
  })

  cleanupExpiredPdfs().catch((error) => console.error(error))
}

async function handlePdfDownload(request, response, requestUrl) {
  const id = basename(requestUrl.pathname.split('/')[3] ?? '').replace(
    /[^a-f0-9-]/gi,
    '',
  )

  if (!id) {
    sendJson(response, 404, { error: 'PDF not found' })
    return
  }

  const filePath = join(uploadDir, `${id}.pdf`)
  const fileInfo = await stat(filePath).catch(() => null)

  if (!fileInfo || Date.now() - fileInfo.mtimeMs > pdfTtlMs) {
    await rm(filePath, { force: true }).catch(() => {})
    sendJson(response, 404, { error: 'PDF expired' })
    return
  }

  const fileName = createSafePdfFileName(
    decodeURIComponent(requestUrl.pathname.split('/')[4] ?? ''),
  )

  response.writeHead(200, {
    'Cache-Control': 'private, max-age=1800',
    'Content-Disposition': createInlineDisposition(fileName),
    'Content-Length': fileInfo.size,
    'Content-Type': 'application/pdf',
    'X-Content-Type-Options': 'nosniff',
  })

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  createReadStream(filePath).pipe(response)
}

async function serveStaticFile(request, response, requestUrl) {
  const pathname = decodeURIComponent(requestUrl.pathname)
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  let filePath = resolve(distDir, `.${normalizedPath}`)

  if (!filePath.startsWith(distDir)) {
    sendJson(response, 403, { error: 'Forbidden' })
    return
  }

  let fileInfo = await stat(filePath).catch(() => null)

  if (fileInfo?.isDirectory()) {
    filePath = join(filePath, 'index.html')
    fileInfo = await stat(filePath).catch(() => null)
  }

  if (!fileInfo?.isFile()) {
    filePath = join(distDir, 'index.html')
    fileInfo = await stat(filePath).catch(() => null)
  }

  if (!fileInfo?.isFile()) {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  response.writeHead(200, {
    'Cache-Control': filePath.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
    'Content-Length': fileInfo.size,
    'Content-Type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
  })

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  createReadStream(filePath).pipe(response)
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let totalBytes = 0

    request.on('data', (chunk) => {
      totalBytes += chunk.length

      if (totalBytes > maxBytes) {
        rejectBody(new PayloadTooLargeError('PDF is too large'))
        request.destroy()
        return
      }

      chunks.push(chunk)
    })

    request.on('end', () => resolveBody(Buffer.concat(chunks)))
    request.on('error', rejectBody)
  })
}

function getPublicBaseUrl(request) {
  const forwardedProto = request.headers['x-forwarded-proto']
  const forwardedHost = request.headers['x-forwarded-host']
  const proto =
    typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0]
      : request.socket.encrypted
        ? 'https'
        : 'http'
  const host =
    typeof forwardedHost === 'string'
      ? forwardedHost.split(',')[0]
      : request.headers.host

  return `${proto}://${host ?? `127.0.0.1:${port}`}`
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function createSafePdfFileName(fileName) {
  const trimmed = (fileName ?? '').trim()
  const baseName = trimmed
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')

  return `${baseName || `乘风文档扫描-${getDateStamp()}`}.pdf`
}

function createInlineDisposition(fileName) {
  const asciiFallback = fileName.replace(/[^\w.-]+/g, '-')

  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`
}

function getDateStamp() {
  return new Date().toISOString().slice(0, 10)
}

async function cleanupExpiredPdfs() {
  const entries = await readdir(uploadDir, { withFileTypes: true }).catch(() => [])
  const now = Date.now()

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.pdf'))
      .map(async (entry) => {
        const filePath = join(uploadDir, entry.name)
        const fileInfo = await stat(filePath).catch(() => null)

        if (!fileInfo || now - fileInfo.mtimeMs <= pdfTtlMs) {
          return
        }

        await rm(filePath, { force: true })
      }),
  )
}

class PayloadTooLargeError extends Error {}
