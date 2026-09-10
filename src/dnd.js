import { zoneFromPoint } from './move.js'

/** Resolve a drop destination under client coordinates (works for mouse + touch). */
export function destFromPoint(clientX, clientY, dragId) {
  const blocked = document.querySelectorAll('.dragging')
  blocked.forEach((node) => {
    node.style.pointerEvents = 'none'
  })
  const el = document.elementFromPoint(clientX, clientY)
  blocked.forEach((node) => {
    node.style.pointerEvents = ''
  })
  if (!el) return null

  const row = el.closest('[data-drop-row]')
  if (row) {
    const id = row.getAttribute('data-drop-row')
    if (!id || id === String(dragId)) return null
    const isChild = row.getAttribute('data-drop-child') === '1'
    const where = zoneFromPoint(clientY, row.getBoundingClientRect(), isChild)
    return { type: 'row', id, where }
  }

  const sectionEl = el.closest('[data-drop-section]')
  if (sectionEl) {
    const section = sectionEl.getAttribute('data-drop-section')
    if (!section) return null
    return { type: 'section', section }
  }

  return null
}
