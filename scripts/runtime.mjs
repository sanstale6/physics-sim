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
// —— 复现：放置金属导轨 ——
const railBtn = palBtns.find(b => b.textContent.includes('金属导轨'))
console.log('rail button:', !!railBtn)
if (railBtn) {
  railBtn.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true }))
  await sleep(80)
  pe('pointerdown', 400, 330)
  pe('pointerup', 400, 330)
  await sleep(250)
  console.log('errors after rail place:', errors.length)
  for (const e of errors.slice(0, 3)) console.log('---RAIL---', e.split('\n').slice(0, 6).join('\n'))
}
process.exit(0)

for (const e of errors.slice(0, 6)) console.log('---', e.split('\n').slice(0, 3).join(' | '))
process.exit(0)
