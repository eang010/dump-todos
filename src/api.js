export function isPersisted(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  )
}

async function json(res) {
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('API is not running. Use npm run dev (with .env) or npx vercel dev.')
  }
}

export async function fetchTodos() {
  const res = await fetch('/api/todos')
  const data = await json(res)
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText)
    err.status = res.status
    err.code = data?.error
    throw err
  }
  return data
}

export async function createTodo(item) {
  const res = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  const data = await json(res)
  if (!res.ok) throw new Error(data?.error || res.statusText)
  return data
}

export async function updateTodo(item) {
  const res = await fetch(`/api/todos/${item.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  const data = await json(res)
  if (!res.ok) throw new Error(data?.error || res.statusText)
  return data
}

export async function deleteTodo(id) {
  const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) {
    const data = await json(res)
    throw new Error(data?.error || res.statusText)
  }
}

export async function clearDoneRemote() {
  const res = await fetch('/api/clear-done', { method: 'POST' })
  const data = await json(res)
  if (!res.ok) throw new Error(data?.error || res.statusText)
}

function same(a, b) {
  return (
    a.text === b.text &&
    a.section === b.section &&
    a.done === b.done &&
    a.parentId === b.parentId &&
    a.order === b.order
  )
}

export async function persistDiff(prev, next) {
  const oldBy = new Map(prev.map((item) => [item.id, item]))
  await Promise.all(
    next
      .filter((item) => isPersisted(item.id))
      .filter((item) => {
        const old = oldBy.get(item.id)
        return !old || !same(old, item)
      })
      .map(updateTodo),
  )
}
