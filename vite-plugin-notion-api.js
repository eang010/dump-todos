import { loadEnv } from 'vite'
import { handleApi } from './lib/api-handler.js'

function applyEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['NOTION_TOKEN', 'NOTION_DATABASE_ID']) {
    if (env[key]) process.env[key] = env[key]
  }
}

export function notionApi() {
  return {
    name: 'notion-api',
    configResolved(config) {
      applyEnv(config.mode)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await handleApi(req, res)) return
        next()
      })
    },
  }
}
