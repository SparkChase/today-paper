export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // The browser may consume the blob URL after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
