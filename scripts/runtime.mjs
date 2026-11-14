// 运行期冒烟：用 happy-dom 加载打包产物，捕获渲染/绘制异常
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const win = new Window({ url: 'http://localhost/', width: 900, height: 700 })
const doc = win.document
const noop = () => {}
const mkCtx = () => new Proxy({}, {
  get(_, k) {
    if (k === 'canvas') return { width: 900, height: 700 }
    if (k === 'measureText') return () => ({ width: 30 })
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop })
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
    return typeof k === 'string' ? noop : undefined
  },
  set() { return true },
})
win.HTMLCanvasElement.prototype.getContext = () => mkCtx()
win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'

const errors = []
win.console = { ...console, error: (...a) => { errors.push(a.map(x => (x && x.stack) || String(x)).join(' ')) }, warn: noop, log: console.log }

globalThis.window = win
globalThis.document = doc
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true })
globalThis.ResizeObserver = win.ResizeObserver || class { observe(){} unobserve(){} disconnect(){} }
Object.defineProperty(globalThis, 'location', { value: win.location, configurable: true })
Object.defineProperty(globalThis, 'history', { value: win.history, configurable: true })
globalThis.localStorage = win.localStorage
globalThis.matchMedia = win.matchMedia ? win.matchMedia.bind(win) : () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.HTMLElement = win.HTMLElement
globalThis.Element = win.Element
globalThis.Node = win.Node
globalThis.CustomEvent = win.CustomEvent
globalThis.Event = win.Event
globalThis.MouseEvent = win.MouseEvent
globalThis.PointerEvent = win.PointerEvent || win.MouseEvent
globalThis.getComputedStyle = win.getComputedStyle.bind(win)
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.performance = globalThis.performance || win.performance

const html = readFileSync('dist/index.html', 'utf8')
const js = html.match(/src="\/(assets\/[^"]+\.js)"/)[1]
doc.body.innerHTML = '<div id="root"></div>'

try {
  await import(pathToFileURL('dist/' + js).href)
} catch (e) {
  console.log('IMPORT FAILED', e.stack)
  process.exit(1)
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
await sleep(400)
console.log('root children:', doc.getElementById('root').children.length)
console.log('canvas count:', doc.querySelectorAll('canvas').length)

// 载入每个预设，跑一会儿，看是否有绘制异常
const opts = [...doc.querySelectorAll('.pal-preset option')].map(o => o.value).filter(Boolean)
console.log('presets:', opts.length)
for (const name of opts) {
  const sel = doc.querySelector('.pal-preset')
  sel.value = name
  sel.dispatchEvent(new win.Event('change', { bubbles: true }))
  await sleep(120)
  const btn = [...doc.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('运行'))
  if (btn) btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
  await sleep(150)
  const stop = [...doc.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('暂停'))
  if (stop) stop.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
}
await sleep(200)

// —— 复现：放置滑动变阻器并点选 ——
function pe(type, x, y) {
  const cv = [...doc.querySelectorAll('canvas')].find(c => c.closest('.canvas-wrap')) || doc.querySelector('canvas')
  const ev = new win.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true })
  try { Object.defineProperty(ev, 'pointerType', { value: 'mouse' }) } catch {}
  cv.dispatchEvent(ev)
}
console.log('canvases:', doc.querySelectorAll('canvas').length, 'pal btns:', doc.querySelectorAll('button').length)
const palBtns = [...doc.querySelectorAll('.pallete button')]
const rheo = palBtns.find(b => b.textContent.includes('滑动变阻器'))
console.log('rheostat button:', !!rheo)
if (rheo) {
  rheo.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true }))
  await sleep(80)
  pe('pointerdown', 420, 300)
  pe('pointerup', 420, 300)
  await sleep(150)
  // 点选它
  pe('pointerdown', 420, 300)
  pe('pointerup', 420, 300)
  await sleep(250)
  console.log('inspector open:', !!doc.querySelector('.inspector'))
  console.log('errors after select:', errors.length)
  for (const e of errors.slice(0, 4)) console.log('---', e.split('\n').slice(0, 6).join('\n'))
}
// —— 复现：放置金属棒 ——
const railBtn = palBtns.find(b => b.textContent.includes('金属棒'))
console.log('metalRod button:', !!railBtn)
if (railBtn) {
  railBtn.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true }))
  await sleep(80)
  pe('pointerdown', 400, 330)
  pe('pointerup', 400, 330)
  await sleep(250)
  console.log('errors after rod place:', errors.length)
  for (const e of errors.slice(0, 3)) console.log('---ROD---', e.split('\n').slice(0, 6).join('\n'))
}
// 触屏路径复测
const railBtn2 = palBtns.find(b => b.textContent.includes('金属棒'))
if (railBtn2) {
  railBtn2.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
  await sleep(80)
  pe('pointerdown', 500, 380)
  pe('pointerup', 500, 380)
  await sleep(250)
  console.log('errors after touch rod place:', errors.length)
}
const sb = doc.querySelector('.statusbar')
console.log('statusbar:', sb ? sb.textContent.slice(0, 60) : 'N/A')

// —— 第 22 轮 UI 断言：空画布引导 / 状态栏上下文提示 / 元件栏分类 tab ——
let uiPass = 0, uiFail = 0
const uiCheck = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); ok ? uiPass++ : uiFail++ }

// 清空 → 空画布引导应出现（DOM 版，带快捷预设 chip）
// 注意：引导只在「选择」模式显示，前面测试把工具切到了金属棒，先切回来
const selBtn0 = [...doc.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('选择'))
if (selBtn0) selBtn0.click()
await sleep(150)
const clearBtn = [...doc.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('清空'))
if (clearBtn) clearBtn.click()
await sleep(250)
const emptyHint = doc.querySelector('.empty-hint')
uiCheck('空画布出现引导提示', !!emptyHint)
uiCheck('引导里有快捷预设 chip', doc.querySelectorAll('.empty-hint .eh-chips button').length >= 3)

// 选一个元件 → 提示隐藏、状态栏改为「点击画布放置…」
const tabBtn = [...doc.querySelectorAll('.pal-tab')].find(b => b.textContent === '电路')
uiCheck('元件栏有分类 tab', !!tabBtn)
if (tabBtn) {
  tabBtn.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true }))
  await sleep(120)
  const visGroups = [...doc.querySelectorAll('.pal-group')].filter(g => g.className.indexOf('hidden') < 0)
  uiCheck('切 tab 后只显示一个分组', visGroups.length === 1)
  const batt = [...doc.querySelectorAll('.pallete button')].find(b => b.textContent.includes('电源'))
  if (batt) {
    batt.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true }))
    await sleep(150)
    const hint = doc.querySelector('.statusbar .hint')
    uiCheck('状态栏提示随工具变化', !!hint && hint.textContent.includes('点击画布放置'))
    uiCheck('放置模式隐藏空画布引导', !doc.querySelector('.empty-hint'))
    // 回到选择模式
    const selBtn = [...doc.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('选择'))
    if (selBtn) selBtn.click()
    await sleep(120)
  }
}

// 顶栏「显示」面板：默认无角标，能展开
const dispBtn = [...doc.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('显示'))
uiCheck('顶栏有显示面板按钮', !!dispBtn)
uiCheck('默认状态无角标', !!dispBtn && !dispBtn.textContent.includes('·'))
if (dispBtn) {
  dispBtn.click()
  await sleep(150)
  uiCheck('显示面板能展开', !!doc.querySelector('.disp-menu'))
  dispBtn.click()
  await sleep(120)
}
console.log(uiPass + ' ui pass, ' + uiFail + ' ui fail')
if (uiFail) process.exit(1)
process.exit(0)

for (const e of errors.slice(0, 6)) console.log('---', e.split('\n').slice(0, 3).join(' | '))
process.exit(0)
