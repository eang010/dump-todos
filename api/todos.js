import { createItem, handle, listItems, readBody, send } from '../lib/notion.js'

export default async function handler(req, res) {
  await handle(res, async () => {
    if (req.method === 'GET') {
      send(res, 200, await listItems())
      return
    }
    if (req.method === 'POST') {
      const item = await readBody(req)
      send(res, 201, await createItem(item))
      return
    }
    send(res, 405, { error: 'method' })
  })
}
