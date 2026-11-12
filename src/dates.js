export function dateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseDay(key) {
  // Noon avoids daylight-saving gaps near local midnight.
  return new Date(`${key}T12:00:00`)
}

export function offsetDay(key, amount) {
  const date = parseDay(key)
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}
