import assert from 'node:assert/strict'
import test from 'node:test'
import { byOrder, forest } from './forest.js'

test('byOrder sorts by order then id', () => {
  const items = [
    { id: '2', text: 'zebra', order: 2 },
    { id: '1', text: 'Apple', order: 0 },
    { id: '3', text: 'banana', order: 1 },
  ]
  assert.deepEqual(
    [...items].sort(byOrder).map((item) => item.text),
    ['Apple', 'banana', 'zebra'],
  )
})

test('forest lists open items by order with nested kids', () => {
  const items = [
    { id: 'a', text: 'Zebra', section: 'work', done: false, parentId: null, order: 1 },
    { id: 'b', text: 'Alpha', section: 'work', done: false, parentId: null, order: 0 },
    { id: 'c', text: 'Milk', section: 'personal', done: false, parentId: null, order: 0 },
    { id: 'a1', text: 'Nested Z', section: 'work', done: false, parentId: 'a', order: 0 },
    { id: 'a2', text: 'Nested A', section: 'work', done: false, parentId: 'a', order: 1 },
    { id: 'a3', text: 'Nested M', section: 'work', done: true, parentId: 'a', order: 0 },
    { id: 'd', text: 'Done', section: 'work', done: true, parentId: null, order: 0 },
  ]
  const work = forest(items, 'work', false)
  assert.deepEqual(
    work.map((node) => node.text),
    ['Alpha', 'Zebra'],
  )
  assert.deepEqual(
    work[1].children.map((node) => node.text),
    ['Nested A', 'Nested Z', 'Nested M'],
  )
  assert.deepEqual(
    forest(items, null, true).map((node) => node.text),
    ['Done'],
  )
})
