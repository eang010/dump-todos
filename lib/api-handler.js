import {
  archiveItem,
  archiveMany,
  createItem,
  env,
  listItems,
  readBody,
  requestCreds,
  send,
  updateItem,
} from './notion.js'

function hasNotionEnv() {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID)
}

function notionStore(creds) {
  return {
    list: () => listItems(creds),
    create: (body) => createItem(body, creds),
    update: (id, body) => updateItem(id, body, creds),
    archive: (id) => archiveItem(id, creds),
    archiveMany: (ids) => archiveMany(ids, creds),
  }
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
      when: null,
      focus: false,
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
        when: body.when ?? null,
        focus: Boolean(body.focus),
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
      const next = {
        ...prev,
        ...body,
        id,
        focus: body.focus !== undefined ? Boolean(body.focus) : prev.focus,
      }
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

let memory

/**
 * Serve /api/todos and /api/clear-done. Returns false when the request is not an API call.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleApi(req, res) {
  const url = (req.url || '').split('?')[0]
  if (!url.startsWith('/api/')) return false
  let store
  try {
    const headerCreds = requestCreds(req)
    store = headerCreds
      ? notionStore(headerCreds)
      : hasNotionEnv()
        ? notionStore(env())
        : (memory ??= memoryApi())
    if (url === '/api/todos' || url === '/api/todos/') {
      if (req.method === 'GET') {
        send(res, 200, await store.list())
        return true
      }
      if (req.method === 'POST') {
        send(res, 201, await store.create(await readBody(req)))
        return true
      }
    }
    const one = url.match(/^\/api\/todos\/([^/]+)$/)
    if (one) {
      const id = decodeURIComponent(one[1])
      if (req.method === 'PATCH') {
        send(res, 200, await store.update(id, await readBody(req)))
        return true
      }
      if (req.method === 'DELETE') {
        await store.archive(id)
        send(res, 204)
        return true
      }
    }
    if (url === '/api/clear-done' && req.method === 'POST') {
      const all = await store.list()
      const gone = new Set(
        all.filter((item) => !item.parentId && item.done).map((item) => item.id),
      )
      const ids = all
        .filter((item) => gone.has(item.id) || gone.has(item.parentId))
        .map((item) => item.id)
      await store.archiveMany(ids)
      send(res, 200, { archived: ids.length })
      return true
    }
    send(res, 404, { error: 'not_found' })
  } catch (err) {
    if (!res.writableEnded) {
      send(res, err.status || 500, { error: err.message || 'error' })
    }
  }
  return true
}
