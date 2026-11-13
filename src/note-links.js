const urlPattern = /(https?:\/\/[^\s<>"，。！？；、（）【】]+)/gi

export function noteParts(text) {
  return text.split(urlPattern).flatMap((part, index) => {
    if (index % 2 === 0) return [{ text: part }]
    const url = part.replace(/[.,;!?]+$/, '')
    return [{ url }, { text: part.slice(url.length) }]
  })
}
