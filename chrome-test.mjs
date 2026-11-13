import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { unzipSync } from 'fflate'
import { dateKey, offsetDay } from './src/dates.js'
import { initialNotebook, STORAGE_KEY } from './src/notebook.js'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const executable = process.env.CHROME_PATH ?? (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome'
)
const profile = await mkdtemp(resolve(tmpdir(), 'today-paper-chrome-'))
const chrome = spawn(executable, [
  `--user-data-dir=${profile}`, ...(process.env.HEADED ? [] : ['--headless=new']),
  '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-pipe', '--remote-debugging-port=0',
  '--enable-unsafe-extension-debugging', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })

let nextId = 0
let pending = new Map()
let buffer = ''
chrome.stderr.resume()
chrome.stdio[4].setEncoding('utf8')
chrome.stdio[4].on('data', (data) => {
  buffer += data
  let boundary
  while ((boundary = buffer.indexOf('\0')) >= 0) {
    const response = JSON.parse(buffer.slice(0, boundary))
    buffer = buffer.slice(boundary + 1)
    pending.get(response.id)?.(response)
  }
})
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 5000)
    pending.set(id, ({ result, error }) => {
      pending.delete(id)
      clearTimeout(timeout)
      if (error) reject(new Error(error.message))
      else resolve(result)
    })
    chrome.stdio[3].write(JSON.stringify({ id, method, params }) + '\0')
  })
}
try {
  console.log(await send('Browser.getVersion'))
  const { id } = await send('Extensions.loadUnpacked', { path: resolve(process.env.EXTENSION_DIR || 'dist') })
  console.log({ id })
  let debuggerPort
  for (let i = 0; i < 30 && !debuggerPort; i++) {
    try { debuggerPort = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] }
    catch { await delay(100) }
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggerPort}`)
  const context = browser.contexts()[0]
  const activeTab = context.pages()[0]
  await activeTab.goto('data:text/html,<title>Side panel test</title><p>Browser tab</p>')
  const { targetInfos: [targetInfo] } = await send('Target.getTargets', { filter: [{ type: 'tab' }] })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  const url = `chrome-extension://${id}/index.html`
  await page.setViewportSize({ width: 375, height: 750 })
  await page.goto(url)
  await page.getByRole('heading', { name: '随手记' }).waitFor()
  await page.waitForFunction(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick)
  assert.equal(await page.evaluate(async () => (await chrome.sidePanel.getOptions({})).path), 'index.html')
  await activeTab.bringToFront()
  await send('Extensions.triggerAction', { id, targetId: targetInfo.targetId })
  if (process.env.HEADED) {
    await page.waitForFunction(async (expectedUrl) => {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })
      return contexts.some((context) => context.documentUrl === expectedUrl)
    }, url, { timeout: 5000 })
    console.log('PASS: Toolbar action opens the native Chrome side panel')
  }
  await page.bringToFront()

  const note = (name) => page.getByRole('region', { name, exact: true })
  const textbox = (name) => page.getByRole('textbox', { name, exact: true })
  const button = (name) => page.getByRole('button', { name, exact: true })
  const addEntry = async (region, prompt, content, keyboard) => {
    await note(region).getByRole('button', { name: prompt }).click()
    await textbox('写入' + region).fill(content)
    if (keyboard) await textbox('写入' + region).press(keyboard)
    else await note(region).getByRole('button', { name: '记下', exact: true }).click()
    await textbox('写入' + region).waitFor({ state: 'hidden' })
    await note(region).getByText(content, { exact: true }).waitFor()
  }

  async function pasteImage(input) {
    await input.evaluate(async (element) => {
      const canvas = document.createElement('canvas')
      canvas.width = 720
      canvas.height = 300
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#f2e6cb'
      ctx.fillRect(0, 0, 720, 300)
      ctx.fillStyle = '#e9ac71'
      ctx.beginPath()
      ctx.arc(516, 103, 41, 0, 2 * Math.PI)
      ctx.fill()
      const hills = [
        ['#b6bda0', 'M0 183 Q147 73 295 169 Q434 227 720 132 V300 H0 Z'],
        ['#789680', 'M0 234 Q146 277 333 185 Q518 115 720 203 V300 H0 Z'],
        ['#48685a', 'M0 277 Q180 194 390 242 Q550 274 720 219 V300 H0 Z'],
        ['#e7d1a5', 'M333 300 Q373 263 458 246 Q488 240 527 239 Q429 253 388 300 Z'],
      ]
      for (const [color, path] of hills) {
        ctx.fillStyle = color
        ctx.fill(new Path2D(path))
      }
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
      const clipboard = new DataTransfer()
      clipboard.items.add(new File([blob], 'walk.png', { type: 'image/png' }))
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
    })
  }

  async function loadedImage(container) {
    const image = container.getByRole('img', { name: '记录图片' })
    await image.waitFor()
    assert.equal(await image.evaluate(async (img) => {
      await img.decode()
      return img.naturalWidth
    }), 720)
    return image
  }

  const current = dateKey()
  const previous = offsetDay(current, -1)
  const legacyDate = offsetDay(current, -2)
  await page.evaluate(async ({ storageKey, legacy }) => {
    await chrome.storage.local.set({ [storageKey]: legacy })
  }, {
    storageKey: STORAGE_KEY,
    legacy: {
      ...initialNotebook,
      revision: 1,
      pages: {
        [legacyDate]: { scratch: [{ id: 'v010-text', text: '旧版留下的文字', done: false }] },
      },
    },
  })
  await page.getByLabel('跳转到日期').fill(legacyDate)
  await page.getByText('旧版留下的文字').waitFor()
  await button('回到今天').click()
  assert.equal(await page.locator('time').getAttribute('datetime'), current)
  assert.equal(await page.getByRole('region').count(), 4)

  await addEntry('随手记', '记下刚想到的事', '记一个给朋友的小礼物')
  await addEntry('感想', '写一段今天的感想', '想把散步放回每天的日程。')
  await addEntry('待看', '记一个想看的东西，或贴个链接', 'https://example.com/reading', 'Enter')
  assert.equal(await note('待看').getByRole('link').getAttribute('href'), 'https://example.com/reading')
  await addEntry('待办', '加一件要做的事', '给植物浇水', 'Enter')

  const task = page.getByRole('checkbox', { name: '给植物浇水' })
  await task.click()
  await task.and(page.locator('[aria-checked="true"]')).waitFor()
  await note('待办').getByText('收工').waitFor()
  await button('分享这页').click()
  const share = page.getByRole('dialog', { name: '分享这页' })
  const sharePreview = share.getByRole('img', { name: '分享长图预览' })
  const pngSize = async () => sharePreview.evaluate(async (image) => {
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  })
  await sharePreview.waitFor()
  const tasksOnly = await pngSize()
  assert.equal(await share.getByRole('checkbox', { name: '感想' }).isChecked(), false)
  await share.getByRole('checkbox', { name: '随手记' }).check()
  await page.waitForFunction((height) => document.querySelector('.share-preview')?.naturalHeight > height, tasksOnly.height)
  const pngDownload = page.waitForEvent('download')
  await share.getByRole('button', { name: '下载 PNG' }).click()
  const pngFile = await pngDownload
  assert.equal(pngFile.suggestedFilename(), `今天这张纸-${current}.png`)
  const png = await readFile(await pngFile.path())
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), tasksOnly.width)
  assert.ok(png.readUInt32BE(20) > tasksOnly.height)
  // Capture the PNG sent to the clipboard API without replacing the host clipboard.
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'write', {
      value: async ([item]) => {
        const blob = await item.getType('image/png')
        window.testClipboardPng = [...new Uint8Array(await blob.arrayBuffer())]
      },
    })
  })
  await share.getByRole('button', { name: '复制图片' }).click()
  await share.getByText('已复制图片。').waitFor()
  assert.deepEqual(Buffer.from(await page.evaluate(() => window.testClipboardPng)), png)
  await share.getByRole('checkbox', { name: '待看' }).check()
  const mdDownload = page.waitForEvent('download')
  await share.getByRole('button', { name: '导出 Markdown' }).click()
  const mdFile = await mdDownload
  assert.equal(mdFile.suggestedFilename(), `${current}.md`)
  const markdown = await readFile(await mdFile.path(), 'utf8')
  assert.match(markdown, /^# \d{4}-\d{2}-\d{2}\n/)
  assert.ok(markdown.includes('## 待办\n\n- [x] 给植物浇水'))
  assert.ok(markdown.includes('- [ ] <https://example.com/reading>'))
  assert.ok(!markdown.includes('## 感想'))
  await share.getByRole('button', { name: '返回这页' }).click()
  console.log('PASS: Share starts with tasks, expands only selected sections, downloads a PNG')

  await note('感想').getByLabel('记录操作').click()
  await note('感想').getByRole('button', { name: '编辑' }).click()
  await textbox('编辑感想').fill('傍晚走了半小时，风很舒服。')
  await pasteImage(textbox('编辑感想'))
  await page.getByRole('img', { name: '待保存的图片' }).waitFor()
  await button('移除第 1 张图片').click()
  assert.equal(await page.getByRole('img', { name: '待保存的图片' }).count(), 0)
  await pasteImage(textbox('编辑感想'))
  await page.getByRole('img', { name: '待保存的图片' }).waitFor()
  await button('保存').click()
  await note('感想').getByText('傍晚走了半小时，风很舒服。').waitFor()
  const photo = await loadedImage(note('感想'))
  const photoSrc = await photo.getAttribute('src')
  if (process.env.STORE_SCREENSHOT_PATH) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await button('分享这页').click()
    await share.getByRole('checkbox', { name: '感想' }).check()
    await sharePreview.waitFor()
    await pngSize()
    await page.screenshot({ path: process.env.STORE_SCREENSHOT_PATH, animations: 'disabled' })
    await share.getByRole('button', { name: '返回这页' }).click()
    await page.setViewportSize({ width: 375, height: 750 })
  }
  if (process.env.SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true, animations: 'disabled' })
  }

  await note('随手记').getByRole('button', { name: '记下刚想到的事' }).click()
  await pasteImage(textbox('写入随手记'))
  await page.getByRole('img', { name: '待保存的图片' }).waitFor()
  await note('随手记').getByRole('button', { name: '记下', exact: true }).click()
  await loadedImage(note('随手记'))

  await button('加一个区域').click()
  await textbox('区域名称').fill('选题灵感')
  await page.getByRole('radio', { name: '可勾选' }).check()
  await button('添加').click()
  await note('选题灵感').waitFor()
  await addEntry('选题灵感', '写一条选题灵感', '给书桌做一张地图', 'Enter')
  await page.getByRole('checkbox', { name: '给书桌做一张地图' }).waitFor()

  await button('加一个区域').click()
  await textbox('区域名称').fill('感想')
  await button('添加').click()
  await page.getByRole('alert').getByText('已经有同名的区域了。').waitFor()
  await button('取消').click()

  await page.reload()
  await task.and(page.locator('[aria-checked="true"]')).waitFor()
  await note('选题灵感').getByText('给书桌做一张地图').waitFor()
  await loadedImage(note('感想'))
  await loadedImage(note('随手记'))
  console.log('PASS: Write text, link, task, paste and remove draft images, save image-only and captioned notes, reload')


  // Use the extension service worker to seed yesterday via the same save path.
  await page.evaluate(async ({ date, photoSrc }) => {
    const result = await chrome.runtime.sendMessage({
      type: 'update-notebook',
      action: {
        type: 'add-entry', sectionId: 'tasks', entryId: 'yesterday-task', date, text: '补写一张明信片',
        attachments: [{ id: 'yesterday-photo', src: photoSrc }],
      },
    })
    if (result.error) throw new Error(result.error)
  }, { date: previous, photoSrc })

  await button('前一天').click()
  assert.equal(await page.locator('time').getAttribute('datetime'), previous)
  await note('待办').getByText('补写一张明信片').waitFor()
  await loadedImage(note('待办'))
  assert.equal(await button('加一个区域').count(), 0)
  await button('抄到今天').click()
  await button('已抄到今天').waitFor()
  assert.equal(await button('已抄到今天').isDisabled(), true)
  await button('回到今天').click()
  await page.getByRole('checkbox', { name: '补写一张明信片' }).waitFor()
  await loadedImage(note('待办'))
  const copiedEntry = note('待办').getByRole('listitem').filter({ hasText: '补写一张明信片' })
  await copiedEntry.getByLabel('记录操作').click()
  await copiedEntry.getByRole('button', { name: '编辑' }).click()
  await button('移除第 1 张图片').click()
  await button('保存').click()
  await copiedEntry.getByRole('img', { name: '记录图片' }).waitFor({ state: 'detached' })
  await page.getByLabel('跳转到日期').fill(previous)
  await note('待办').getByText('补写一张明信片').waitFor()
  await loadedImage(note('待办'))
  await button('后一天').click()
  await task.waitFor()
  console.log('PASS: Previous day, date jump, copy a note with its image, keep the original after editing the copy')

  await note('随手记').getByRole('listitem').filter({ has: page.getByRole('img', { name: '记录图片' }) }).getByLabel('记录操作').click()
  await note('随手记').getByRole('button', { name: '删除', exact: true }).click()
  await button('确认删除').click({ timeout: 3000 })
  await note('随手记').getByRole('img', { name: '记录图片' }).waitFor({ state: 'detached' })
  const remainingImageKeys = await page.evaluate(async () => (
    Object.entries(await chrome.storage.local.get(null)).filter(([key, value]) => key.startsWith('todayPaper:image:') && value)
  ))
  assert.equal(remainingImageKeys.length, 2)
  console.log('PASS: Confirmed deletion')

  const other = await context.newPage()
  await other.goto(url)
  await other.getByRole('heading', { name: '随手记' }).waitFor()
  const writeFrom = (target, id) => target.evaluate(async ({ date, id }) => {
    const result = await chrome.runtime.sendMessage({
      type: 'update-notebook',
      action: { type: 'add-entry', sectionId: 'scratch', entryId: crypto.randomUUID(), date, text: id },
    })
    if (result.error) throw new Error(result.error)
  }, { date: current, id })
  await Promise.all([writeFrom(page, '同时写入 A'), writeFrom(other, '同时写入 B')])
  await page.getByText('同时写入 A').waitFor()
  await page.getByText('同时写入 B').waitFor()
  await other.getByText('同时写入 A').waitFor()
  await other.getByText('同时写入 B').waitFor()
  await other.close()
  console.log('PASS: Concurrent writes from two open extension views')

  const rollover = await context.newPage()
  const beforeMidnight = new Date(`${current}T23:59:59.500`)
  await rollover.clock.install({ time: beforeMidnight })
  await rollover.clock.pauseAt(beforeMidnight)
  await rollover.goto(url)
  await rollover.getByText('同时写入 A').waitFor()
  await rollover.clock.fastForward(1000)
  const nextDay = offsetDay(current, 1)
  await rollover.locator(`time[datetime="${nextDay}"]`).waitFor()
  assert.equal(await rollover.getByText('同时写入 A').count(), 0)
  await rollover.getByRole('heading', { name: '选题灵感' }).waitFor()
  await rollover.getByRole('button', { name: '前一天' }).click()
  await rollover.getByText('同时写入 A').waitFor()
  console.log('PASS: Midnight rollover keeps sections and starts a blank page')

  await button('备份与导入').click()
  const backupDialog = page.getByRole('dialog', { name: '备份与导入' })
  const upload = async (backup, name = 'backup.json') => {
    await backupDialog.locator('input[type=file]').setInputFiles({
      name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    })
  }
  const jsonDownload = page.waitForEvent('download')
  await backupDialog.getByRole('button', { name: '导出备份' }).click()
  const jsonFile = await jsonDownload
  const exported = JSON.parse(await readFile(await jsonFile.path(), 'utf8'))
  assert.equal(exported.format, 'today-paper')
  assert.equal(Object.keys(exported.images).length, 2)
  assert.ok(exported.notebook.sections.some(({ title }) => title === '选题灵感'))
  const original = exported.notebook.pages[current].scratch[0]
  const incoming = structuredClone(exported)
  incoming.notebook.pages[current].scratch[0].text = '同一条记录的备份版本'
  await upload(incoming)
  await backupDialog.getByText('1 条 · 保留两版').waitFor()
  await writeFrom(page, '预览后写入的内容')
  await backupDialog.getByRole('button', { name: '确认合并' }).click()
  await backupDialog.getByText('笔记刚有变动，请核对更新后的预览。').waitFor()
  await backupDialog.getByRole('button', { name: '确认合并' }).click()
  await backupDialog.getByText('已合并 1 条记录。').waitFor()
  await upload(incoming)
  await backupDialog.getByText('这份备份里的内容已经在本机。').waitFor()
  await upload({ ...exported, images: {} })
  await backupDialog.getByRole('alert').waitFor()
  assert.equal(await backupDialog.getByRole('button', { name: '确认合并' }).count(), 0)
  await backupDialog.getByRole('button', { name: '返回这页' }).click()
  await note('随手记').getByText(original.text, { exact: true }).waitFor()
  await note('随手记').getByText('同一条记录的备份版本').waitFor()
  await note('随手记').getByText('预览后写入的内容').waitFor()

  // Emulate moving to a fresh installation in this isolated test profile.
  await page.evaluate(() => chrome.storage.local.clear())
  await note('感想').getByText('傍晚走了半小时，风很舒服。').waitFor({ state: 'detached' })
  await button('备份与导入').click()
  const legacy = { [STORAGE_KEY]: exported.notebook }
  for (const [id, src] of Object.entries(exported.images)) legacy['todayPaper:image:' + id] = src
  await upload(legacy, '旧版控制台备份.json')
  await backupDialog.getByRole('button', { name: '确认合并' }).click()
  await backupDialog.getByText(/^已合并/).waitFor()
  await backupDialog.getByRole('button', { name: '返回这页' }).click()
  await loadedImage(note('感想'))
  await task.and(page.locator('[aria-checked="true"]')).waitFor()
  await note('选题灵感').getByText('给书桌做一张地图').waitFor()
  console.log('PASS: Export images and sections, preserve conflicts, reject malformed backups, import legacy JSON')

  await page.setViewportSize({ width: 265, height: 670 })
  const older = offsetDay(current, -40)
  await page.evaluate(async ({ date, src }) => {
    const result = await chrome.runtime.sendMessage({
      type: 'update-notebook',
      action: {
        type: 'add-entry', sectionId: 'thoughts', entryId: 'old-photo', date, text: '',
        attachments: [{ id: 'old-photo', src }],
      },
    })
    if (result.error) throw new Error(result.error)
  }, { date: older, src: photoSrc })
  await button('翻旧纸').click()
  const history = page.getByRole('dialog', { name: '翻旧纸' })
  const dateInHistory = (date) => history.locator(`time[datetime="${date}"]`)
  await dateInHistory(older).waitFor()
  const restoredDates = Object.keys(exported.notebook.pages).filter((date) => (
    Object.values(exported.notebook.pages[date]).some((entries) => entries.length > 0)
  ))
  assert.deepEqual(await history.locator('time').evaluateAll((dates) => dates.map((item) => item.dateTime)),
    [...restoredDates, older].sort().reverse())
  await history.getByLabel('日期范围').selectOption('30')
  await dateInHistory(older).waitFor({ state: 'detached' })
  const zipDownload = page.waitForEvent('download')
  await history.getByRole('button', { name: `导出 ${restoredDates.length} 页 Markdown` }).click()
  const zipFile = await zipDownload
  assert.ok(zipFile.suggestedFilename().endsWith('.zip'))
  const archived = unzipSync(await readFile(await zipFile.path()))
  const filenames = Object.keys(archived)
  assert.deepEqual(filenames.filter((name) => name.endsWith('.md')).sort(), restoredDates.sort().map((date) => `${date}.md`))
  const links = new Set()
  for (const name of filenames.filter((name) => name.endsWith('.md'))) {
    const text = Buffer.from(archived[name]).toString()
    for (const [, path] of text.matchAll(/!\[记录图片\]\((attachments\/[^)]+)\)/g)) {
      assert.equal(Buffer.from(archived[path]).subarray(8, 12).toString(), 'WEBP')
      links.add(path)
    }
  }
  assert.equal(links.size, 2)
  assert.equal(filenames.filter((name) => name.startsWith('attachments/')).length, 2)
  console.log('PASS: Export selected sections as Markdown and filtered history with linked WebP attachments')
  await history.getByLabel('日期范围').selectOption('0')
  await history.getByRole('searchbox').fill('不存在的标题')
  await history.getByRole('status').filter({ hasText: '没找到符合条件的纸页' }).waitFor()
  await history.getByRole('searchbox').fill('明信片')
  await dateInHistory(previous).waitFor()
  assert.equal(await dateInHistory(older).count(), 0)
  await history.getByRole('searchbox').fill('感想')
  await dateInHistory(older).click()
  await loadedImage(note('感想'))
  assert.equal(await page.locator('.date-button time').getAttribute('datetime'), older)
  console.log('PASS: Search imported history, filter dates, and open an image-only page in a narrow sidebar')

  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 3000 })
  assert.equal(await page.locator('[data-missing]').count(), 0)
  assert.deepEqual(pageErrors, [])
  console.log('PASS: Narrow view fits and no runtime errors')
  await browser.close()
} finally {
  try { await send('Browser.close') } finally { chrome.kill() }
}
