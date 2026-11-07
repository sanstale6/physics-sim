// 直流电路：端子-节点 + 节点电压法（Norton 等效，无理想电压源奇异问题）
// 约定：端子 a 为 −，b 为 +（电池），电流正方向 a→b
export const CIRCUIT_TYPES = [
  'junction','battery', 'resistor', 'bulb', 'rheostat', 'switch', 'ammeter', 'voltmeter', 'wire']

export function pins(o) {
  if (o.type === 'junction') return [{ x: o.x, y: o.y }, { x: o.x, y: o.y }]   // 接点：两端重合于圆心
  const len = o.props.len ?? 90
  const a = ((o.props.angle ?? 0) * Math.PI) / 180
  const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2
  return [{ x: o.x - dx, y: o.y - dy }, { x: o.x + dx, y: o.y + dy }]
}

export function resistance(o) {
  const p = o.props ?? o   // 兼容 Inspector 传入的扁平 {type,...props} 对象
  switch (o.type) {
    case 'wire': return 1e-3
    case 'junction': return 1e-3
    case 'ammeter': return 1e-2
    case 'voltmeter': return 1e6
    case 'switch': return p.closed ? 5e-3 : 1e12
    case 'rheostat': return Math.max(0.01, p.R ?? 10)
    case 'resistor': return Math.max(0.01, p.R ?? 10)
    case 'bulb': return Math.max(0.5, p.R ?? 10)
    default: return null
  }
}

// 端子聚类成节点（容差 tol 像素）
function clusterNodes(els, tol = 12) {
  const pts = []
  for (const e of els) { const ps = pins(e); ps.forEach((q, k) => pts.push({ x: q.x, y: q.y, id: e.id, side: k })) }
  const parent = pts.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const unions = new Map()   // junction id → 其中心点索引
  for (let i = 0; i < pts.length; i++) {
    const owner = els.find(e => e.id === pts[i].id)
    if (owner?.type === 'junction') unions.set(owner.id, i)
  }
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < tol) parent[find(i)] = find(j)
  // 接点吸力：任何端子在接点 20px 内 → 并入接点所在节点
  for (const [, ji] of unions) {
    const jx = pts[ji].x, jy = pts[ji].y
    for (let i = 0; i < pts.length; i++) {
      if (i === ji) continue
      if (Math.hypot(pts[i].x - jx, pts[i].y - jy) < 20) parent[find(i)] = find(ji)
    }
  }
  // 接点压在导线/元件线段上（含中段）→ 视为接入该线：
  // 理想导体（wire/junction）整段同节点，两端端子都并入；含阻元件并到较近端子（等效搭在引脚上）
  const CONDUCTORS = new Set(['wire', 'junction'])
  for (const [, ji] of unions) {
    const jx = pts[ji].x, jy = pts[ji].y
    for (const e of els) {
      if (e.id === pts[ji].id) continue
      const ps = pins(e)
      if (ps.length !== 2) continue
      const dx = ps[1].x - ps[0].x, dy = ps[1].y - ps[0].y
      const L2 = dx * dx + dy * dy
      if (L2 < 1) continue
      let t = ((jx - ps[0].x) * dx + (jy - ps[0].y) * dy) / L2
      t = Math.max(0, Math.min(1, t))
      const px = ps[0].x + t * dx, py = ps[0].y + t * dy
      if (Math.hypot(jx - px, jy - py) >= 20) continue
      if (CONDUCTORS.has(e.type)) {
        for (let k = 0; k < pts.length; k++) if (pts[k].id === e.id) parent[find(k)] = find(ji)
      } else {
        const near = t < 0.5 ? 0 : 1
        for (let k = 0; k < pts.length; k++) if (pts[k].id === e.id && pts[k].side === near) parent[find(k)] = find(ji)
      }
    }
  }
  const map = new Map()
  const nodeOf = pts.map((_, i) => {
    const r = find(i)
    if (!map.has(r)) map.set(r, map.size)
    return map.get(r)
  })
  return { pts, nodeOf, count: map.size }
}

let lastKey = '', lastResult = null

export function solve(objs) {
  const els = objs.filter((o) => CIRCUIT_TYPES.includes(o.type))
  if (!els.length) return null
  const key = els.map((e) => e.id + ':' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ':' + (e.props.angle ?? 0) + ':' +
    (e.type === 'battery' ? e.props.E + '/' + e.props.r : e.type === 'switch' ? String(e.props.closed) : (e.props.R ?? '')) + ':' + (e.props.len ?? 90)).join('|')
  if (key === lastKey) return lastResult

  const { pts, nodeOf, count } = clusterNodes(els)
  const N = Math.max(1, count)
  const G = Array.from({ length: N }, () => new Float64Array(N))
  const I = new Float64Array(N)
  const idx = new Map()
  els.forEach((e, k) => { idx.set(e.id, { a: nodeOf[2 * k], b: nodeOf[2 * k + 1] }) })

  for (const e of els) {
    const { a, b: nb } = idx.get(e.id)
    if (a === nb) continue
    if (e.type === 'battery') {
      const r = Math.max(0.01, e.props.r ?? 0.5)
      const g = 1 / r
      G[a][a] += g; G[nb][nb] += g; G[a][nb] -= g; G[nb][a] -= g
      const E = e.props.E ?? 3
      I[nb] += E * g; I[a] -= E * g
    } else {
      const g = 1 / resistance(e)
      G[a][a] += g; G[nb][nb] += g; G[a][nb] -= g; G[nb][a] -= g
    }
  }
  // 防悬空：每个节点对地 1e-9 S
  for (let i = 0; i < N; i++) G[i][i] += 1e-9

  // 接地 + 高斯消元
  const M = G.map((row, i) => Float64Array.from([...row, I[i]]))
  M[0] = Float64Array.from([...new Float64Array(N).fill(0), 0])
  M[0][0] = 1
  for (let c = 0; c < N; c++) {
    let piv = c
    for (let r = c + 1; r < N; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-14) continue
    if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t }
    for (let r = 0; r < N; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      if (!f) continue
      for (let k = c; k <= N; k++) M[r][k] -= f * M[c][k]
    }
  }
  const V = new Float64Array(N)
  for (let i = 0; i < N; i++) V[i] = Math.abs(M[i][i]) > 1e-14 ? M[i][N] / M[i][i] : 0

  const currents = new Map()
  for (const e of els) {
    const { a, b: nb } = idx.get(e.id)
    if (e.type === 'battery') currents.set(e.id, (V[a] - V[nb] + (e.props.E ?? 3)) / Math.max(0.01, e.props.r ?? 0.5))
    else currents.set(e.id, (V[a] - V[nb]) / resistance(e))
  }
  // 功率与状态判断
  const power = new Map()
  let totalPower = 0, sourcePower = 0, maxI = 0
  const warnings = []
  for (const e of els) {
    const i = currents.get(e.id)
    if (e.type === 'battery') {
      const E = e.props.E ?? 3
      sourcePower += E * i
      if (Math.abs(i) > 0.75 * (E / Math.max(0.01, e.props.r ?? 0.5))) warnings.push({ kind: 'short', text: '电流接近 ε/r，疑似短路' })
    } else {
      const R = resistance(e)
      const p = i * i * R
      power.set(e.id, p)
      if (!['wire', 'ammeter', 'voltmeter'].includes(e.type)) totalPower += p
    }
    maxI = Math.max(maxI, Math.abs(i))
  }
  const open = els.filter((e) => !['battery', 'switch'].includes(e.type) && Math.abs(currents.get(e.id)) < 1e-6)
  if (maxI < 1e-6 && els.some((e) => e.type === 'battery')) warnings.push({ kind: 'open', text: '电路未闭合（开关断开或无回路）' })
  else if (open.length) warnings.push({ kind: 'open', text: open.length + ' 个元件无电流（断路）' })

  lastKey = key
  lastResult = { V, currents, power, nodeOf: idx, nodeCount: N, totalPower, sourcePower, warnings }
  return lastResult
}

// 放置时吸附到最近的空闲端子
export function snapToPin(x, y, objs, maxDist = 26) {
  let best = null, bd = maxDist
  for (const o of objs) {
    if (!CIRCUIT_TYPES.includes(o.type)) continue
    for (const q of pins(o)) {
      const d = Math.hypot(q.x - x, q.y - y)
      if (d < bd) { bd = d; best = q }
    }
  }
  return best
}

// 新元件放置：若附近有端子，则让新元件的一个端子落在该点上
// 接点拖动吸附：优先吸到附近端子（26px），否则吸到导线/元件线段上的投影点（含中段，20px）
export function snapJunction(x, y, objs, maxDist = 26) {
  const pin = snapToPin(x, y, objs, maxDist)
  if (pin) return { x: pin.x, y: pin.y }
  let best = null, bd = 20
  for (const o of objs) {
    if (!CIRCUIT_TYPES.includes(o.type)) continue
    const ps = pins(o)
    if (ps.length !== 2) continue
    const dx = ps[1].x - ps[0].x, dy = ps[1].y - ps[0].y
    const L2 = dx * dx + dy * dy
    if (L2 < 1) continue
    let t = ((x - ps[0].x) * dx + (y - ps[0].y) * dy) / L2
    t = Math.max(0, Math.min(1, t))
    const px = ps[0].x + t * dx, py = ps[0].y + t * dy
    const d = Math.hypot(x - px, y - py)
    if (d < bd) { bd = d; best = { x: px, y: py } }
  }
  return best
}

export function placeCircuit(x, y, len, angle, objs) {
  const snap = snapToPin(x, y, objs)
  if (!snap) return { x, y }
  const a = (angle * Math.PI) / 180
  const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2
  const c1 = { x: snap.x - dx, y: snap.y - dy }
  const c2 = { x: snap.x + dx, y: snap.y + dy }
  return Math.hypot(c1.x - x, c1.y - y) <= Math.hypot(c2.x - x, c2.y - y) ? c1 : c2
}
