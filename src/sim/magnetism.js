// 磁场合成：小磁针用。只算纸面内的场（磁铁双磁荷 + 通电螺线管等效磁偶极）。
// uniformB 的 bz 垂直屏幕，对小磁针（水平面内偏转）无贡献。
export function fieldAt(x, y, components) {
  let bx = 0, by = 0
  for (const o of components) {
    if (o.type === 'magnet') {
      const len = o.props.len ?? 120, a = ((o.props.angle ?? 0) * Math.PI) / 180
      const s = o.props.strength ?? 5
      const ux = Math.cos(a), uy = Math.sin(a)
      const poles = [
        { x: o.x + ux * len / 2, y: o.y + uy * len / 2, s: 1 },
        { x: o.x - ux * len / 2, y: o.y - uy * len / 2, s: -1 },
      ]
      for (const p of poles) {
        const dx = x - p.x, dy = y - p.y
        const d2 = Math.max(dx * dx + dy * dy, 100)
        const d = Math.sqrt(d2)
        const f = p.s * s / d2
        bx += dx / d * f; by += dy / d * f
      }
    } else if (o.type === 'solenoid') {
      // 通电螺线管 ≈ 磁偶极：轴向外场、远场同磁铁。等效为两磁荷，强度∝I*n
      const on = (o.props.I ?? 2) !== 0
      if (!on) continue
      const len = o.props.len ?? 160, a = ((o.props.angle ?? 0) * Math.PI) / 180
      // 接入电路时 _I 为解算电流（含方向），否则用面板 I
      const I = o.props._I ?? (o.props.I ?? 2)
      const s = I * (o.props.n ?? 8) * 0.4 * (o.props.hel ?? 1)
      const ux = Math.cos(a), uy = Math.sin(a)
      const poles = [
        { x: o.x + ux * len / 2, y: o.y + uy * len / 2, s: 1 },
        { x: o.x - ux * len / 2, y: o.y - uy * len / 2, s: -1 },
      ]
      for (const p of poles) {
        const dx = x - p.x, dy = y - p.y
        const d2 = Math.max(dx * dx + dy * dy, 100)
        const d = Math.sqrt(d2)
        const f = p.s * s / d2
        bx += dx / d * f; by += dy / d * f
      }
    }
  }
  return { bx, by, mag: Math.hypot(bx, by) }
}
