// 绘制冒烟测试：用一个假的 2D context 跑一遍所有元件的 overlay / 受力分析，捕获运行时异常
import { registry, setLineScale } from '../src/sim/registry.js'
import { analyzeForces } from '../src/sim/analysis.js'

const calls = { n: 0 }
const noop = () => {}
const ctx = new Proxy({}, {
  get(_, k) {
    if (k === 'canvas') return { width: 800, height: 600 }
    if (k === 'measureText') return () => ({ width: 30 })
    if (k === 'save' || k === 'restore' || k === 'beginPath' || k === 'stroke' || k === 'fill' ||
        k === 'moveTo' || k === 'lineTo' || k === 'arc' || k === 'closePath' || k === 'fillText' ||
        k === 'strokeText' || k === 'setLineDash' || k === 'translate' || k === 'rotate' ||
        k === 'scale' || k === 'fillRect' || k === 'strokeRect' || k === 'clearRect' ||
        k === 'quadraticCurveTo' || k === 'bezierCurveTo' || k === 'rect' || k === 'clip' ||
        k === 'ellipse' || k === 'arcTo') return (...a) => { calls.n++; return a }
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop: noop })
    return undefined
  },
  set() { return true },
})

let pass = 0, fail = 0
const types = Object.keys(registry).filter(t => registry[t].overlay)
const objs = types.map((t, i) => ({
  id: i + 1, type: t, x: 200 + i * 40, y: 300,
  props: { ...registry[t].defaults(), angle: i * 10, q: 2, m: 1, v0x: 5 },
}))
setLineScale(1)
for (const o of objs) {
  try { registry[o.type].overlay(ctx, o, objs); pass++ }
  catch (e) { fail++; console.log('FAIL overlay', o.type, '→', e.message) }
}
for (const o of objs) {
  try { analyzeForces({ ...o, body: null }, objs); pass++ }
  catch (e) { fail++; console.log('FAIL analysis', o.type, '→', e.message) }
}
console.log(pass + ' 通过, ' + fail + ' 失败（绘制调用 ' + calls.n + ' 次）')
process.exit(fail ? 1 : 0)
