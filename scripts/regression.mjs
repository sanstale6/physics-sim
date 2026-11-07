// 数值回归：node scripts/regression.mjs（在项目根目录运行）
import { solve } from '../src/sim/circuit.js'
import Matter from 'matter-js'

let pass = 0, fail = 0
const check = (name, got, want, tol = 1e-3) => {
  const ok = Math.abs(got - want) <= tol
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + ': got ' + got + ', want ' + want)
  ok ? pass++ : fail++
}
let id = 0
const mk = (type, x, y, props) => ({ id: ++id, type, x, y, props: { len: 100, angle: 0, ...props } })

// 1) 串联
const s1 = [mk('battery',0,0,{E:6,r:0.5}), mk('resistor',50,50,{R:10,angle:90}), mk('resistor',-50,50,{R:20,angle:90}), mk('wire',0,100)]
const I1 = Math.max(...[...solve(s1).currents.values()].map(Math.abs))
check('串联 I (6/30.5)', I1, 6/30.5)

// 2) 真并联
const s2 = [
  mk('battery', 50, -40, { E: 6, r: 0.5 }),
  mk('wire', 0, -20, { len: 40, angle: 90 }),
  mk('wire', 100, -20, { len: 40, angle: 90 }),
  mk('resistor', 50, 0, { R: 20 }),
  mk('resistor', 50, 80, { R: 20 }),
  mk('wire', 0, 40, { len: 80, angle: 90 }),
  mk('wire', 100, 40, { len: 80, angle: 90 }),
]
const r2 = solve(s2)
const I2 = [...r2.currents.values()].map(Math.abs).sort((a,b)=>b-a)
check('并联 I总', I2[0], 6/10.5)
check('并联 支路', I2[3], 3/10.5)

// 3) 短路告警
const s3 = [mk('battery',0,0,{E:6,r:0.5}), mk('wire',0,0)]
const r3 = solve(s3)
const shortOk = r3.warnings.some(w=>w.kind==='short')
console.log((shortOk?'PASS':'FAIL') + ' 短路告警'); shortOk?pass++:fail++

// 4) 断路告警
const s4 = [mk('battery',0,0,{E:6,r:0.5}), mk('resistor',50,50,{R:10,angle:90}), mk('switch',0,100,{closed:false}), mk('wire',-50,50,{angle:90})]
const r4 = solve(s4)
const openOk = r4.warnings.some(w=>w.kind==='open')
console.log((openOk?'PASS':'FAIL') + ' 断路告警'); openOk?pass++:fail++

// 5) 动量守恒
const eng = Matter.Engine.create({ gravity: { x: 0, y: 0 } })
const A = Matter.Bodies.circle(0,0,20,{restitution:1,frictionAir:0})
const B = Matter.Bodies.circle(200,0,20,{restitution:1,frictionAir:0})
Matter.Body.setMass(A,2); Matter.Body.setMass(B,1)
Matter.Body.setVelocity(A,{x:5,y:0})
Matter.Composite.add(eng.world,[A,B])
for (let i=0;i<200;i++) Matter.Engine.update(eng,16.67)
check('Σp 守恒', 2*A.velocity.x + B.velocity.x, 10, 1e-6)
console.log('ΣEk = ' + (0.5*2*A.velocity.x**2+0.5*B.velocity.x**2).toFixed(3) + ' (初 25)')

console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
