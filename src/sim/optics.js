// 几何光学：光线追迹（平面镜反射、薄透镜偏折、光屏吸收）
// 坐标：屏幕像素，y 向下；角度单位为度，0° 指向 +x
const DEG = Math.PI / 180
const EPS = 0.5

export function buildSegments(objs) {
  const segs = []
  for (const o of objs) {
    if (!['mirror', 'lens', 'screen'].includes(o.type)) continue
    const L = o.props.len ?? 140
    const a = (o.props.angle ?? 0) * DEG
    const dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2
    segs.push({
      obj: o, kind: o.type, props: o.props,
      a: { x: o.x - dx, y: o.y - dy },
      b: { x: o.x + dx, y: o.y + dy },
    })
  }
  return segs
}

// 线段求交：返回 t（射线参数）、u（线段参数）、交点
export function raySeg(p, d, a, b) {
  const rx = b.x - a.x, ry = b.y - a.y
  const den = d.x * ry - d.y * rx
  if (Math.abs(den) < 1e-9) return null
  const t = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den
  const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den
  if (t <= EPS || u < 0 || u > 1) return null
  return { t, u, x: p.x + d.x * t, y: p.y + d.y * t }
}

export function traceRays(objs, maxBounce = 6) {
  const segs = buildSegments(objs)
  const out = []
  const sources = objs.filter(o => o.type === 'lightSource')
  for (const src of sources) {
    const n = Math.max(1, Math.round(src.props.rays ?? 12))
    const center = (src.props.angle ?? 0) * DEG
    const spread = (src.props.spread ?? 60) * DEG
    for (let i = 0; i < n; i++) {
      const ang = n === 1 ? center : center - spread / 2 + (spread * i) / (n - 1)
      let p = { x: src.x, y: src.y }
      let d = { x: Math.cos(ang), y: Math.sin(ang) }
      const pts = [p]
      for (let bounce = 0; bounce <= maxBounce; bounce++) {
        let best = null
        for (const s of segs) {
          const hit = raySeg(p, d, s.a, s.b)
          if (hit && (!best || hit.t < best.t)) best = { ...hit, s }
        }
        if (!best) {
          // 射向无穷远：画一段有限长度
          pts.push({ x: p.x + d.x * 900, y: p.y + d.y * 900 })
          break
        }
        p = { x: best.x, y: best.y }
        pts.push(p)
        const s = best.s
        if (s.kind === 'screen' || s.kind === 'mirror') {
          if (s.kind === 'mirror') {
            const nx = s.b.y - s.a.y, ny = -(s.b.x - s.a.x)
            const nl = Math.hypot(nx, ny) || 1
            const n = { x: nx / nl, y: ny / nl }
            const dot = d.x * n.x + d.y * n.y
            d = { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y }
            p = { x: p.x + d.x * EPS * 2, y: p.y + d.y * EPS * 2 }
          } else break
        } else if (s.kind === 'lens') {
          const f = s.props.f ?? 120
          const ax = s.b.x - s.a.x, ay = s.b.y - s.a.y
          const tl = Math.hypot(ax, ay) || 1
          const t = { x: ax / tl, y: ay / tl }               // 透镜平面方向
          const axis = { x: -t.y, y: t.x }                    // 光轴方向
          const off = (p.x - s.obj.x) * t.x + (p.y - s.obj.y) * t.y
          const da = d.x * axis.x + d.y * axis.y
          const dt = d.x * t.x + d.y * t.y
          // 薄透镜：斜率沿透镜方向减少 off/f
          const dt2 = dt - off / f
          let nd = { x: axis.x * da + t.x * dt2, y: axis.y * da + t.y * dt2 }
          const nl = Math.hypot(nd.x, nd.y) || 1
          nd = { x: nd.x / nl, y: nd.y / nl }
          d = nd
          p = { x: p.x + d.x * EPS * 2, y: p.y + d.y * EPS * 2 }
        }
      }
      out.push({ pts, color: src.props.color || '#ffd166' })
    }
  }
  return out
}
