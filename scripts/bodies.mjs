// 所有元件刚体构造冒烟：任何一个元件放不出场景都是致命 bug（曾因 compound 部件判定崩溃）
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'

let pass = 0, fail = 0
const ok = (n, c, e = '') => { if (c) { pass++; console.log('PASS', n, e) } else { fail++; console.log('FAIL', n, e) } }

for (const [k, reg] of Object.entries(registry)) {
  if (!reg.body) continue
  let body = null, err = null
  try {
    const p = reg.defaults()
    const def = reg.body(100, 100, p)
    if (def) {
      const opts = { frictionAir: 0, ...def.options }
      if (def.type === 'rectangle') body = Matter.Bodies.rectangle(100, 100, def.w, def.h, opts)
      else if (def.type === 'rotRect') body = Matter.Bodies.rectangle(100, 100, def.w, def.h, opts)
      else if (def.type === 'circle') body = Matter.Bodies.circle(100, 100, def.r, opts)
      else if (def.type === 'vertices') body = Matter.Bodies.fromVertices(100, 100, [def.verts], opts)
      else if (def.type === 'compound') {
        const parts = def.parts.map(pt => (pt.r != null
          ? Matter.Bodies.circle(100 + pt.x, 100 + pt.y, pt.r, pt.options ?? opts)
          : Matter.Bodies.rectangle(100 + pt.x, 100 + pt.y, pt.w, pt.h, pt.options ?? opts)))
        body = Matter.Body.create({ parts, ...opts, isStatic: true })
      }
    }
  } catch (e) { err = e.message }
  ok('构造 ' + k, !!body && !err, err ?? '')
}

// 金属棒：可运动导体，角度来自 props.angle，惯性取无穷（不被安培力矩转起来）
{
  const def = registry.metalRod.body(500, 300, { len: 240, angle: 90 })
  ok('金属棒 rotRect', def.type === 'rotRect')
  ok('金属棒竖直（angle=props.angle）', Math.abs(def.angle - Math.PI / 2) < 1e-6)
  const b = Matter.Bodies.rectangle(500, 300, def.w, def.h, def.options)
  Matter.Body.setAngle(b, def.angle)
  ok('金属棒不旋转', b.inertia === Infinity, 'inertia ' + b.inertia)
  ok('金属棒长度 240', Math.abs(b.bounds.max.y - b.bounds.min.y - 240) < 20,
    `h ${(b.bounds.max.y - b.bounds.min.y).toFixed(0)}`)
}

console.log(`\n${pass} 通过, ${fail} 失败`)
if (fail) process.exit(1)
