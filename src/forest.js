export function byOrder(a, b) {
  return (
    (a.order ?? 0) - (b.order ?? 0) ||
    String(a.id).localeCompare(String(b.id))
  )
}

export function forest(items, section, done) {
  const kidsOf = (id) =>
    items.filter((item) => item.parentId === id).sort(byOrder)
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
