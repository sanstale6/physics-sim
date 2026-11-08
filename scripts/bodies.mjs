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

// 导轨必须是两根杆、且中间留空
{
  const def = registry.rail.body(500, 300, { len: 400, gap: 120 })
  ok('导轨两根杆', def.type === 'compound' && def.parts.length === 2)
  const b = Matter.Body.create({ parts: def.parts.map(pt => Matter.Bodies.rectangle(500 + pt.x, 300 + pt.y, pt.w, pt.h)), isStatic: true })
  ok('导轨中间留空', b.bounds.min.y < 300 - 40 && b.bounds.max.y > 300 + 40, `y ${b.bounds.min.y.toFixed(0)}..${b.bounds.max.y.toFixed(0)}`)
}

console.log(`\n${pass} 通过, ${fail} 失败`)
if (fail) process.exit(1)
