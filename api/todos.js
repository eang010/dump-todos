import { createItem, handle, listItems, listSections, readBody, requestCreds, send } from '../lib/notion.js'

export default async function handler(req, res) {
  await handle(res, async () => {
    const creds = requestCreds(req)
    if (!creds) {
      send(res, 503, { error: 'missing_env' })
      return
    }
    if (req.method === 'GET') {
      const [items, sections] = await Promise.all([
        listItems(creds),
        listSections(creds),
      ])
      send(res, 200, { items, sections })
      return
    }
    if (req.method === 'POST') {
      const item = await readBody(req)
      send(res, 201, await createItem(item, creds))
      return
    }
    send(res, 405, { error: 'method' })
  })
}
