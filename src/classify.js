const PREFIX = {
  w: 'work',
  work: 'work',
  p: 'personal',
  personal: 'personal',
  i: 'ideas',
  idea: 'ideas',
}

const RULES = [
  [
    'ideas',
    /\b(idea|maybe|someday|what if|sketch|explore|brainstorm|concept)\b/i,
  ],
  [
    'work',
    /\b(meeting|client|email|slack|pr|deploy|invoice|standup|deadline|sprint|ticket|zoom|review)\b/i,
  ],
  [
    'personal',
    /\b(buy|grocery|groceries|doctor|dentist|gym|family|clean|laundry|errand|home|gift)\b/i,
  ],
]

export function classify(raw) {
  const trimmed = raw.trim()
  const prefixed = trimmed.match(/^(work|personal|idea|w|p|i):\s*(.*)$/i)
  if (prefixed) {
    const section = PREFIX[prefixed[1].toLowerCase()]
    const text = prefixed[2].trim() || trimmed
    return { section, text }
  }
  for (const [section, re] of RULES) {
    if (re.test(trimmed)) return { section, text: trimmed }
  }
  return { section: 'inbox', text: trimmed }
}

export function parseDump(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(classify)
}
