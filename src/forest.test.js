import assert from 'node:assert/strict'
import test from 'node:test'
import { byText, forest } from './forest.js'

test('byText sorts case-insensitively', () => {
  const items = [
    { id: '2', text: 'zebra' },
    { id: '1', text: 'Apple' },
    { id: '3', text: 'banana' },
  ]
  assert.deepEqual(
    [...items].sort(byText).map((item) => item.text),
    ['Apple', 'banana', 'zebra'],
  )
})

test('forest lists open items alphabetically with nested kids', () => {
  const items = [
    { id: 'a', text: 'Zebra', section: 'work', done: false, parentId: null },
    { id: 'b', text: 'Alpha', section: 'work', done: false, parentId: null },
    { id: 'c', text: 'Milk', section: 'personal', done: false, parentId: null },
    { id: 'a1', text: 'Nested Z', section: 'work', done: false, parentId: 'a' },
    { id: 'a2', text: 'Nested A', section: 'work', done: false, parentId: 'a' },
    { id: 'd', text: 'Done', section: 'work', done: true, parentId: null },
  ]
  const work = forest(items, 'work', false)
  assert.deepEqual(
    work.map((node) => node.text),
    ['Alpha', 'Zebra'],
  )
  assert.deepEqual(
    work[1].children.map((node) => node.text),
    ['Nested A', 'Nested Z'],
  )
  assert.deepEqual(
    forest(items, null, true).map((node) => node.text),
    ['Done'],
  )
})
