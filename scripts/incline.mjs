// 斜面/摩擦数值回归：用长斜面 + 速度斜率测加速度
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { createWorld, applyForces } from '../src/sim/engine.js'
import { contactIncline } from '../src/sim/incline.js'
import { snapToIncline } from '../src/sim/place.js'

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
function slope(angle, mu) {
  const a = angle * Math.PI / 180, world = createWorld()
  const inc = mk('incline', 0, 0, { angle, len: 1200 })
  const nx = Math.sin(a), ny = -Math.cos(a)
  const blk = mk('block', nx * 23, ny * 23, { m: 2, mu })
  const objs = [inc, blk]
  Matter.Composite.add(world.world, objs.map(o => o.body))
  let v0 = null, t0 = 0, v1 = 0, t1 = 0
  for (let i = 0; i < 150; i++) {
    applyForces(objs); Matter.Engine.update(world, 1000 / 60)
    if (!contactIncline(blk, objs)) break
    const v = Math.hypot(blk.body.velocity.x, blk.body.velocity.y) * VEL
    if (i === 60) { v0 = v; t0 = (i + 1) / 60 }
    if (i === 140) { v1 = v; t1 = (i + 1) / 60 }
  }
  return v0 == null ? 0 : (v1 - v0) / (t1 - t0)
}
check('30° μ=0.3 加速度', slope(30, 0.3), G * (Math.sin(Math.PI / 6) - 0.3 * Math.cos(Math.PI / 6)), 0.2)
check('30° μ=0 加速度', slope(30, 0), G * Math.sin(Math.PI / 6), 0.25)
check('30° μ=0.8 静止', slope(30, 0.8), 0, 0.05)
check('45° μ=0.5 加速度', slope(45, 0.5), G * (Math.SQRT1_2 - 0.5 * Math.SQRT1_2), 0.25)

// 地面摩擦：v0=5m/s 滑行，a=μg
{
  const world = createWorld()
  const gnd = mk('ground', 0, 300, { w: 2000 })
  const blk = mk('block', -400, 280, { m: 2, mu: 0.25 })
  const objs = [gnd, blk]
  Matter.Composite.add(world.world, objs.map(o => o.body))
  Matter.Body.setVelocity(blk.body, { x: 5 / VEL, y: 0 })
  for (let i = 0; i < 30; i++) { applyForces(objs); Matter.Engine.update(world, 1000 / 60) }
  const v = blk.body.velocity.x * VEL
  check('地面 μ=0.25 滑行 0.5s 末速', v, 5 - 0.25 * G * 0.5, 0.35)
}
// 斜面吸附：返回的 angle 是弧度（供刚体 setAngle），spawn 再换算成 props.angle 的度数。
// 这里钉住「弧度 × 180/π = 斜面倾角」这一约定，防止出现 0.52° 这类单位错位。
{
  const inc = mk('incline', 0, 0, { angle: 30, len: 400 })
  const a = 30 * Math.PI / 180
  // 斜边中点（斜面中心）沿外法线上方 30px 处放置物块
  const nx = Math.sin(a), ny = -Math.cos(a)
  const snap = snapToIncline('block', nx * 30, ny * 30, [inc])
  check('斜面吸附命中', snap ? 1 : 0, 1, 0)
  check('吸附角(弧度)', snap ? snap.angle : 0, a, 1e-6)
  check('吸附角换算成度数', snap ? snap.angle * 180 / Math.PI : 0, 30, 1e-6)
  check('吸附点贴面（中心到斜面距离=半高+1）', snap ? Math.hypot(snap.x, snap.y) : 0, 16, 1.5)
}

console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
