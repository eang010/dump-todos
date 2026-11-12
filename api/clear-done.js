import { archiveMany, handle, listItems, requestCreds, send } from '../lib/notion.js'

export default async function handler(req, res) {
  await handle(res, async () => {
    const creds = requestCreds(req)
    if (!creds) {
      send(res, 503, { error: 'missing_env' })
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'method' })
      return
    }
    const items = await listItems(creds)
    const gone = new Set(
      items.filter((item) => !item.parentId && item.done).map((item) => item.id),
    )
    const ids = items
      .filter((item) => gone.has(item.id) || gone.has(item.parentId))
      .map((item) => item.id)
    await archiveMany(ids, creds)
    send(res, 200, { archived: ids.length })
  })
}
