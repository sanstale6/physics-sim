// 电容器充放电（RC 暂态）验证
import { applyForces } from '../src/sim/engine.js'
import { solve } from '../src/sim/circuit.js'

let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name, info) }
const near = (name, got, want, tol) => ok(name, Math.abs(got - want) <= tol, `got ${got.toFixed(3)}, want ${want.toFixed(3)}`)

// 导线按两端坐标生成（任意角度），端子精确重合
const wireAB = (id, a, b) => ({
  id, type: 'wire',
  x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2,
  props: { len: Math.hypot(b[0] - a[0], b[1] - a[1]), angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI },
})

// 串联回路：battery(E6,r0.5) → resistor(10Ω) → capacitor(100μF)
// τ = (0.5+10+0.1) × (100e-6 × 1000) = 10.6 × 0.1 = 1.06s
const circuit = () => [
  { id: 'b', type: 'battery', x: 200, y: 200, props: { E: 6, r: 0.5, len: 200, angle: 0 } },   // a(100,200) b(300,200)
  { id: 'r', type: 'resistor', x: 450, y: 200, props: { R: 10, len: 200, angle: 0 } },         // a(350,200) b(550,200)
  { id: 'c', type: 'capacitor', x: 700, y: 200, props: { C: 100, len: 200, angle: 180 } },      // a(800,200) b(600,200)：b 接电阻（正极侧）
  wireAB('w1', [300, 200], [350, 200]),
  wireAB('w2', [550, 200], [600, 200]),
  { id: 'w3', type: 'wire', x: 450, y: 400, props: { len: 700, angle: 0 } },                    // (100,400)-(800,400)
  { id: 'w4', type: 'wire', x: 100, y: 300, props: { len: 200, angle: 90 } },                   // (100,200)-(100,400)
  { id: 'w5', type: 'wire', x: 800, y: 300, props: { len: 200, angle: 90 } },                   // (800,200)-(800,400)
]

// —— 充电：U 从 0 单调上升到接近 E ——
{
  const comps = circuit()
  const cap = comps.find(c => c.type === 'capacitor')
  let prevU = -1, mono = true
  const track = []
  for (let i = 0; i < 360; i++) {           // 6s
    applyForces(comps)
    const U = cap.props.U ?? 0
    if (U < prevU - 1e-9) mono = false
    prevU = U
    if ([60, 64, 127, 318].includes(i)) track.push([i / 60, U])
  }
  const Ufinal = cap.props.U ?? 0
  // 理论：τ=(0.5+10+0.1)×0.1=1.06s，U(t)=6(1-e^{-t/τ})；t=6s→5.97V
  ok('充电：电压单调上升', mono)
  ok('充电 1s 后 U 在 E 的 40%~85%（指数曲线中段）', track[1][1] > 2.4 && track[1][1] < 5.1, `U=${track[1][1].toFixed(2)}V`)
  near('充电 6s 后 U≈5.97V（基本充满）', Ufinal, 5.97, 0.15)
  ok('充电稳态电流趋近 0', Math.abs(solve(comps).currents.get('c')) < 1e-2, `I=${solve(comps).currents.get('c').toExponential(2)}A`)
  ok('充电曲线各采样点均为正', track.length === 4 && track.every(t => t[1] > 0))
}

// —— 放电：充满后短路电源，U 指数下降 ——
{
  const comps = circuit()
  const cap = comps.find(c => c.type === 'capacitor')
  for (let i = 0; i < 360; i++) applyForces(comps)   // 先充满
  const U0 = cap.props.U ?? 0
  // 把 battery 换成导线短路（battery 位置短路，电容经电阻放电）
  const bIdx = comps.findIndex(c => c.type === 'battery')
  comps.splice(bIdx, 1, { id: 'b', type: 'wire', x: 200, y: 200, props: { len: 200, angle: 0 } })
  let monoDown = true, prev = U0
  const track2 = []
  for (let i = 0; i < 360; i++) {
    applyForces(comps)
    const U = cap.props.U ?? 0
    if (U > prev + 1e-9) monoDown = false
    prev = U
    if ([64, 127, 318].includes(i)) track2.push([i / 60, U])
  }
  const Uend = cap.props.U ?? 0
  ok('放电：电压单调下降', monoDown, `U0=${U0.toFixed(2)}V`)
  ok('放电 1.07s 后 U 在 U0 的 15%~60%（指数衰减中段）', track2[0][1] > U0 * 0.15 && track2[0][1] < U0 * 0.6, `U=${track2[0][1].toFixed(2)}V`)
  ok('放电 5.3s 后基本放完', Uend < 0.1, `U=${Uend.toFixed(3)}V`)
}

console.log(`\n${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
