
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { createWorld, applyForces, VEL_SCALE } from '../src/sim/engine.js'
let pass = 0, fail = 0
const near = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + got.toFixed(3) + ', want ' + want.toFixed(3))
  ok ? pass++ : fail++
}
// 1) 螺旋加速：出盒时速率明显大于初速
{
  const cy = { id: 1, type: 'cyclotron', props: { R: 170, U: 2, B: 2 }, x: 480, y: 300, body: null }
  const ch = { id: 2, type: 'charge', props: { q: 1, m: 0.5, r: 8 }, x: 480, y: 300, body: null }
  ch.body = Matter.Bodies.circle(480, 300, 8, { frictionAir: 0 })
  Matter.Body.setMass(ch.body, 0.5)
  Matter.Body.setVelocity(ch.body, { x: 2/VEL_SCALE, y: 0 })
  const w = createWorld(); Matter.Composite.add(w.world, ch.body)
  let finalV = 0
  for (let i = 0; i < 300; i++) { applyForces([cy, ch]); Matter.Engine.update(w, 1000/60) }
  finalV = Math.hypot(ch.body.velocity.x, ch.body.velocity.y) * VEL_SCALE
  near('回旋加速 出盒速率 = 2+2×qU/m = 10', finalV, 10.0, 1.0)
}
// 2) 磁场内圆周速率守恒（基础约束不受 cyclotron 代码影响）
{
  const ch = { id: 3, type: 'charge', props: { q: 1, m: 0.5, r: 8 }, x: 480, y: 300, body: null }
  ch.body = Matter.Bodies.circle(480, 300, 8, { frictionAir: 0 })
  Matter.Body.setMass(ch.body, 0.5)
  Matter.Body.setVelocity(ch.body, { x: 2/VEL_SCALE, y: 0 })
  const w = createWorld(); Matter.Composite.add(w.world, ch.body)
  for (let i = 0; i < 200; i++) { applyForces([ch]); Matter.Engine.update(w, 1000/60) }
  near('无元件 电荷速度不变', Math.hypot(ch.body.velocity.x, ch.body.velocity.y) * VEL_SCALE, 2, 0.02)
}
console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
