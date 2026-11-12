import { analyzeForces } from '../sim/analysis.js'
// 力/速度矢量叠加层：在画布上为选中或全部动态刚体画 v、F
import { drawArrow } from '../sim/registry.js'

export function drawVectors(ctx, objs, opts) {
  if (!opts.showVectors) return
  for (const o of objs) {
    if (!o.body) continue
    const b = o.body
    const sp = Math.hypot(b.velocity.x, b.velocity.y)
    if (sp > 0.05) {
      const s = Math.min(60, sp * 6)
      drawArrow(ctx, b.position,
        { x: b.position.x + b.velocity.x / sp * s, y: b.position.y + b.velocity.y / sp * s },
        '#38bdf8')
    }
    // 合力（matter 内部 force 每步清零，这里显示恒力元件近似，后续完善）
  }
}
// 受力分析：在选中物体上画 G / N / f / F / 合力，斜面附重力分解虚线
export function drawForceAnalysis(ctx, o, objs) {
  const list = analyzeForces(o, objs)
  if (!list) return
  const { origin, scale } = list
  ctx.save()
  ctx.lineWidth = 2
  // 重力分解（虚线）
  if (list.decompose) {
    const { a, along, perp, textAlong, textPerp } = list.decompose
    const d = { x: Math.cos(a), y: Math.sin(a) }
    const n = { x: Math.sin(a), y: -Math.cos(a) }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,159,67,.55)'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(origin.x + d.x * along * scale, origin.y + d.y * along * scale); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(origin.x - n.x * perp * scale, origin.y - n.y * perp * scale); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,199,120,.9)'; ctx.font = '10px sans-serif'
    ctx.fillText(textAlong, origin.x + d.x * along * scale * 0.7 + 4, origin.y + d.y * along * scale * 0.7)
    ctx.fillText(textPerp, origin.x - n.x * perp * scale * 0.7 + 4, origin.y - n.y * perp * scale * 0.7)
  }
  for (const v of list) {
    const mag = Math.hypot(v.vec.x, v.vec.y)
    if (mag < 0.3) continue
    const to = { x: origin.x + v.vec.x * scale, y: origin.y + v.vec.y * scale }
    ctx.strokeStyle = v.color; ctx.fillStyle = v.color
    ctx.lineWidth = v.isNet ? 3 : 2
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(to.x, to.y); ctx.stroke()
    const ang = Math.atan2(to.y - origin.y, to.x - origin.x)
    const hs = v.isNet ? 12 : 9
    ctx.beginPath(); ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - hs * Math.cos(ang - 0.4), to.y - hs * Math.sin(ang - 0.4))
    ctx.lineTo(to.x - hs * Math.cos(ang + 0.4), to.y - hs * Math.sin(ang + 0.4))
    ctx.closePath(); ctx.fill()
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(v.label, to.x + 4 * Math.cos(ang), to.y + 4 * Math.sin(ang))
  }
  // 公式摘要（右侧竖排）
  const lines = list.filter(v => v.text).map(v => v.text)
  if (lines.length) {
    ctx.font = '10px sans-serif'
    const wmax = Math.max(...lines.map(s => ctx.measureText(s).width))
    const bx = origin.x + 52, by = origin.y - 22 - lines.length * 13
    ctx.fillStyle = 'rgba(20,24,32,.62)'
    ctx.fillRect(bx - 4, by - 10, wmax + 8, lines.length * 13 + 6)
    ctx.fillStyle = 'rgba(226,232,240,.9)'
    lines.forEach((s, i) => ctx.fillText(s, bx, by + i * 13))
  }
  ctx.restore(); ctx.lineWidth = 1
}
