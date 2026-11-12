import { archiveItem, handle, readBody, requestCreds, send, updateItem } from '../../lib/notion.js'

export default async function handler(req, res) {
  const id = [].concat(req.query.id)[0]
  await handle(res, async () => {
    const creds = requestCreds(req)
    if (!creds) {
      send(res, 503, { error: 'missing_env' })
      return
    }
    if (!id) {
      send(res, 400, { error: 'missing_id' })
      return
    }
    if (req.method === 'PATCH') {
      const item = await readBody(req)
      send(res, 200, await updateItem(id, item, creds))
      return
    }
    if (req.method === 'DELETE') {
      await archiveItem(id, creds)
      send(res, 204, {})
      return
    }
    send(res, 405, { error: 'method' })
  })
}
