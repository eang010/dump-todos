import assert from 'node:assert/strict'
import test from 'node:test'
import { classify, parseDump } from './classify.js'

test('prefixes strip and force a bucket', () => {
  assert.deepEqual(classify('w: send invoice'), {
    section: 'work',
    text: 'send invoice',
  })
  assert.equal(classify('p: buy milk').section, 'personal')
  assert.equal(classify('i: zine about trains').section, 'ideas')
})

test('keywords', () => {
  assert.equal(classify('Send the client invoice').section, 'work')
  assert.equal(classify('Buy groceries').section, 'personal')
  assert.equal(classify('maybe a zine about trains').section, 'ideas')
})

test('unknown lands in inbox', () => {
  assert.equal(classify('Call the guy from the market').section, 'inbox')
})

test('every dumped line is a top-level item', () => {
  const rows = parseDump(`Launch the site
- pick hosting
Buy milk`)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].text, 'Launch the site')
  assert.equal(rows[1].text, '- pick hosting')
  assert.equal(rows[2].section, 'personal')
})
