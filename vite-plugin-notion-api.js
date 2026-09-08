import { loadEnv } from 'vite'
import {
  archiveItem,
  archiveMany,
  createItem,
  listItems,
  updateItem,
} from './lib/notion.js'

function applyEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['NOTION_TOKEN', 'NOTION_DATABASE_ID']) {
    if (env[key]) process.env[key] = env[key]
  }
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  if (status === 204) {
    res.end()
    return
  }
  res.end(JSON.stringify(body ?? {}))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) : {}
}

export function notionApi() {
  return {
    name: 'notion-api',
    configResolved(config) {
      applyEnv(config.mode)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (!url.startsWith('/api/')) return next()
        try {
          if (url === '/api/todos' || url === '/api/todos/') {
            if (req.method === 'GET') {
              send(res, 200, await listItems())
              return
            }
            if (req.method === 'POST') {
              send(res, 201, await createItem(await readBody(req)))
              return
            }
          }
          const one = url.match(/^\/api\/todos\/([^/]+)$/)
          if (one) {
            const id = decodeURIComponent(one[1])
            if (req.method === 'PATCH') {
              send(res, 200, await updateItem(id, await readBody(req)))
              return
            }
            if (req.method === 'DELETE') {
              await archiveItem(id)
              send(res, 204)
              return
            }
          }
          if (url === '/api/clear-done' && req.method === 'POST') {
            const items = await listItems()
            const gone = new Set(
              items
                .filter((item) => !item.parentId && item.done)
                .map((item) => item.id),
            )
            const ids = items
              .filter((item) => gone.has(item.id) || gone.has(item.parentId))
              .map((item) => item.id)
            await archiveMany(ids)
            send(res, 200, { archived: ids.length })
            return
          }
          send(res, 404, { error: 'not_found' })
        } catch (err) {
          send(res, err.status || 500, { error: err.message || 'error' })
        }
      })
    },
  }
}
