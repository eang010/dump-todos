import { archiveMany, handle, listItems, send } from '../lib/notion.js'

export default async function handler(req, res) {
  await handle(res, async () => {
    if (req.method !== 'POST') {
      send(res, 405, { error: 'method' })
      return
    }
    const items = await listItems()
    const gone = new Set(
      items.filter((item) => !item.parentId && item.done).map((item) => item.id),
    )
    const ids = items
      .filter((item) => gone.has(item.id) || gone.has(item.parentId))
      .map((item) => item.id)
    await archiveMany(ids)
    send(res, 200, { archived: ids.length })
  })
}
