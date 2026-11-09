// 电荷相互作用开关 + 极板电压→灯泡功率联动
import Matter from 'matter-js'
import { createWorld, applyForces, VEL_SCALE, gravityState, coulombState } from '../src/sim/engine.js'
import { solve } from '../src/sim/circuit.js'
const { Bodies } = Matter
let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name, info) }

// —— 1. 库仑力：两个同号电荷互相排斥 ——
const mk2 = () => {
  gravityState.on = false
  const w = createWorld(); w.gravity.y = 0
  const a = { id: 'a', type: 'charge', x: 400, y: 300, props: { q: 1, m: 1 }, body: Bodies.circle(400, 300, 10, { mass: 1, frictionAir: 0 }) }
  const b = { id: 'b', type: 'charge', x: 600, y: 300, props: { q: 1, m: 1 }, body: Bodies.circle(600, 300, 10, { mass: 1, frictionAir: 0 }) }
  Matter.Composite.add(w.world, [a.body, b.body])
  return { w, comps: [a, b] }
}
{
  coulombState.on = true
  const { w, comps } = mk2()
  for (let i = 0; i < 60; i++) { applyForces(comps); Matter.Engine.update(w, 1000 / 60) }
  const gap = comps[1].body.position.x - comps[0].body.position.x
  ok('库仑力开：同号电荷相互排斥', gap > 210, `间距 ${gap.toFixed(1)}px（初始 200）`)
}
{
  coulombState.on = false
  const { w, comps } = mk2()
  for (let i = 0; i < 60; i++) { applyForces(comps); Matter.Engine.update(w, 1000 / 60) }
  const gap = comps[1].body.position.x - comps[0].body.position.x
  ok('忽略电荷相互作用：位置不变', Math.abs(gap - 200) < 0.5, `间距 ${gap.toFixed(1)}px`)
  coulombState.on = true
}

// —— 2. 极板电压变化 → 灯泡功率变化（曾因 solve 缓存 key 不含 U 而恒定） ——
// 极板 angle=0 时两端子在 (300,240)/(300,360)；灯泡水平放 (440,300) 端子 (390,300)/(490,300)
const wireAB = (id, a, b) => ({
  id, type: 'wire',
  x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2,
  props: { len: Math.hypot(b[0] - a[0], b[1] - a[1]), angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI },
})
const circuit = (U) => [
  { id: 'p', type: 'plates', x: 300, y: 300, props: { len: 200, gap: 120, U, angle: 0 } },
  { id: 'bulb', type: 'bulb', x: 440, y: 300, props: { R: 10, len: 100, angle: 0 } },
  wireAB('w1', [300, 240], [390, 300]),
  wireAB('w2', [490, 300], [300, 360]),
]
{
  const r1 = solve(circuit(5))
  const r2 = solve(circuit(10))
  const I1 = r1 ? Math.abs(r1.currents.get('bulb')) : NaN
  const I2 = r2 ? Math.abs(r2.currents.get('bulb')) : NaN
  const P1 = I1 * I1 * 10, P2 = I2 * I2 * 10
  ok('极板 U=5V 时灯泡功率 > 0', P1 > 0.01, `I=${I1.toFixed(3)}A P=${P1.toFixed(3)}W`)
  ok('极板电压翻倍 → 功率约 4 倍', Math.abs(P2 / P1 - 4) < 0.25, `P5=${P1.toFixed(3)}W P10=${P2.toFixed(3)}W 比值=${(P2 / P1).toFixed(2)}`)
}
console.log(`\n${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
