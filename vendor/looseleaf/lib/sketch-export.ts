export function svgToPngDataUrl(svgDataUrl: string, width: number, height: number, scale = 2): Promise<string | null> {
  return new Promise((done) => {
    if (typeof document === "undefined" || typeof Image === "undefined") return done(null)
    const img = new Image()
    const giveUp = setTimeout(() => done(null), 4000)
    img.onload = () => {
      clearTimeout(giveUp)
      try {
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const g = canvas.getContext("2d")
        if (!g) return done(null)
        g.drawImage(img, 0, 0, canvas.width, canvas.height)
        done(canvas.toDataURL("image/png"))
      } catch {
        done(null)
      }
    }
    img.onerror = () => {
      clearTimeout(giveUp)
      done(null)
    }
    img.src = svgDataUrl
  })
}
