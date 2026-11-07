
import Matter from 'matter-js'
import { createWorld, applyForces, postStep, VEL_SCALE, gravityState } from '../src/sim/engine.js'
const { Bodies, Body } = Matter
gravityState.on = false
const comps = [
  { id: 'b1', type: 'charge', x: 400, y: 300, props: { q: 10, m: 1 }, body: Bodies.circle(400, 300, 12, { mass: 1, frictionAir: 0 }) },
  { id: 'f1', type: 'uniformB', x: 400, y: 300, props: { w: 400, h: 400, bz: 2 } },
]
const w = createWorld()
w.gravity.y = 0
Matter.Composite.add(w.world, comps[0].body)
Body.setVelocity(comps[0].body, { x: 5 / VEL_SCALE, y: 0 })
let minX = Infinity, maxX = -Infinity
for (let i = 0; i < 400; i++) {
  applyForces(comps)
  Matter.Engine.update(w, 1000 / 60)
  postStep(comps)
  minX = Math.min(minX, comps[0].body.position.x); maxX = Math.max(maxX, comps[0].body.position.x)
}
const v = comps[0].body.velocity
console.log('speed', (Math.hypot(v.x,v.y)*VEL_SCALE).toFixed(3), 'm/s (want 5); diameter', (maxX-minX).toFixed(1), '(want 50)')
