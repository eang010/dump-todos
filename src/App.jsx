import { useEffect, useRef, useState } from 'react'
import {
  clearDoneRemote,
  createTodo,
  deleteTodo,
  fetchTodos,
  isPersisted,
  persistDiff,
  enqueueWrite,
} from './api.js'
import { parseDump } from './classify.js'
import { destFromPoint } from './dnd.js'
import { focusForest, forest } from './forest.js'
import { moveItem } from './move.js'

const SECTIONS = ['work', 'personal', 'ideas', 'inbox']
const LABELS = {
  work: 'Work',
  personal: 'Personal',
  ideas: 'Ideas',
  inbox: 'Inbox',
}
const WHENS = [
  { value: '', label: 'Anytime' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
  { value: 'later', label: 'Later' },
]
const WHEN_HEAD = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
}

function clusters(nodes) {
  if (!nodes.some((node) => node.when)) {
    return [{ key: '', label: null, nodes }]
  }
  const buckets = { today: [], tomorrow: [], week: [], later: [], '': [] }
  for (const node of nodes) {
    ;(buckets[node.when] || buckets['']).push(node)
  }
  return ['today', 'tomorrow', 'week', 'later', '']
    .filter((key) => buckets[key].length)
    .map((key) => ({
      key,
      label: WHEN_HEAD[key] || null,
      nodes: buckets[key],
    }))
}

function later(fn) {
  queueMicrotask(fn)
}

export default function App() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [dumpFocused, setDumpFocused] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [over, setOver] = useState(null)
  /** null | 'picking' | 'active' */
  const [focusMode, setFocusMode] = useState(null)
  const dumpRef = useRef(null)
  const doneRef = useRef(null)
  const dirtyRef = useRef(false)
  const itemsRef = useRef(items)
  const dragIdRef = useRef(null)
  const overRef = useRef(null)
  const dragActiveRef = useRef(false)
  itemsRef.current = items

  function liveIds() {
    return new Set(itemsRef.current.map((item) => item.id))
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
        when: null,
        focus: false,
        createdAt: now + i,
      }))
      later(() =>
        enqueueWrite(async () => {
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
        }).catch((err) => setError(err.message)),
      )
      return [...added, ...prev]
    })
    setDraft('')
  }

  function onDumpSubmit(e) {
    e.preventDefault()
    dump(draft)
  }

  function onDumpPaste(e) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\n')) return
    e.preventDefault()
    dump(text)
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
        enqueueWrite(() => persistDiff(prev, next, liveIds()))
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
        enqueueWrite(() =>
          Promise.all(
            gone
              .filter((item) => isPersisted(item.id))
              .map((item) => deleteTodo(item.id)),
          ),
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
        enqueueWrite(() => clearDoneRemote())
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

  function clearFocusSelection() {
    dirtyRef.current = true
    setItems((prev) => {
      const next = prev.map((item) =>
        item.focus ? { ...item, focus: false } : item,
      )
      later(() =>
        enqueueWrite(() => persistDiff(prev, next, liveIds()))
          .then(() => {
            dirtyRef.current = false
          })
          .catch((err) => setError(err.message)),
      )
      return next
    })
  }

  function clearDrag() {
    dragActiveRef.current = false
    dragIdRef.current = null
    overRef.current = null
    setDragId(null)
    setOver(null)
  }

  function applyDrop(dest, id = dragIdRef.current) {
    if (!id || !dest || focusMode) {
      clearDrag()
      return
    }
    dirtyRef.current = true
    setItems((prev) => {
      const next = moveItem(prev, id, dest)
      later(() =>
        enqueueWrite(() => persistDiff(prev, next, liveIds()))
          .then(() => {
            dirtyRef.current = false
          })
          .catch((err) => setError(err.message)),
      )
      return next
    })
    clearDrag()
  }

  function onGripPointerDown(e, id) {
    if (focusMode) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragActiveRef.current = true
    dragIdRef.current = id
    overRef.current = null
    setDragId(id)
    setOver(null)
  }

  function onGripPointerMove(e) {
    if (!dragActiveRef.current || !dragIdRef.current) return
    if (e.currentTarget.hasPointerCapture?.(e.pointerId) === false) return
    const dest = destFromPoint(e.clientX, e.clientY, dragIdRef.current)
    overRef.current = dest
    setOver(dest)
  }

  function onGripPointerUp(e) {
    if (!dragActiveRef.current) return
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    const id = dragIdRef.current
    const dest =
      overRef.current ||
      (id ? destFromPoint(e.clientX, e.clientY, id) : null)
    applyDrop(dest, id)
  }

  function onGripPointerCancel() {
    clearDrag()
  }

  const dnd = {
    dragId,
    over,
    onGripPointerDown,
    onGripPointerMove,
    onGripPointerUp,
    onGripPointerCancel,
  }

  const picking = focusMode === 'picking'
  const focused = focusMode === 'active'
  const open = SECTIONS.map((section) => ({
    section,
    nodes: forest(items, section, false),
  }))
  const doneNodes = forest(items, null, true)
  const focusNodes = focusForest(items)
  const focusCount = items.filter(
    (item) => !item.parentId && !item.done && item.focus,
  ).length
  const blocked = status !== 'ready'

  function onDockFocusAction() {
    if (focused) {
      setFocusMode(null)
      return
    }
    if (picking) {
      if (focusCount > 0) setFocusMode('active')
      else setFocusMode(null)
      return
    }
    setFocusMode('picking')
  }

  const primaryDockAction = focused
    ? 'exit'
    : picking
      ? focusCount > 0
        ? 'start'
        : 'cancel'
      : 'focus'

  return (
    <div className={`app${focused ? ' is-focus' : ''}${picking ? ' is-picking' : ''}`}>
      <header className="top">
        <h1>{focused ? 'Focus' : 'To Do List'}</h1>
        {picking && (
          <p className="hint">Tap root tasks to focus on. Nested tasks come along.</p>
        )}
        {focused && focusNodes.length === 0 && (
          <p className="hint">Nothing left in focus. Tap Change to pick again.</p>
        )}
        {status === 'setup' && <Setup />}
        {status === 'error' && (
          <p className="banner">{error || 'Could not reach Notion.'}</p>
        )}
        {status === 'loading' && <p className="hint">Loading…</p>}
        {error && status === 'ready' && <p className="banner">{error}</p>}
      </header>

      {status === 'ready' && focused && (
        <main>
          <section className="bucket focus-bucket">
            {focusNodes.length === 0 ? (
              <p className="empty">No focused tasks</p>
            ) : (
              <ul>
                {clusters(focusNodes).map((group) => (
                  <li key={group.key || 'rest'} className="cluster">
                    {group.label && <h3>{group.label}</h3>}
                    <ul>
                      {group.nodes.map((node) => (
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
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      )}

      {status === 'ready' && !focused && (
        <main>
        {open.map(({ section, nodes }) => (
          <section
            key={section}
            className={`bucket${over?.type === 'section' && over.section === section ? ' drop-section' : ''}`}
            data-section={section}
          >
            <header data-drop-section={section}>
              <h2>{LABELS[section]}</h2>
              <span>{nodes.length}</span>
            </header>
            {nodes.length === 0 ? (
              <p className="empty" data-drop-section={section}>
                Nothing here
              </p>
            ) : (
              <ul>
                {clusters(nodes).map((group) => (
                  <li key={group.key || 'rest'} className="cluster">
                    {group.label && <h3>{group.label}</h3>}
                    <ul>
                      {group.nodes.map((node) => (
                        <Block
                          key={node.id}
                          node={node}
                          editingId={editingId}
                          onEdit={setEditingId}
                          onPatch={patch}
                          onRemove={remove}
                          dnd={dnd}
                          picking={picking}
                          onToggleFocus={
                            picking
                              ? () => patch(node.id, { focus: !node.focus })
                              : undefined
                          }
                        />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {!picking && (
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
        )}
        </main>
      )}
      <footer className="dock">
        {dumpFocused && !picking && !focused && (
          <p className="dump-tip">Prefix w: p: i: to force a bucket</p>
        )}
        {picking && (
          <p className="dump-tip">
            {focusCount
              ? `${focusCount} selected — play to start, or clear all`
              : 'Tap tasks, or the button to cancel'}
          </p>
        )}
        <div className="dock-bar">
          <form className="dump" onSubmit={onDumpSubmit}>
            <input
              ref={dumpRef}
              type="text"
              enterKeyHint="done"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={onDumpPaste}
              onFocus={() => setDumpFocused(true)}
              onBlur={() => setDumpFocused(false)}
              placeholder="To-do…"
              disabled={blocked || picking}
              aria-label="Dump a to-do"
            />
          </form>
          {status === 'ready' && (
            <div className="dock-actions">
              {focused && (
                <button
                  type="button"
                  className="dock-action"
                  onClick={() => setFocusMode('picking')}
                  aria-label="Change focus selection"
                >
                  <DockIcon kind="change" />
                </button>
              )}
              {picking && focusCount > 0 && (
                <button
                  type="button"
                  className="dock-action"
                  onClick={clearFocusSelection}
                  aria-label="Clear all focus selections"
                >
                  <DockIcon kind="clear" />
                </button>
              )}
              <button
                type="button"
                className={`dock-action${primaryDockAction === 'start' ? ' is-armed' : ''}`}
                onClick={onDockFocusAction}
                aria-label={
                  primaryDockAction === 'exit'
                    ? 'Exit focus'
                    : primaryDockAction === 'start'
                      ? 'Start focus'
                      : primaryDockAction === 'cancel'
                        ? 'Cancel focus'
                        : 'Enter focus'
                }
              >
                <DockIcon kind={primaryDockAction} />
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}

function DockIcon({ kind }) {
  if (kind === 'start') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9 7.5v9l8-4.5-8-4.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'change') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M14.2 5.3l4.5 4.5M5 19l.9-4.1L15.8 5.9a1.6 1.6 0 0 1 2.3 0l.1.1a1.6 1.6 0 0 1 0 2.3L8.1 18.1 4 19z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'clear') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 8l8 8M16 8l-8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle
          cx="12"
          cy="12"
          r="7.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    )
  }
  if (kind === 'exit' || kind === 'cancel') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 7l10 10M17 7L7 17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="7.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle
        cx="12"
        cy="12"
        r="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
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
          <strong>Parent</strong> (text), <strong>When</strong> (select: Today,
          Tomorrow, This week, Later), <strong>Focus</strong> (checkbox; the app
          can add this).
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

function Block({
  node,
  editingId,
  onEdit,
  onPatch,
  onRemove,
  dnd,
  picking = false,
  onToggleFocus,
}) {
  return (
    <li
      className={`block${dnd.dragId === node.id ? ' dragging' : ''}${picking && node.focus ? ' is-focus-pick' : ''}`}
    >
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
        picking={picking}
        onToggleFocus={onToggleFocus}
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
                picking={picking}
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
  picking = false,
  onToggleFocus,
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

  return (
    <div
      className={`row${child ? ' child' : ''}${item.done ? ' is-done' : ''}${child && dnd.dragId === item.id ? ' dragging' : ''}${zone ? ` drop-${zone}` : ''}${picking && !child && item.focus ? ' focus-picked' : ''}`}
      data-section={item.section}
      data-drop-row={item.id}
      data-drop-child={child ? '1' : '0'}
    >
      {picking && !child ? (
        <button
          type="button"
          className={`focus-toggle${item.focus ? ' on' : ''}`}
          aria-pressed={item.focus}
          aria-label={
            item.focus
              ? `Remove ${item.text} from focus`
              : `Add ${item.text} to focus`
          }
          onClick={onToggleFocus}
        />
      ) : (
        <span
          className="grip"
          aria-label={`Drag ${item.text}`}
          onPointerDown={
            editing ? undefined : (e) => dnd.onGripPointerDown(e, item.id)
          }
          onPointerMove={dnd.onGripPointerMove}
          onPointerUp={dnd.onGripPointerUp}
          onPointerCancel={dnd.onGripPointerCancel}
        />
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={item.done}
          disabled={picking}
          onChange={(e) => onPatch(item.id, { done: e.target.checked })}
          aria-label={`Mark ${item.text} done`}
        />
      </label>
      {editing && !picking ? (
        <div
          className="edit-wrap"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) save()
          }}
        >
          <input
            className="edit"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setValue(item.text)
                onStopEdit()
              }
            }}
            autoFocus
          />
          {!child && (
            <select
              className="when-edit"
              value={item.when || ''}
              aria-label="When to do this"
              onChange={(e) =>
                onPatch(item.id, { when: e.target.value || null })
              }
            >
              {WHENS.map((when) => (
                <option key={when.value} value={when.value}>
                  {when.label}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : picking && !child ? (
        <button type="button" className="text" onClick={onToggleFocus}>
          {item.text}
          {progress && <span className="progress">{progress}</span>}
        </button>
      ) : (
        <button type="button" className="text" onClick={onEdit} disabled={picking}>
          {item.text}
          {progress && <span className="progress">{progress}</span>}
        </button>
      )}
      {!child && !picking && (
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
      {!picking && (
        <button
          type="button"
          className="drop"
          aria-label={`Remove ${item.text}`}
          onClick={() => onRemove(item.id)}
        >
          ×
        </button>
      )}
    </div>
  )
}
