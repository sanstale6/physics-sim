// 轻绳/定滑轮约束回归：绳长不被拉长、滑轮两端加速度关系
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { createWorld, applyForces, postStep } from '../src/sim/engine.js'

const VEL = 0.6
let pass = 0, fail = 0
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + got.toFixed(3) + ', want ' + want.toFixed(3))
  ok ? pass++ : fail++
}
function mk(type, x, y, props) {
  const reg = registry[type]; const p = { ...reg.defaults(), ...props }
  const o = { id: Math.random(), type, props: p, x, y, body: null }
  const def = typeof reg.body === 'function' ? reg.body(x, y, p) : null
  if (!def) return o
  const opts = { frictionAir: 0, ...def.options }
  const b = def.type === 'circle' ? Matter.Bodies.circle(x, y, def.r, opts) : Matter.Bodies.rectangle(x, y, def.w, def.h, opts)
  if (def.type === 'rotRect') Matter.Body.setAngle(b, def.angle ?? 0)
  if (p.m != null && !b.isStatic) Matter.Body.setMass(b, p.m)
  o.body = b; return o
}
function step(objs, world, n) {
  for (let i = 0; i < n; i++) { applyForces(objs); Matter.Engine.update(world, 1000 / 60); postStep(objs) }
}

// 1) 绳长不变：两球用 150px 轻绳相连，左球被 10N 拉，两球一起走
{
  const objs = [mk('ball', 0, 0, { m: 1, r: 12 }), mk('ball', 200, 0, { m: 1, r: 12 }), mk('rope', 100, 0, { len: 150 })]
  const w = createWorld(); w.world.gravity.y = 0; w.world.gravity.scale = 0
  Matter.Composite.add(w.world, objs.filter(o => o.body).map(o => o.body))
  // 手动施加外力（跳过 constantForce 元件，直接给左球 -10N）
  let maxD = 0
  for (let i = 0; i < 120; i++) {
    Matter.Body.applyForce(objs[0].body, objs[0].body.position, { x: -10 * 1e-4, y: 0 })
    Matter.Engine.update(w, 1000 / 60); postStep(objs)
    maxD = Math.max(maxD, Math.abs(objs[1].body.position.x - objs[0].body.position.x))
  }
  check('绳长上限 (150px)', maxD, 150, 1.5)
  const vavg = (objs[0].body.velocity.x + objs[1].body.velocity.x) / 2 * VEL
  check('整体加速度 |a|=F/(m1+m2)=5', Math.abs(vavg) / 2, 5, 0.1)   // 2s
}

// 2) 定滑轮：2kg 与 1kg，理论 a = (m1-m2)g/(m1+m2) = 3.27 m/s²
{
  const objs = [mk('pulley', 0, 0, { r: 22, len: 600 }),
    mk('ball', -16, 300, { m: 2, r: 12 }), mk('ball', 16, 300, { m: 1, r: 12 })]
  const w = createWorld()
  Matter.Composite.add(w.world, objs.filter(o => o.body).map(o => o.body))
  step(objs, w, 6)
  const v0 = objs[1].body.velocity.y * VEL
  step(objs, w, 30)
  const v1 = objs[1].body.velocity.y * VEL
  check('滑轮重物加速度 a=3.267', (v1 - v0) / 0.5, 3.267, 0.25)
  const da = Math.hypot(objs[1].body.position.x, objs[1].body.position.y)
  const db = Math.hypot(objs[2].body.position.x, objs[2].body.position.y)
  check('滑轮绳长守恒 (600px)', da + db, 600, 2)
}
console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
