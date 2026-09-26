import assert from 'node:assert/strict'
import test from 'node:test'
import { byOrder, focusForest, forest } from './forest.js'

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

test('open items with a when float above the rest, then keep order', () => {
  const items = [
    { id: 'a', text: 'Later one', section: 'work', done: false, parentId: null, order: 0, when: 'later' },
    { id: 'b', text: 'No when', section: 'work', done: false, parentId: null, order: 1 },
    { id: 'c', text: 'Today', section: 'work', done: false, parentId: null, order: 2, when: 'today' },
    { id: 'd', text: 'Tomorrow', section: 'work', done: false, parentId: null, order: 3, when: 'tomorrow' },
  ]
  assert.deepEqual(
    forest(items, 'work', false).map((node) => node.text),
    ['Today', 'Tomorrow', 'Later one', 'No when'],
  )
})

test('focusForest keeps only focused open roots with kids, ordered by when', () => {
  const items = [
    { id: 'a', text: 'Later focus', section: 'work', done: false, parentId: null, order: 0, when: 'later', focus: true },
    { id: 'b', text: 'Skip me', section: 'work', done: false, parentId: null, order: 1, when: 'today', focus: false },
    { id: 'c', text: 'Today focus', section: 'personal', done: false, parentId: null, order: 0, when: 'today', focus: true },
    { id: 'c1', text: 'Child A', section: 'personal', done: false, parentId: 'c', order: 0 },
    { id: 'c2', text: 'Child B', section: 'personal', done: true, parentId: 'c', order: 1 },
    { id: 'd', text: 'Done focus', section: 'work', done: true, parentId: null, order: 0, focus: true },
    { id: 'e', text: 'Child focus ignored', section: 'work', done: false, parentId: 'a', order: 0, focus: true },
  ]
  const focused = focusForest(items)
  assert.deepEqual(
    focused.map((node) => node.text),
    ['Today focus', 'Later focus'],
  )
  assert.deepEqual(
    focused[0].children.map((node) => node.text),
    ['Child A', 'Child B'],
  )
})
