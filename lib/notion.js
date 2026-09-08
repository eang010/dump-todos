const NOTION = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

const SECTION_LABEL = {
  work: 'Work',
  personal: 'Personal',
  ideas: 'Ideas',
  inbox: 'Inbox',
}

const SECTION_KEY = {
  Work: 'work',
  Personal: 'personal',
  Ideas: 'ideas',
  Inbox: 'inbox',
}

export function env() {
  const token = process.env.NOTION_TOKEN
  const databaseId = process.env.NOTION_DATABASE_ID?.replace(/-/g, '')
  if (!token || !databaseId) {
    const err = new Error('missing_env')
    err.status = 503
    throw err
  }
  return { token, databaseId }
}

async function notion(path, { method = 'GET', body } = {}) {
  const { token } = env()
  const res = await fetch(`${NOTION}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
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
    section: SECTION_KEY[sectionName] || 'inbox',
    done: Boolean(page.properties?.Done?.checkbox),
    parentId: plain(page.properties?.Parent) || null,
    order: page.properties?.Order?.number ?? 0,
    createdAt: Date.parse(page.created_time) || 0,
  }
}

export function itemProperties(item) {
  return {
    Name: {
      title: [{ text: { content: String(item.text || '').slice(0, 2000) } }],
    },
    Section: { select: { name: SECTION_LABEL[item.section] || 'Inbox' } },
    Done: { checkbox: Boolean(item.done) },
    Order: { number: Number(item.order) || 0 },
    Parent: {
      rich_text: item.parentId ? [{ text: { content: item.parentId } }] : [],
    },
  }
}

export async function listItems() {
  const { databaseId } = env()
  const pages = []
  let cursor
  do {
    const data = await notion(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 },
    })
    pages.push(...data.results.filter((page) => page.object === 'page'))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return pages.map(pageToItem)
}

export async function createItem(item) {
  const { databaseId } = env()
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: databaseId },
      properties: itemProperties(item),
    },
  })
  return pageToItem(page)
}

export async function updateItem(id, item) {
  const page = await notion(`/pages/${id}`, {
    method: 'PATCH',
    body: { properties: itemProperties(item) },
  })
  return pageToItem(page)
}

export async function archiveItem(id) {
  await notion(`/pages/${id}`, {
    method: 'PATCH',
    body: { archived: true },
  })
}

export async function archiveMany(ids) {
  for (const id of ids) await archiveItem(id)
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
