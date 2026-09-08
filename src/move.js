function orderedGroup(items, parentId, section) {
  const list = parentId
    ? items.filter((item) => item.parentId === parentId)
    : items.filter((item) => !item.parentId && item.section === section)
  return [...list].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)),
  )
}

export function zoneFromPoint(clientY, rect, isChild) {
  const y = (clientY - rect.top) / Math.max(rect.height, 1)
  if (isChild) return y < 0.5 ? 'before' : 'after'
  if (y < 0.28) return 'before'
  if (y > 0.72) return 'after'
  return 'onto'
}

export function moveItem(items, dragId, dest) {
  const drag = items.find((item) => item.id === dragId)
  if (!drag) return items
  const kids = items.filter((item) => item.parentId === dragId)
  const kidIds = new Set(kids.map((item) => item.id))

  let parentId
  let section
  let whereIndex
  let flatten = false

  if (dest.type === 'section') {
    parentId = null
    section = dest.section
    whereIndex = orderedGroup(items, null, section).filter(
      (item) => item.id !== dragId,
    ).length
  } else {
    const target = items.find((item) => item.id === dest.id)
    if (!target || target.id === dragId) return items

    if (dest.where === 'onto') {
      parentId = target.parentId ?? target.id
      if (parentId === dragId) return items
      flatten = true
      section = (items.find((item) => item.id === parentId) ?? target).section
      const sibs = orderedGroup(items, parentId, section).filter(
        (item) => item.id !== dragId && !kidIds.has(item.id),
      )
      whereIndex = target.parentId
        ? sibs.findIndex((item) => item.id === target.id) + 1
        : sibs.length
    } else {
      flatten = Boolean(target.parentId)
      parentId = target.parentId
      section = target.parentId
        ? (items.find((item) => item.id === target.parentId) ?? target).section
        : target.section
      const sibs = orderedGroup(items, parentId, section).filter(
        (item) => item.id !== dragId && !kidIds.has(item.id),
      )
      const idx = sibs.findIndex((item) => item.id === target.id)
      whereIndex = dest.where === 'before' ? idx : idx + 1
    }
  }

  const movingIds = flatten ? [dragId, ...kids.map((item) => item.id)] : [dragId]

  let next = items.map((item) => {
    if (item.id === dragId) return { ...item, parentId, section }
    if (flatten && kidIds.has(item.id)) return { ...item, parentId, section }
    if (!flatten && kidIds.has(item.id)) return { ...item, section }
    return item
  })

  const destList = orderedGroup(next, parentId, section)
  const rest = destList.filter((item) => !movingIds.includes(item.id))
  const moving = movingIds
    .map((id) => destList.find((item) => item.id === id))
    .filter(Boolean)
  const inserted = [
    ...rest.slice(0, Math.max(0, whereIndex)),
    ...moving,
    ...rest.slice(Math.max(0, whereIndex)),
  ]
  const orderMap = new Map(inserted.map((item, i) => [item.id, i]))
  next = next.map((item) =>
    orderMap.has(item.id) ? { ...item, order: orderMap.get(item.id) } : item,
  )

  return next
}
