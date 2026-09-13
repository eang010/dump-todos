const WHEN_RANK = {
  today: 0,
  tomorrow: 1,
  week: 2,
  later: 3,
}

export function byOrder(a, b) {
  return (
    (a.order ?? 0) - (b.order ?? 0) ||
    String(a.id).localeCompare(String(b.id))
  )
}

export function whenRank(item) {
  const rank = WHEN_RANK[item.when]
  return rank == null ? 99 : rank
}

export function byOpen(a, b) {
  return whenRank(a) - whenRank(b) || byOrder(a, b)
}

export function byNested(a, b) {
  return (
    Number(a.done) - Number(b.done) ||
    String(a.text || '').localeCompare(String(b.text || ''), undefined, {
      sensitivity: 'base',
    })
  )
}

export function forest(items, section, done) {
  const kidsOf = (id) =>
    items.filter((item) => item.parentId === id).sort(byNested)
  return items
    .filter(
      (item) =>
        !item.parentId &&
        item.done === done &&
        (section == null || item.section === section),
    )
    .sort(byOpen)
    .map((item) => ({ ...item, children: kidsOf(item.id) }))
}
