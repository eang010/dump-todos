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

function hasNotionEnv() {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID)
}

/** In-memory store for local UI testing when Notion env is unset. */
function memoryApi() {
  let seq = 1
  const items = new Map()
  const seed = [
    { text: 'Launch site', section: 'work', parentId: null, order: 0 },
    { text: 'Write copy', section: 'work', parentId: null, order: 1 },
    { text: 'Buy milk', section: 'personal', parentId: null, order: 0 },
  ]
  for (const row of seed) {
    const id = `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`
    items.set(id, {
      id,
      text: row.text,
      section: row.section,
      done: false,
      parentId: row.parentId,
      order: row.order,
      createdAt: Date.now(),
    })
  }
  return {
    list: async () => [...items.values()],
    create: async (body) => {
      const id = `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`
      const item = {
        id,
        text: body.text ?? '',
        section: body.section ?? 'inbox',
        done: Boolean(body.done),
        parentId: body.parentId ?? null,
        order: body.order ?? 0,
        createdAt: body.createdAt ?? Date.now(),
      }
      items.set(id, item)
      return item
    },
    update: async (id, body) => {
      const prev = items.get(id)
      if (!prev) {
        const err = new Error('not_found')
        err.status = 404
        throw err
      }
      const next = { ...prev, ...body, id }
      items.set(id, next)
      return next
    },
    archive: async (id) => {
      items.delete(id)
    },
    archiveMany: async (ids) => {
      for (const id of ids) items.delete(id)
    },
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
  let memory
  return {
    name: 'notion-api',
    configResolved(config) {
      applyEnv(config.mode)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (!url.startsWith('/api/')) return next()
        const store = hasNotionEnv()
          ? {
              list: listItems,
              create: createItem,
              update: updateItem,
              archive: archiveItem,
              archiveMany,
            }
          : (memory ??= memoryApi())
        try {
          if (url === '/api/todos' || url === '/api/todos/') {
            if (req.method === 'GET') {
              send(res, 200, await store.list())
              return
            }
            if (req.method === 'POST') {
              send(res, 201, await store.create(await readBody(req)))
              return
            }
          }
          const one = url.match(/^\/api\/todos\/([^/]+)$/)
          if (one) {
            const id = decodeURIComponent(one[1])
            if (req.method === 'PATCH') {
              send(res, 200, await store.update(id, await readBody(req)))
              return
            }
            if (req.method === 'DELETE') {
              await store.archive(id)
              send(res, 204)
              return
            }
          }
          if (url === '/api/clear-done' && req.method === 'POST') {
            const all = await store.list()
            const gone = new Set(
              all
                .filter((item) => !item.parentId && item.done)
                .map((item) => item.id),
            )
            const ids = all
              .filter((item) => gone.has(item.id) || gone.has(item.parentId))
              .map((item) => item.id)
            await store.archiveMany(ids)
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
