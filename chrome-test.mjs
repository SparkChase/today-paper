import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { dateKey, offsetDay } from './src/dates.js'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const executable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = await mkdtemp(resolve('../chrome-test-'))
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
    await note(region).getByText(content, { exact: true }).waitFor()
  }

  const current = dateKey()
  const previous = offsetDay(current, -1)
  assert.equal(await page.locator('time').getAttribute('datetime'), current)
  assert.equal(await page.getByRole('region').count(), 4)
  await page.screenshot({ path: '../empty-preview.png' })

  await addEntry('随手记', '记下刚想到的事', '记一个给朋友的小礼物')
  await addEntry('感想', '写一段今天的感想', '想把散步放回每天的日程。')
  await addEntry('待看', '记一个想看的东西，或贴个链接', 'https://example.com/reading', 'Enter')
  assert.equal(await note('待看').getByRole('link').getAttribute('href'), 'https://example.com/reading')
  await addEntry('待办', '加一件要做的事', '给植物浇水', 'Enter')

  const task = page.getByRole('checkbox', { name: '给植物浇水' })
  await task.click()
  await task.and(page.locator('[aria-checked="true"]')).waitFor()
  await note('待办').getByText('收工').waitFor()

  await note('感想').getByLabel('记录操作').click()
  await note('感想').getByRole('button', { name: '编辑' }).click()
  await textbox('编辑感想').fill('傍晚走了半小时，风很舒服。')
  await button('保存').click()
  await note('感想').getByText('傍晚走了半小时，风很舒服。').waitFor()

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
  console.log('PASS: Write text, link, task, edit, check, add a section, reload')

  await page.screenshot({ path: '../filled-preview.png', fullPage: true })

  // Use the extension service worker to seed yesterday via the same save path.
  await page.evaluate(async (date) => {
    const result = await chrome.runtime.sendMessage({
      type: 'update-notebook',
      action: { type: 'add-entry', sectionId: 'tasks', entryId: 'yesterday-task', date, text: '补写一张明信片' },
    })
    if (result.error) throw new Error(result.error)
  }, previous)

  await button('前一天').click()
  assert.equal(await page.locator('time').getAttribute('datetime'), previous)
  await note('待办').getByText('补写一张明信片').waitFor()
  assert.equal(await button('加一个区域').count(), 0)
  await button('抄到今天').click()
  await button('已抄到今天').waitFor()
  assert.equal(await button('已抄到今天').isDisabled(), true)
  await button('回到今天').click()
  await page.getByRole('checkbox', { name: '补写一张明信片' }).waitFor()
  await page.getByLabel('跳转到日期').fill(previous)
  await note('待办').getByText('补写一张明信片').waitFor()
  await button('后一天').click()
  await task.waitFor()
  console.log('PASS: Previous day, date jump, copy to today once, preserve original')

  await note('随手记').getByLabel('记录操作').click()
  await note('随手记').getByRole('button', { name: '删除', exact: true }).click()
  await button('确认删除').click({ timeout: 3000 })
  await note('随手记').getByText('记一个给朋友的小礼物').waitFor({ state: 'detached' })
  console.log('PASS: Confirmed deletion')

  const other = await context.newPage()
  await other.goto(url)
  await other.getByRole('heading', { name: '随手记' }).waitFor()
  const writeFrom = (target, id) => target.evaluate(async ({ date, id }) => {
    const result = await chrome.runtime.sendMessage({
      type: 'update-notebook',
      action: { type: 'add-entry', sectionId: 'scratch', entryId: id, date, text: id },
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

  await page.setViewportSize({ width: 265, height: 670 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.equal(await page.locator('[data-missing]').count(), 0)
  assert.deepEqual(pageErrors, [])
  console.log('PASS: Narrow view fits and no runtime errors')
  await browser.close()
} finally {
  try { await send('Browser.close') } finally { chrome.kill() }
}
