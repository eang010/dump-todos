import assert from 'node:assert/strict'
import test from 'node:test'
import { moveItem, zoneFromPoint } from './move.js'

const items = [
  { id: 'a', text: 'Launch', section: 'work', parentId: null, order: 0 },
  { id: 'b', text: 'Copy', section: 'work', parentId: null, order: 1 },
  { id: 'c', text: 'Milk', section: 'personal', parentId: null, order: 0 },
]

test('drop onto a row nests as a child', () => {
  const next = moveItem(items, 'b', { type: 'row', id: 'a', where: 'onto' })
  const b = next.find((item) => item.id === 'b')
  assert.equal(b.parentId, 'a')
  assert.equal(b.section, 'work')
})

test('drop before a top-level row un-nests and reorders', () => {
  const nested = moveItem(items, 'b', { type: 'row', id: 'a', where: 'onto' })
  const next = moveItem(nested, 'b', { type: 'row', id: 'a', where: 'before' })
  const b = next.find((item) => item.id === 'b')
  assert.equal(b.parentId, null)
  const top = next
    .filter((item) => !item.parentId && item.section === 'work')
    .sort((a, b) => a.order - b.order)
  assert.deepEqual(
    top.map((item) => item.id),
    ['b', 'a'],
  )
})

test('drop on a section moves as a top-level item', () => {
  const next = moveItem(items, 'b', { type: 'section', section: 'personal' })
  const b = next.find((item) => item.id === 'b')
  assert.equal(b.parentId, null)
  assert.equal(b.section, 'personal')
})

test('nesting a parent flattens its children onto the target', () => {
  const withKids = [
    { id: 'a', section: 'work', parentId: null, order: 0 },
    { id: 'a1', section: 'work', parentId: 'a', order: 0 },
    { id: 'b', section: 'work', parentId: null, order: 1 },
  ]
  const next = moveItem(withKids, 'a', { type: 'row', id: 'b', where: 'onto' })
  assert.equal(next.find((item) => item.id === 'a').parentId, 'b')
  assert.equal(next.find((item) => item.id === 'a1').parentId, 'b')
})

test('middle of a parent row is onto', () => {
  assert.equal(zoneFromPoint(50, { top: 0, height: 100 }, false), 'onto')
  assert.equal(zoneFromPoint(10, { top: 0, height: 100 }, false), 'before')
})
