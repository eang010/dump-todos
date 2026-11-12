import { createItem, handle, listItems, readBody, requestCreds, send } from '../lib/notion.js'

export default async function handler(req, res) {
  await handle(res, async () => {
    const creds = requestCreds(req)
    if (!creds) {
      send(res, 503, { error: 'missing_env' })
      return
    }
    if (req.method === 'GET') {
      send(res, 200, await listItems(creds))
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
