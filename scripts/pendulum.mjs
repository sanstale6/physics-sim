// 单摆回归：小角度周期 T = 2π√(L/g)
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { createWorld, applyForces, postStep } from '../src/sim/engine.js'

const DT = 1 / 60
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
  if (p.m != null && !b.isStatic) Matter.Body.setMass(b, p.m)
  o.body = b; return o
}

const L = 200                       // 2 m 摆长，周期更大、采样更准
const objs = [mk('pendulum', 0, 0, { len: L }), mk('ball', 20, Math.sqrt(L * L - 400), { m: 1, r: 8 })]
const w = createWorld()
Matter.Composite.add(w.world, objs.filter(o => o.body).map(o => o.body))
const b = objs[1].body
let prev = b.position.x, prevSign = 0, crossings = []
for (let i = 0; i < 900; i++) {
  applyForces(objs); Matter.Engine.update(w, 1000 / 60); postStep(objs)
  const x = b.position.x
  const s = Math.sign(x) || prevSign
  if (prevSign && s !== prevSign) crossings.push((i + 1) * DT)
  prevSign = s; prev = x
}
const periods = []
for (let i = 0; i + 2 < crossings.length; i += 2) periods.push(crossings[i + 2] - crossings[i])
const T = periods.length ? periods.reduce((a, c) => a + c, 0) / periods.length : 0
check('单摆周期 T=2π√(L/g), L=2m', T, 2 * Math.PI * Math.sqrt(2 / 9.8), 0.06)
const dist = Math.hypot(b.position.x, b.position.y)
check('摆长保持', dist, L, 1.5)
console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
