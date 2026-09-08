import { useEffect, useRef, useState } from 'react'
import {
  clearDoneRemote,
  createTodo,
  deleteTodo,
  fetchTodos,
  isPersisted,
  persistDiff,
} from './api.js'
import { parseDump } from './classify.js'
import { moveItem, zoneFromPoint } from './move.js'

const SECTIONS = ['work', 'personal', 'ideas', 'inbox']
const LABELS = {
  work: 'Work',
  personal: 'Personal',
  ideas: 'Ideas',
  inbox: 'Inbox',
}

function forest(items, section, done) {
  const kidsOf = (id) =>
    items
      .filter((item) => item.parentId === id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return items
    .filter(
      (item) =>
        !item.parentId &&
        item.done === done &&
        (section == null || item.section === section),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => ({ ...item, children: kidsOf(item.id) }))
}

function later(fn) {
  queueMicrotask(fn)
}

export default function App() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [over, setOver] = useState(null)
  const dumpRef = useRef(null)
  const doneRef = useRef(null)
  const dirtyRef = useRef(false)

  function resizeDump() {
    const el = dumpRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  async function refresh() {
    if (dirtyRef.current) return
    const data = await fetchTodos()
    setItems(data)
    setStatus('ready')
    setError('')
  }

  useEffect(() => {
    let cancelled = false
    fetchTodos()
      .then((data) => {
        if (cancelled) return
        setItems(data)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus(err.code === 'missing_env' ? 'setup' : 'error')
        setError(err.message)
      })
    function onFocus() {
      if (document.visibilityState !== 'visible') return
      refresh().catch(() => {})
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  function dump(text) {
    const parsed = parseDump(text)
    if (!parsed.length) return
    const now = Date.now()
    dirtyRef.current = true
    setItems((prev) => {
      const base = prev.reduce((min, item) => Math.min(min, item.order ?? 0), 0)
      const added = parsed.map((row, i) => ({
        id: `${now}-${i}`,
        text: row.text,
        section: row.section,
        done: false,
        parentId: null,
        order: base - parsed.length + i,
        createdAt: now + i,
      }))
      later(async () => {
        try {
          const saved = []
          for (const item of added) saved.push([item.id, await createTodo(item)])
          const map = new Map(saved.map(([old, next]) => [old, next]))
          setItems((cur) =>
            cur.map((item) => {
              if (map.has(item.id)) return map.get(item.id)
              if (item.parentId && map.has(item.parentId)) {
                return { ...item, parentId: map.get(item.parentId).id }
              }
              return item
            }),
          )
          dirtyRef.current = false
        } catch (err) {
          setError(err.message)
        }
      })
      return [...added, ...prev]
    })
    setDraft('')
    requestAnimationFrame(() => {
      if (dumpRef.current) dumpRef.current.style.height = ''
    })
  }

  function onDumpSubmit(e) {
    e.preventDefault()
    dump(draft)
  }

  function onDumpKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      dump(draft)
    }
  }

  function patch(id, partial) {
    dirtyRef.current = true
    setItems((prev) => {
      const next = prev.map((item) => {
        if (item.id === id) return { ...item, ...partial }
        if (partial.section && item.parentId === id) {
          return { ...item, section: partial.section }
        }
        if (partial.done === true && item.parentId === id) {
          return { ...item, done: true }
        }
        return item
      })
      later(() =>
        persistDiff(prev, next)
          .then(() => {
            dirtyRef.current = false
          })
          .catch((err) => setError(err.message)),
      )
      return next
    })
    const target = items.find((item) => item.id === id)
    if (partial.done && target && !target.parentId && doneRef.current) {
      doneRef.current.open = true
    }
  }

  function remove(id) {
    dirtyRef.current = true
    setItems((prev) => {
      const gone = prev.filter((item) => item.id === id || item.parentId === id)
      later(() =>
        Promise.all(
          gone.filter((item) => isPersisted(item.id)).map((item) => deleteTodo(item.id)),
        )
          .then(() => {
            dirtyRef.current = false
          })
          .catch((err) => setError(err.message)),
      )
      return prev.filter((item) => item.id !== id && item.parentId !== id)
    })
    if (editingId === id) setEditingId(null)
  }

  function clearDone() {
    dirtyRef.current = true
    setItems((prev) => {
      const gone = new Set(
        prev.filter((item) => !item.parentId && item.done).map((item) => item.id),
      )
      later(() =>
        clearDoneRemote()
          .then(() => {
            dirtyRef.current = false
          })
          .catch((err) => setError(err.message)),
      )
      return prev.filter(
        (item) => !gone.has(item.id) && !gone.has(item.parentId),
      )
    })
  }

  function onDragStart(e, id) {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDragId(id)
  }

  function onDragEnd() {
    setDragId(null)
    setOver(null)
  }

  function applyDrop(dest, id = dragId) {
    if (!id) return
    dirtyRef.current = true
    setItems((prev) => {
      const next = moveItem(prev, id, dest)
      later(() =>
        persistDiff(prev, next)
          .then(() => {
            dirtyRef.current = false
          })
          .catch((err) => setError(err.message)),
      )
      return next
    })
    setDragId(null)
    setOver(null)
  }

  const dnd = { dragId, over, setOver, onDragStart, onDragEnd, applyDrop }

  const open = SECTIONS.map((section) => ({
    section,
    nodes: forest(items, section, false),
  }))
  const doneNodes = forest(items, null, true)
  const blocked = status !== 'ready'

  return (
    <div className="app">
      <header className="top">
        <h1>To Do List</h1>
        {status === 'setup' && <Setup />}
        {status === 'error' && (
          <p className="banner">{error || 'Could not reach Notion.'}</p>
        )}
        {status === 'loading' && <p className="hint">Loading…</p>}
        {error && status === 'ready' && <p className="banner">{error}</p>}
        <form className="dump" onSubmit={onDumpSubmit}>
          <textarea
            ref={dumpRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              resizeDump()
            }}
            onKeyDown={onDumpKey}
            placeholder="Dump a to-do…"
            rows={1}
            autoFocus
            disabled={blocked}
            aria-label="Dump a to-do"
          />
          <button type="submit" disabled={blocked || !draft.trim()}>
            Add
          </button>
        </form>
        <p className="hint">
          Dump every task here. Drag onto another row to nest it. Drop on a
          section name to move it. Prefix <kbd>w:</kbd> <kbd>p:</kbd>{' '}
          <kbd>i:</kbd> to force a bucket.
        </p>
      </header>

      {status === 'ready' && (
        <main>
        {open.map(({ section, nodes }) => (
          <section
            key={section}
            className={`bucket${over?.type === 'section' && over.section === section ? ' drop-section' : ''}`}
            data-section={section}
          >
            <header
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setOver({ type: 'section', section })
              }}
              onDrop={(e) => {
                e.preventDefault()
                applyDrop(
                  { type: 'section', section },
                  e.dataTransfer.getData('text/plain') || dragId,
                )
              }}
            >
              <h2>{LABELS[section]}</h2>
              <span>{nodes.length}</span>
            </header>
            {nodes.length === 0 ? (
              <p
                className="empty"
                onDragOver={(e) => {
                  if (!dragId) return
                  e.preventDefault()
                  setOver({ type: 'section', section })
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  applyDrop(
                    { type: 'section', section },
                    e.dataTransfer.getData('text/plain') || dragId,
                  )
                }}
              >
                Nothing here
              </p>
            ) : (
              <ul>
                {nodes.map((node) => (
                  <Block
                    key={node.id}
                    node={node}
                    editingId={editingId}
                    onEdit={setEditingId}
                    onPatch={patch}
                    onRemove={remove}
                    dnd={dnd}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}

        <details className="done" ref={doneRef}>
          <summary>
            Done <span>{doneNodes.length}</span>
          </summary>
          {doneNodes.length === 0 ? (
            <p className="empty">Checked-off items land here</p>
          ) : (
            <>
              <ul>
                {doneNodes.map((node) => (
                  <Block
                    key={node.id}
                    node={node}
                    editingId={editingId}
                    onEdit={setEditingId}
                    onPatch={patch}
                    onRemove={remove}
                    dnd={dnd}
                  />
                ))}
              </ul>
              <button type="button" className="clear" onClick={clearDone}>
                Clear done
              </button>
            </>
          )}
        </details>
        </main>
      )}
    </div>
  )
}

function Setup() {
  return (
    <div className="setup">
      <p>Connect a Notion database, then reload.</p>
      <ol>
        <li>
          Create an internal integration at{' '}
          <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">
            notion.so/my-integrations
          </a>
        </li>
        <li>
          Make a full-page database with <strong>Name</strong> (title),{' '}
          <strong>Section</strong> (select: Work, Personal, Ideas, Inbox),{' '}
          <strong>Done</strong> (checkbox), <strong>Order</strong> (number),{' '}
          <strong>Parent</strong> (text).
        </li>
        <li>Share the database with the integration.</li>
        <li>
          Set <code>NOTION_TOKEN</code> and <code>NOTION_DATABASE_ID</code> in
          Vercel env (or <code>.env</code> for <code>npx vercel dev</code>).
        </li>
      </ol>
    </div>
  )
}

function Block({ node, editingId, onEdit, onPatch, onRemove, dnd }) {
  return (
    <li className={`block${dnd.dragId === node.id ? ' dragging' : ''}`}>
      <Row
        item={node}
        child={false}
        editing={editingId === node.id}
        progress={
          node.children.length
            ? `${node.children.filter((c) => c.done).length}/${node.children.length}`
            : null
        }
        onEdit={() => onEdit(node.id)}
        onStopEdit={() => onEdit(null)}
        onPatch={onPatch}
        onRemove={onRemove}
        dnd={dnd}
      />
      {node.children.length > 0 && (
        <ul className="kids">
          {node.children.map((child) => (
            <li key={child.id}>
              <Row
                item={child}
                child
                editing={editingId === child.id}
                progress={null}
                onEdit={() => onEdit(child.id)}
                onStopEdit={() => onEdit(null)}
                onPatch={onPatch}
                onRemove={onRemove}
                dnd={dnd}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Row({
  item,
  child,
  editing,
  progress,
  onEdit,
  onStopEdit,
  onPatch,
  onRemove,
  dnd,
}) {
  const [value, setValue] = useState(item.text)
  const zone =
    dnd.over?.type === 'row' && dnd.over.id === item.id ? dnd.over.where : null

  useEffect(() => {
    setValue(item.text)
  }, [item.text])

  function save() {
    const next = value.trim()
    if (!next) {
      setValue(item.text)
    } else if (next !== item.text) {
      onPatch(item.id, { text: next })
    }
    onStopEdit()
  }

  function onDragOver(e) {
    if (!dnd.dragId || dnd.dragId === item.id) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const where = zoneFromPoint(
      e.clientY,
      e.currentTarget.getBoundingClientRect(),
      child,
    )
    dnd.setOver({ type: 'row', id: item.id, where })
  }

  function onDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    const where = zoneFromPoint(
      e.clientY,
      e.currentTarget.getBoundingClientRect(),
      child,
    )
    dnd.applyDrop(
      { type: 'row', id: item.id, where },
      e.dataTransfer.getData('text/plain') || dnd.dragId,
    )
  }

  return (
    <div
      className={`row${child ? ' child' : ''}${item.done ? ' is-done' : ''}${child && dnd.dragId === item.id ? ' dragging' : ''}${zone ? ` drop-${zone}` : ''}`}
      data-section={item.section}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span
        className="grip"
        draggable={!editing}
        aria-label={`Drag ${item.text}`}
        onDragStart={(e) => dnd.onDragStart(e, item.id)}
        onDragEnd={dnd.onDragEnd}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => onPatch(item.id, { done: e.target.checked })}
          aria-label={`Mark ${item.text} done`}
        />
      </label>
      {editing ? (
        <input
          className="edit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setValue(item.text)
              onStopEdit()
            }
          }}
          autoFocus
        />
      ) : (
        <button type="button" className="text" onClick={onEdit}>
          {item.text}
          {progress && <span className="progress">{progress}</span>}
        </button>
      )}
      {!child && (
        <select
          className="chip"
          value={item.section}
          aria-label="Move to section"
          onChange={(e) => onPatch(item.id, { section: e.target.value })}
        >
          {SECTIONS.map((section) => (
            <option key={section} value={section}>
              {LABELS[section]}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="drop"
        aria-label={`Remove ${item.text}`}
        onClick={() => onRemove(item.id)}
      >
        ×
      </button>
    </div>
  )
}
