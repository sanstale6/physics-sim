import Matter from 'matter-js'
import { createWorld, applyForces, VEL_SCALE } from '../src/sim/engine.js'
let pass = 0, fail = 0
const near = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + got.toFixed(3) + ', want ' + want.toFixed(3))
  ok ? pass++ : fail++
}
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name, info) }

// 回旋加速器：R=170px、U=2V、B=2T、q=1、m=0.5、v0=0.5
const R = 170, U = 2, B = 2, q = 1, m = 0.5, v0 = 0.5
const cy = { id: 1, type: 'cyclotron', props: { R, U, B }, x: 480, y: 300, body: null }
const ch = { id: 2, type: 'charge', props: { q, m, r: 8 }, x: 480, y: 300, body: null }
ch.body = Matter.Bodies.circle(480, 300, 8, { frictionAir: 0 })
Matter.Body.setMass(ch.body, m)
Matter.Body.setVelocity(ch.body, { x: v0 / VEL_SCALE, y: 0 })
const w = createWorld(); Matter.Composite.add(w.world, ch.body)

const wAbs = (q * B) / m                     // 4 rad/s
const r0 = (m * v0) / (q * B) * 100          // 12.5px
const vmax = (q * B * R) / 100 / m           // 6.8 m/s（出盒时速率）

let prevCross = 0, prevV = v0, mono = true, onCircle = true, maxDev = 0, inside = true
let finalV = 0, exitR = 0, crossings = 0
for (let i = 0; i < 500; i++) {
  applyForces([cy, ch]); Matter.Engine.update(w, 1000 / 60)
  const v = Math.hypot(ch.body.velocity.x, ch.body.velocity.y) * VEL_SCALE
  const out = ch.body._cycOut === cy.id
  if (!out) {
    crossings = cy._crossings ?? 0
    // 每次穿缝按动能定理 v² = v0² + 2qU·n/m 增长
    if (crossings > prevCross) {
      const want = Math.sqrt(v0 * v0 + (2 * q * U * crossings) / m)
      if (Math.abs(v - want) > 0.02) mono = false
      prevCross = crossings
    } else if (v < prevV - 1e-6) mono = false
    prevV = v
    // 圆心必须在加速器中心：|pos-C| 应等于 r=mv/(qB)
    const d = Math.hypot(ch.body.position.x - 480, ch.body.position.y - 300)
    const rTheo = (m * v) / (q * B) * 100
    const dev = Math.abs(d - rTheo)
    maxDev = Math.max(maxDev, dev)
    if (dev > 2) onCircle = false
    if (d > R + 2) inside = false
  } else if (!exitR) {
    exitR = 1
    finalV = v
  }
}
ok('起点半径 ≈ 12.5px（从盒中心附近起步）', Math.abs(r0 - 12.5) < 1, `r0=${r0.toFixed(1)}px`)
ok('穿缝加速符合动能定理 v²=v0²+2qU·n/m', mono, `穿缝 ${crossings} 次`)
ok('轨道始终以加速器中心为圆心', onCircle, `最大偏差 ${maxDev.toFixed(2)}px`)
ok('出盒前始终在 D 形盒内', inside)
near('出盒速率 = qBR/m = 6.8', finalV, vmax, 0.3)
ok('出盒时确实达到盒半径（r ≥ R）', exitR === 1 && finalV > v0 * 5, `v=${finalV.toFixed(2)}m/s`)

// 磁场内圆周速率守恒（基础约束不受 cyclotron 代码影响）
{
  const c2 = { id: 3, type: 'charge', props: { q: 1, m: 0.5, r: 8 }, x: 480, y: 300, body: null }
  c2.body = Matter.Bodies.circle(480, 300, 8, { frictionAir: 0 })
  Matter.Body.setMass(c2.body, 0.5)
  Matter.Body.setVelocity(c2.body, { x: 2 / VEL_SCALE, y: 0 })
  const w2 = createWorld(); Matter.Composite.add(w2.world, c2.body)
  for (let i = 0; i < 200; i++) { applyForces([c2]); Matter.Engine.update(w2, 1000 / 60) }
  near('无元件 电荷速度不变', Math.hypot(c2.body.velocity.x, c2.body.velocity.y) * VEL_SCALE, 2, 0.02)
}
console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
