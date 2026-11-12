import Matter from 'matter-js'
import { applyForces, createWorld } from '../src/sim/engine.js'
import { registry } from '../src/sim/registry.js'

const engine = createWorld()

function mkCharge(id, x, y) {
  const o = { id, type: 'charge', x, y, props: { q: 1, m: 0.5, r: 8 }, body: null, home: { x, y, angle: 0 } }
  o.body = Matter.Bodies.circle(x, y, 8, { frictionAir: 0, label: 'charge' })
  Matter.Composite.add(engine.world, o.body)
  return o
}

function bench(label, comps, iters = 200) {
  // 预热
  for (let i = 0; i < 10; i++) applyForces(comps)
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) applyForces(comps)
  const ms = (performance.now() - t0) / iters
  console.log(`${label}: ${ms.toFixed(3)} ms/帧 (${comps.length} 元件)`)
  return ms
}

// 场景1：纯电路（无电荷）
const circuitOnly = [
  { id: 'b', type: 'battery', x: 200, y: 300, props: { E: 6, r: 0.5, len: 200, angle: 90 } },
  { id: 'r', type: 'resistor', x: 400, y: 300, props: { R: 10, len: 200, angle: 90 } },
  { id: 'w1', type: 'wire', x: 300, y: 200, props: { len: 200, angle: 0 } },
  { id: 'w2', type: 'wire', x: 300, y: 400, props: { len: 200, angle: 0 } },
]
bench('纯电路(4元件)', circuitOnly)

// 场景2：100 个电荷（电子枪发射 10s，rate=0.1）
{
  const comps = [...circuitOnly.map(c => ({ ...c, props: { ...c.props } }))]
  const charges = []
  for (let i = 0; i < 100; i++) charges.push(mkCharge('c' + i, 600 + (i % 20) * 20, 300 + Math.floor(i / 20) * 20))
  bench('100电荷+电路', [...comps, ...charges])
}

// 场景3：200 个电荷
{
  const comps = [...circuitOnly.map(c => ({ ...c, props: { ...c.props } }))]
  const charges = []
  for (let i = 0; i < 200; i++) charges.push(mkCharge('c' + i, 600 + (i % 20) * 20, 300 + Math.floor(i / 20) * 20))
  bench('200电荷+电路', [...comps, ...charges])
}

// 场景4：质谱仪（1 电荷 + 多场）
{
  const comps = [
    { id: 'q', type: 'charge', x: 160, y: 380, props: { q: 1, m: 0.5, r: 8 }, body: Matter.Bodies.circle(160, 380, 8, { frictionAir: 0 }) },
    { id: 'e', type: 'uniformE', x: 340, y: 380, props: { ex: 0, ey: 6, w: 180, h: 220 } },
    { id: 'b1', type: 'uniformB', x: 340, y: 380, props: { bz: 1, w: 180, h: 220 } },
    { id: 'b2', type: 'uniformB', x: 780, y: 480, props: { bz: 10, w: 700, h: 900 } },
    { id: 's', type: 'screen', x: 430, y: 623, props: { len: 346, angle: 90 } },
  ]
  bench('质谱仪(1电荷)', comps)
}

// 场景5：200 电荷分散（模拟电子枪射出的粒子流，首尾相距远）——验证距离截断收益
{
  const comps = []
  const charges = []
  for (let i = 0; i < 200; i++) {
    // 沿 x 方向一条流，间隔 30px，总长 6000px（首尾相距 > 800px）
    charges.push(mkCharge('c' + i, 200 + i * 30, 300))
  }
  bench('200电荷分散(一条流)', [...comps, ...charges])
}
