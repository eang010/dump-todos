const NOTION = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

export const DEFAULT_SECTIONS = ['Work', 'Personal', 'Ideas', 'Inbox']

const WHEN_LABEL = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
}

const WHEN_KEY = {
  Today: 'today',
  Tomorrow: 'tomorrow',
  'This week': 'week',
  Later: 'later',
}

function missingEnv() {
  const err = new Error('missing_env')
  err.status = 503
  return err
}

export function credsFrom(source) {
  const token = source?.token?.trim()
  const databaseId = String(source?.databaseId || '').replace(/-/g, '').trim()
  if (!token || !databaseId) throw missingEnv()
  return { token, databaseId }
}

export function env() {
  return credsFrom({
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.NOTION_DATABASE_ID,
  })
}

function headerValue(req, name) {
  const value = req.headers?.[name]
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Headers from the browser, or null when the request did not send any. */
export function requestCreds(req) {
  const token = headerValue(req, 'x-notion-token')
  const databaseId = headerValue(req, 'x-notion-database-id')
  if (!token && !databaseId) return null
  return credsFrom({ token, databaseId })
}

async function notion(creds, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${NOTION}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || res.statusText)
    err.status = res.status
    throw err
  }
  return data
}

function titleOf(page) {
  const title = Object.values(page.properties || {}).find((p) => p.type === 'title')
  return title?.title?.map((t) => t.plain_text).join('') ?? ''
}

function plain(prop) {
  if (prop?.type !== 'rich_text') return ''
  return prop.rich_text.map((t) => t.plain_text).join('')
}

export function pageToItem(page) {
  const sectionName = page.properties?.Section?.select?.name
  return {
    id: page.id,
    text: titleOf(page),
    section: sectionName || '',
    done: Boolean(page.properties?.Done?.checkbox),
    parentId: plain(page.properties?.Parent) || null,
    order: page.properties?.Order?.number ?? 0,
    when: WHEN_KEY[page.properties?.When?.select?.name] || null,
    focus: Boolean(page.properties?.Focus?.checkbox),
    createdAt: Date.parse(page.created_time) || 0,
  }
}

export function itemProperties(item) {
  return {
    Name: {
      title: [{ text: { content: String(item.text || '').slice(0, 2000) } }],
    },
    Section: { select: item.section ? { name: item.section } : null },
    Done: { checkbox: Boolean(item.done) },
    Order: { number: Number(item.order) || 0 },
    Parent: {
      rich_text: item.parentId ? [{ text: { content: item.parentId } }] : [],
    },
    When: item.when
      ? { select: { name: WHEN_LABEL[item.when] } }
      : { select: null },
    Focus: { checkbox: Boolean(item.focus) },
  }
}

const readyDatabases = new Set()

async function ensureSchema(creds) {
  const auth = credsFrom(creds)
  if (readyDatabases.has(auth.databaseId)) return
  const { databaseId } = auth
  const db = await notion(auth, `/databases/${databaseId}`)
  const patch = {}
  if (db.properties?.When?.type !== 'select') {
    patch.When = {
      select: {
        options: [
          { name: 'Today' },
          { name: 'Tomorrow' },
          { name: 'This week' },
          { name: 'Later' },
        ],
      },
    }
  }
  if (db.properties?.Focus?.type !== 'checkbox') {
    patch.Focus = { checkbox: {} }
  }
  if (Object.keys(patch).length) {
    await notion(auth, `/databases/${databaseId}`, {
      method: 'PATCH',
      body: { properties: patch },
    })
  }
  readyDatabases.add(databaseId)
}

export async function listSections(creds) {
  const auth = credsFrom(creds)
  const db = await notion(auth, `/databases/${auth.databaseId}`)
  const options = db.properties?.Section?.select?.options
  const names = Array.isArray(options)
    ? options.map((option) => option?.name).filter(Boolean)
    : []
  return names.length ? names : DEFAULT_SECTIONS
}

export async function listItems(creds) {
  const auth = credsFrom(creds)
  await ensureSchema(auth)
  const pages = []
  let cursor
  do {
    const data = await notion(auth, `/databases/${auth.databaseId}/query`, {
      method: 'POST',
      body: cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 },
    })
    pages.push(...data.results.filter((page) => page.object === 'page'))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return pages.map(pageToItem)
}

export async function createItem(item, creds) {
  const auth = credsFrom(creds)
  await ensureSchema(auth)
  const page = await notion(auth, '/pages', {
    method: 'POST',
    body: {
      parent: { database_id: auth.databaseId },
      properties: itemProperties(item),
    },
  })
  return pageToItem(page)
}

export async function updateItem(id, item, creds) {
  const auth = credsFrom(creds)
  try {
    return await patchPage(auth, id, { properties: itemProperties(item) })
  } catch (err) {
    if (/(When|Focus) is not a property/i.test(err.message || '')) {
      readyDatabases.delete(auth.databaseId)
      await ensureSchema(auth)
      return await patchPage(auth, id, { properties: itemProperties(item) })
    }
    if (!/archived/i.test(err.message || '')) throw err
    await patchPage(auth, id, { archived: false })
    return await patchPage(auth, id, { properties: itemProperties(item) })
  }
}

async function patchPage(creds, id, body) {
  const page = await notion(creds, `/pages/${id}`, { method: 'PATCH', body })
  return page?.id ? pageToItem(page) : page
}

export async function archiveItem(id, creds) {
  const auth = credsFrom(creds)
  try {
    await notion(auth, `/pages/${id}`, {
      method: 'PATCH',
      body: { archived: true },
    })
  } catch (err) {
    if (/archived/i.test(err.message || '')) return
    throw err
  }
}

export async function archiveMany(ids, creds) {
  const auth = credsFrom(creds)
  for (const id of ids) await archiveItem(id, auth)
}

export function send(res, status, body) {
  res.statusCode = status
  if (status === 204) {
    res.end()
    return
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body ?? {}))
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body)
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) : {}
}

export async function handle(res, run) {
  try {
    await run()
  } catch (err) {
    send(res, err.status || 500, { error: err.message || 'error' })
  }
}
