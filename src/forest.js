export function byOrder(a, b) {
  return (
    (a.order ?? 0) - (b.order ?? 0) ||
    String(a.id).localeCompare(String(b.id))
  )
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
    .sort(byOrder)
    .map((item) => ({ ...item, children: kidsOf(item.id) }))
}
