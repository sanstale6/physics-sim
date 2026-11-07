import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { createWorld, applyForces, VEL_SCALE } from '../src/sim/engine.js'

let pass = 0, fail = 0
const near = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + got.toFixed(3) + ', want ' + want.toFixed(3))
  ok ? pass++ : fail++
}

function mk(type, x, y, props) {
  const reg = registry[type], p = { ...reg.defaults(), ...props }
  const o = { id: Math.random(), type, props: p, x, y, body: null }
  if (!reg.body) return o
  const def = reg.body(x, y, p)
  const b = def.type === 'circle'
    ? Matter.Bodies.circle(x, y, def.r, { frictionAir: 0, ...def.options })
    : Matter.Bodies.rectangle(x, y, def.w, def.h, { frictionAir: 0, ...def.options })
  if (p.m != null && !b.isStatic) Matter.Body.setMass(b, p.m)
  o.body = b
  return o
}

function sim(objs, steps) {
  const w = createWorld()
  objs.forEach(o => o.body && Matter.Composite.add(w.world, o.body))
  for (let i = 0; i < steps; i++) { applyForces(objs); Matter.Engine.update(w, 1000 / 60) }
  return objs
}
const speed = (o) => Math.hypot(o.body.velocity.x, o.body.velocity.y) * VEL_SCALE

// 1) 匀强磁场：正电荷做圆周运动，半径 R = mv/(qB)
{
  const bf = mk('uniformB', 0, 0, { w: 4000, h: 4000, bz: 2 })
  const ch = mk('charge', 0, 0, { q: 1, m: 0.5, r: 10 })
  Matter.Body.setVelocity(ch.body, { x: 10 / VEL_SCALE, y: 0 })
  let minX = 0, maxX = 0
  const w = createWorld()
  Matter.Composite.add(w.world, ch.body)
  for (let i = 0; i < 200; i++) { applyForces([bf, ch]); Matter.Engine.update(w, 1000 / 60); minX = Math.min(minX, ch.body.position.x); maxX = Math.max(maxX, ch.body.position.x) }
  near('磁场 直径 (2R=500px)', maxX - minX, 500, 6)
  near('磁场 速率守恒', speed(ch), 10, 0.02)
}
// 2) 反向磁场：半径相同、方向相反
{
  const bf = mk('uniformB', 0, 0, { w: 4000, h: 4000, bz: -2 })
  const ch = mk('charge', 0, 0, { q: 1, m: 0.5, r: 10 })
  Matter.Body.setVelocity(ch.body, { x: 10 / VEL_SCALE, y: 0 })
  let minY = 0
  const w = createWorld()
  Matter.Composite.add(w.world, ch.body)
  for (let i = 0; i < 200; i++) { applyForces([bf, ch]); Matter.Engine.update(w, 1000 / 60); minY = Math.min(minY, ch.body.position.y) }
  near('反向磁场 向上偏转 (minY=-500)', minY, -500, 6)
}
// 3) 匀强电场：a = qE/m
{
  const ef = mk('uniformE', 0, 0, { w: 4000, h: 4000, ex: 10, ey: 0 })
  const ch = mk('charge', 0, 0, { q: 1, m: 1, r: 10 })
  sim([ef, ch], 60)
  near('电场 1s 后速率 (qE/m·t = 10)', speed(ch), 10, 0.5)
}
// 4) 无场时带电粒子不受重力
{
  const ch = mk('charge', 0, 0, { q: 1, m: 1, r: 10 })
  sim([ch], 120)
  near('电荷不受重力 (2s 竖直位移=0)', ch.body.position.y, 0, 0.5)
}
// 5) 无磁场时电荷速度不变
{
  const ch = mk('charge', 0, 0, { q: 2, m: 1, r: 10 })
  Matter.Body.setVelocity(ch.body, { x: 5 / VEL_SCALE, y: 0 })
  sim([ch], 120)
  near('无场 速度不变', speed(ch), 5, 0.02)
}
console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
