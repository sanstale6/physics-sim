// 桌面/轨道回归：物块能停在桌面上、桌面摩擦可减速
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { createWorld, applyForces } from '../src/sim/engine.js'
import { supportUnder } from '../src/sim/contacts.js'

const G = 9.8, VEL = 0.6
let pass = 0, fail = 0
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + got.toFixed(3) + ', want ' + want.toFixed(3))
  ok ? pass++ : fail++
}
function mk(type, x, y, props) {
  const reg = registry[type]; const p = { ...reg.defaults(), ...props }
  const o = { id: Math.random(), type, props: p, x, y, body: null }
  const def = reg.body(x, y, p); const opts = { frictionAir: 0, ...def.options }
  const b = def.type === 'circle' ? Matter.Bodies.circle(x, y, def.r, opts) : Matter.Bodies.rectangle(x, y, def.w, def.h, opts)
  if (def.type === 'rotRect') Matter.Body.setAngle(b, def.angle ?? 0)
  if (p.m != null && !b.isStatic) Matter.Body.setMass(b, p.m)
  o.body = b; return o
}
// 1) 静置：物块落在桌面上不下沉
{
  const world = createWorld()
  const trk = mk('track', 0, 300, { len: 400 })
  const blk = mk('block', 0, 280, { m: 1, mu: 0.3 })
  const objs = [trk, blk]
  Matter.Composite.add(world.world, objs.map(o => o.body))
  const top0 = trk.body.bounds.min.y
  for (let i = 0; i < 60; i++) { applyForces(objs); Matter.Engine.update(world, 1000 / 60) }
  check('桌面静置不穿透 (底边-顶面)', blk.body.bounds.max.y - top0, 0, 2)
  check('桌面静置速度', Math.abs(blk.body.velocity.x) + Math.abs(blk.body.velocity.y), 0, 0.02)
  check('supportUnder 命中', supportUnder(blk, objs) ? 1 : 0, 1, 0)
}
// 2) 桌面摩擦 v0=4m/s，a=μg=2.94
{
  const world = createWorld()
  const trk = mk('track', 0, 300, { len: 1200 })
  const blk = mk('block', -400, 280, { m: 2, mu: 0.3 })
  const objs = [trk, blk]
  Matter.Composite.add(world.world, objs.map(o => o.body))
  Matter.Body.setVelocity(blk.body, { x: 4 / VEL, y: 0 })
  for (let i = 0; i < 30; i++) { applyForces(objs); Matter.Engine.update(world, 1000 / 60) }
  check('桌面 μ=0.3 滑行 0.5s 末速', blk.body.velocity.x * VEL, 4 - 0.3 * G * 0.5, 0.3)
}
// 3) 桌面边缘掉下去（横向越界不该继续被支撑）
{
  const world = createWorld()
  const trk = mk('track', 0, 300, { len: 200 })
  const blk = mk('block', 300, 280, { m: 1, mu: 0.3 })
  const objs = [trk, blk]
  Matter.Composite.add(world.world, objs.map(o => o.body))
  const y0 = blk.body.position.y
  for (let i = 0; i < 30; i++) { applyForces(objs); Matter.Engine.update(world, 1000 / 60) }
  check('桌面外侧自由下落 0.5s 位移 (1.225m=122px)', blk.body.position.y - y0, 122.5, 8)
}
console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
