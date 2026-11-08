
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { createWorld, applyForces, VEL_SCALE } from '../src/sim/engine.js'
function mk(type, x, y, props) {
  const reg = registry[type], p = { ...reg.defaults(), ...props }
  const o = { id: 1, type, props: p, x, y, body: null }
  if (!reg.body) return o
  const def = reg.body(x, y, p)
  const b = def.type === 'circle' ? Matter.Bodies.circle(x, y, def.r, { frictionAir: 0, ...def.options })
    : Matter.Bodies.rectangle(x, y, def.w, def.h, { frictionAir: 0, ...def.options })
  if (p.m != null && !b.isStatic) Matter.Body.setMass(b, p.m)
  o.body = b
  return o
}
const bf = mk('uniformB', 400, 300, { w: 440, h: 300, bz: 2 })
const ef = mk('uniformE', 400, 300, { w: 440, h: 300, ex: 0, ey: 20 })
const ch = mk('charge', 180, 300, { q: 1, m: 0.5, r: 10, v0x: 10 })
Matter.Body.setVelocity(ch.body, { x: 10/VEL_SCALE, y: 0 })
const w = createWorld(); Matter.Composite.add(w.world, ch.body)
for (let i = 1; i <= 70; i++) {
  applyForces([bf, ef, ch]); Matter.Engine.update(w, 1000/60)
  if (i % 10 === 0) console.log('step', i, 'x=', ch.body.position.x.toFixed(0), 'y=', ch.body.position.y.toFixed(1), 'vy(m/s)=', (ch.body.velocity.y*VEL_SCALE).toFixed(2))
}
