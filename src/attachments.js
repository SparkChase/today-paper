export const imageKey = (id) => `todayPaper:image:${id}`

const maxEdge = 2200
const clipboardFormats = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function clipboardImages(clipboard) {
  return [...clipboard.files].filter((file) => clipboardFormats.has(file.type))
}

export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法打开这张图片。')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return { id: crypto.randomUUID(), src: canvas.toDataURL('image/webp', 0.88) }
  } finally {
    bitmap.close()
  }
}

export function isPreparedImage(attachment) {
  return /^data:image\/webp;base64,[a-zA-Z0-9+/]+={0,2}$/.test(attachment.src)
}
