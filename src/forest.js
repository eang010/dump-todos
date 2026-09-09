export function byText(a, b) {
  return (
    String(a.text ?? '').localeCompare(String(b.text ?? ''), undefined, {
      sensitivity: 'base',
    }) || String(a.id).localeCompare(String(b.id))
  )
}

export function forest(items, section, done) {
  const kidsOf = (id) =>
    items.filter((item) => item.parentId === id).sort(byText)
  return items
    .filter(
      (item) =>
        !item.parentId &&
        item.done === done &&
        (section == null || item.section === section),
    )
    .sort(byText)
    .map((item) => ({ ...item, children: kidsOf(item.id) }))
}
