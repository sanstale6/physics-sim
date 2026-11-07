// 弹簧振子周期 + 平抛运动精度
import Matter from 'matter-js'
import { createWorld, applyForces, VEL_SCALE } from '../src/sim/engine.js'

let pass = 0, fail = 0
const check = (name, cond, detail) => { if (cond) { pass++; console.log('PASS', name, detail ?? '') } else { fail++; console.log('FAIL', name, detail ?? '') } }

// —— 弹簧振子：两球 m=1 之间 k=50，相对振动的周期 T=2π√(μ/k) ——
{
  const engine = createWorld()
  engine.gravity.y = 0
  const m1 = Matter.Bodies.circle(400, 300, 12, { frictionAir: 0 })
  const m2 = Matter.Bodies.circle(580, 300, 12, { frictionAir: 0 })
  Matter.Body.setMass(m1, 1); Matter.Body.setMass(m2, 1)
  Matter.Composite.add(engine.world, [m1, m2])
  const objs = [
    { id: 1, type: 'ball', x: 400, y: 300, props: { m: 1, r: 12 }, body: m1 },
    { id: 2, type: 'ball', x: 580, y: 300, props: { m: 1, r: 12 }, body: m2 },
    { id: 3, type: 'spring', x: 490, y: 300, props: { k: 50, restLen: 120 } },
  ]
  const xs = []
  for (let i = 0; i < 400; i++) { applyForces(objs); Matter.Engine.update(engine, 1000 / 60); xs.push(m2.position.x - m1.position.x) }
  const eq = 120, cross = []
  for (let i = 1; i < xs.length; i++) if ((xs[i - 1] - eq) * (xs[i] - eq) < 0) cross.push(i)
  const half = (cross[cross.length - 1] - cross[0]) / (cross.length - 1) / 60
  const T = half * 2
  const theory = 2 * Math.PI * Math.sqrt(0.5 / 50)
  check('弹簧振子周期', Math.abs(T - theory) / theory < 0.03, T.toFixed(3) + ' vs ' + theory.toFixed(3))
  const sym = Math.abs((eq - Math.min(...xs)) - (Math.max(...xs) - eq))
  check('振动关于平衡位置对称', sym < 3, 'sym=' + sym.toFixed(2))
}

// —— 平抛：v0=6 m/s，0.5s 后水平 3m、竖直 1.225m ——
{
  const engine = createWorld()
  const b = Matter.Bodies.circle(200, 100, 10, { frictionAir: 0, restitution: 0 })
  Matter.Body.setMass(b, 1)
  Matter.Composite.add(engine.world, b)
  Matter.Body.setVelocity(b, { x: 6 / VEL_SCALE, y: 0 })
  const objs = [{ id: 1, type: 'ball', x: 200, y: 100, props: { m: 1, r: 10 }, body: b }]
  for (let i = 0; i < 30; i++) { applyForces(objs); Matter.Engine.update(engine, 1000 / 60) }
  const dx = (b.position.x - 200) / 100
  const dy = (b.position.y - 100) / 100
  check('平抛水平位移', Math.abs(dx - 3) < 0.15, dx.toFixed(3) + ' m (理论 3.000)')
  check('平抛竖直位移', Math.abs(dy - 1.225) < 0.08, dy.toFixed(3) + ' m (理论 1.225)')
}

console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
