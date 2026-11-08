// 直流电路：端子-节点 + 节点电压法（Norton 等效，无理想电压源奇异问题）
// 约定：端子 a 为 −，b 为 +（电池），电流正方向 a→b
export const CIRCUIT_TYPES = [
  'junction','battery', 'resistor', 'bulb', 'rheostat', 'switch', 'ammeter', 'voltmeter', 'wire', 'solenoid']

export function pins(o) {
  if (o.type === 'junction') return [{ x: o.x, y: o.y }, { x: o.x, y: o.y }]   // 接点：两端重合于圆心
  const len = o.props.len ?? 90
  const a = ((o.props.angle ?? 0) * Math.PI) / 180
  const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2
  return [{ x: o.x - dx, y: o.y - dy }, { x: o.x + dx, y: o.y + dy }]
}

// 电气连接点：并联态（props._par）时是延展引线末端的 A1A2，否则就是自身端子
export function connPins(o) {
  const par = o.props?._par
  if (par && par.a1 && par.a2) return [{ x: par.a1.x, y: par.a1.y }, { x: par.a2.x, y: par.a2.y }]
  return pins(o)
}

export function resistance(o) {
  const p = o.props ?? o   // 兼容 Inspector 传入的扁平 {type,...props} 对象
  switch (o.type) {
    case 'wire': return 1e-3
    case 'junction': return 1e-3
    case 'solenoid': return Math.max(0.1, p.R ?? 2)
    case 'ammeter': return 1e-2
    case 'voltmeter': return 1e6
    case 'switch': return p.closed ? 5e-3 : 1e12
    case 'rheostat': return Math.max(0.01, p.R ?? 10)
    case 'resistor': return Math.max(0.01, p.R ?? 10)
    case 'bulb': return Math.max(0.5, p.R ?? 10)
    default: return null
  }
}

// ——— 并联对齐 ———
// 给「待放置/待拖动」的元件 B 找一对既有连接点 A1A2：长度相近、角度平行、位置贴近。
// 满足则元件对齐到 A1A2（端点自动接上），称为并联态。
export function findParallel(x, y, len, angle, objs, opts = {}) {
  const maxLenDiff = opts.maxLenDiff ?? Math.max(30, len * 0.4)
  const maxAngDiff = opts.maxAngDiff ?? 14          // 度
  const maxDist = opts.maxDist ?? 150               // 元件中心到 A1A2 线段的垂直距离
  const maxEndOff = opts.maxEndOff ?? 0.45          // 元件中心偏离 A1A2 中点的比例上限

  // 候选连接点：所有电路元件的端子 + 接点中心
  const pts = []
  for (const o of objs) {
    if (!CIRCUIT_TYPES.includes(o.type)) continue
    const ps = pins(o)
    pts.push({ x: ps[0].x, y: ps[0].y, o }, { x: ps[1].x, y: ps[1].y, o })
  }
  let best = null, bestScore = Infinity
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const A = pts[i], B = pts[j]
      if (A.o === B.o && A.o.type !== 'junction') continue      // 同一元件的两端不算
      const dx = B.x - A.x, dy = B.y - A.y
      const d = Math.hypot(dx, dy)
      if (d < 12) continue
      const dLen = Math.abs(d - len)
      // 等长约束按「配对自身长度」放宽（0.6·d）：短元件跨接到长节点对上时自动拉伸对齐
      const tolLen = Math.max(40, maxLenDiff, d * 0.6)
      if (dLen > tolLen) continue
      const angA = (Math.atan2(dy, dx) * 180) / Math.PI
      let dAng = Math.abs(((angA - angle) % 180 + 180) % 180)   // 角差取 [0,180)
      if (dAng > 90) dAng = 180 - dAng                          // π+θ 与 θ 等价
      if (dAng > maxAngDiff) continue
      const ux = dx / d, uy = dy / d
      const rx = x - A.x, ry = y - A.y
      const t = rx * ux + ry * uy                               // 沿 A1A2 的投影
      const perp = Math.abs(rx * uy - ry * ux)                   // 垂直距离
      if (perp > maxDist) continue
      if (Math.abs(t - d / 2) > Math.max(maxEndOff * d, 60)) continue
      const score = dLen + perp + Math.abs(t - d / 2) * 0.5
      if (score < bestScore) {
        // 中心沿轴归位到 A1A2 中点，保留垂直偏移 → 两条引线等长且垂直
        const nx = -uy, ny = ux
        const sgn = (rx * nx + ry * ny) >= 0 ? 1 : -1
        bestScore = score
        best = {
          a1: { x: A.x, y: A.y }, a2: { x: B.x, y: B.y },
          cx: A.x + ux * (d / 2) + nx * perp * sgn,
          cy: A.y + uy * (d / 2) + ny * perp * sgn,
          len: d, angle: angA, perp: perp * sgn
        }
      }
    }
  }
  return best
}

// 端子聚类成节点（容差 tol 像素）
function clusterNodes(els, tol = 12) {
  const pts = []
  for (const e of els) { const ps = connPins(e); ps.forEach((q, k) => pts.push({ x: q.x, y: q.y, id: e.id, side: k })) }
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
      const ps = connPins(e)
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

// 并联自动成形：新放置的线段元件若与两个既有节点近似「正交搭接」
// （元件两端分别在两节点的外侧、且与节点连线大致垂直、距离不远），自动改为 U 形三段并联。
// 返回 { x, y, angle } 或 null（不适用）。
export function autoParallel(x, y, len, angle, objs, opts = {}) {
  return null // 旧版启发式已废弃，改由 findParallel + 预览态实现

  const allowWires = !!opts.allowWires   // 只有 wire 允许自动生成引线
  const autoGrow = !!opts.autoGrow       // 只有 wire 允许自动加长
  const a = (angle * Math.PI) / 180
  const ux = Math.cos(a), uy = Math.sin(a)
  // 元件两端
  const e1 = { x: x - ux * len / 2, y: y - uy * len / 2 }
  const e2 = { x: x + ux * len / 2, y: y + uy * len / 2 }
  // 收集所有电路端子
  const pinsAll = []
  for (const o of objs) {
    if (!CIRCUIT_TYPES.includes(o.type)) continue
    pins(o).forEach(q => pinsAll.push(q))
  }
  // 对每对端子（视为节点）：元件轴大致垂直于节点连线，两端分别在连线两侧外
  let best = null, bestScore = Infinity
  for (let i = 0; i < pinsAll.length; i++) {
    for (let j = i + 1; j < pinsAll.length; j++) {
      const n1 = pinsAll[i], n2 = pinsAll[j]
      const dx = n2.x - n1.x, dy = n2.y - n1.y
      const d = Math.hypot(dx, dy)
      if (d < 24 || d > maxGap) continue
      // 节点连线方向的单位向量
      const nx = dx / d, ny = dy / d
      // 元件轴与节点连线夹角接近 90°？
      const dot = Math.abs(ux * nx + uy * ny)
      if (dot > 0.3) continue   // 允许 72°~90°
      // 两端投影：要求元件两端分别越过 n1、n2（在连线方向上覆盖它们）
      const t1 = (e1.x - n1.x) * nx + (e1.y - n1.y) * ny
      const t2 = (e2.x - n1.x) * nx + (e2.y - n1.y) * ny
      const tmin = Math.min(t1, t2), tmax = Math.max(t1, t2)
      // 覆盖 [0, d]，且略超出（外侧 ≥12px 以便 U 形引线有落脚点）
      // 元件轴心到节点连线的垂直距离（沿线方向上的投影偏差不算）
      const cross = ((x - n1.x) * ny - (y - n1.y) * nx)
      const off = Math.abs(cross)
      if (off > 200) continue
      // 轴心沿线位置大致居中于节点对（允许偏 40%）
      const tmid = (t1 + t2) / 2
      if (Math.abs(tmid - d / 2) > Math.max(60, d * 0.45)) continue
      // 非 wire：必须元件两端本身就贴近两个节点（贴合式并联），不加长不生引线
      if (!allowWires) {
        const cover = Math.min(t1, t2) <= 6 && Math.max(t1, t2) >= d - 6
        if (!cover) continue
      }
      const score = off + Math.abs(tmid - d / 2)
      if (score < bestScore) {
        bestScore = score
        best = { n1, n2, nx, ny, d, t1, t2 }
      }
    }
  }
  if (!best) return null
  // U 形：保持元件中心与角度不变即可——两端已在节点外侧，
  // 由 clusterNodes 的「线段中段吸附」把节点并进元件两端的引脚延伸。
  // 但端子未精确落在节点上 → 直接平移元件使两端引脚落点尽量贴近节点延长线：
  // 计算元件轴与节点连线中点的垂足，把元件中心对齐到中点法向偏移保持不变
  const mx = (best.n1.x + best.n2.x) / 2, my = (best.n1.y + best.n2.y) / 2
  // 元件中心对齐节点对中点（垂直方向保留用户给的偏移）
  const along = (x - mx) * best.nx + (y - my) * best.ny
  // 自动加长：覆盖两节点并各留 24px 引脚落脚
  const newLen = autoGrow ? Math.max(len, best.d + 48) : len
  // 两根正交引线：从节点连到导线端子（仅 wire）
  let wires
  if (allowWires) {
    const half = newLen / 2
    const cx2 = x - along * best.nx, cy2 = y - along * best.ny
    const pe1 = { x: cx2 - ux * half, y: cy2 - uy * half }
    const pe2 = { x: cx2 + ux * half, y: cy2 + uy * half }
    const mkWire = (n, e) => {
      const wlen = Math.hypot(e.x - n.x, e.y - n.y)
      const wang = Math.atan2(e.y - n.y, e.x - n.x) * 180 / Math.PI
      return { x: (n.x + e.x) / 2, y: (n.y + e.y) / 2, angle: wang, len: wlen }
    }
    wires = [mkWire(best.n1, pe1), mkWire(best.n2, pe2)]
  }
  return { x: x - along * best.nx, y: y - along * best.ny, angle, len: newLen, parallel: true, wires }
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
