import { useEffect, useRef } from 'react'

// v-t 图与实时数据：跟随选中的动态刚体采样
const MAX = 240

export default function DataPanel({ body, time, running }) {
  const cvRef = useRef(null)
  const dataRef = useRef([])
  const lastRef = useRef(-1)

  useEffect(() => { dataRef.current = []; lastRef.current = -1 }, [body])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth, h = cv.clientHeight
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr }

    const v = body ? Math.hypot(body.velocity.x, body.velocity.y) * 0.6 : 0
    const d = dataRef.current
    // 重置后 time 会回退到 0：此时旧样本的 t 都大于当前时间，曲线会画到画布外 / 出现折返，
    // 因此时间一旦倒退就清空历史重新采样
    if (time < lastRef.current) { d.length = 0; lastRef.current = -1 }
    if (running && body && Math.abs(time - lastRef.current) > 0.04) {
      lastRef.current = time
      d.push({ t: time, v })
      if (d.length > MAX) d.shift()
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const pad = { l: 26, r: 6, t: 8, b: 14 }
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
    ctx.fillStyle = 'rgba(255,255,255,.02)'
    ctx.fillRect(pad.l, pad.t, iw, ih)
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ih); ctx.lineTo(pad.l + iw, pad.t + ih); ctx.stroke()

    const vmax = Math.max(0.5, ...d.map(p => p.v))
    const t0 = d.length ? d[0].t : 0
    const t1 = Math.max(t0 + 1, time)
    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * iw
    const Y = (val) => pad.t + ih - (val / (vmax * 1.15)) * ih

    // vmax 标注
    ctx.fillStyle = 'rgba(255,255,255,.45)'
    ctx.font = '9px system-ui'
    ctx.fillText(vmax.toFixed(1), 2, pad.t + 8)

    if (d.length > 1) {
      ctx.strokeStyle = '#5ad1a5'; ctx.lineWidth = 1.6; ctx.beginPath()
      d.forEach((p, i) => { const x = X(p.t), y = Y(p.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
      ctx.stroke()
      const last = d[d.length - 1]
      ctx.fillStyle = '#5ad1a5'
      ctx.beginPath(); ctx.arc(X(last.t), Y(last.v), 2.5, 0, 7); ctx.fill()
    }

    ctx.fillStyle = 'rgba(255,255,255,.5)'
    ctx.fillText('v / (m·s⁻¹)', pad.l + 4, pad.t + 9)
    ctx.fillText('t / s', w - 26, h - 2)
  })

  const d = dataRef.current
  const cur = body ? Math.hypot(body.velocity.x, body.velocity.y) * 0.6 : 0
  let a = 0
  if (d.length > 2) {
    const p1 = d[d.length - 1], p2 = d[d.length - 2]
    if (p1.t - p2.t > 0.02) a = (p1.v - p2.v) / (p1.t - p2.t)
  }

  return (
    <div className="datapanel">
      <div className="dp-head">
        <strong>{body ? 'v-t 图' : '选中一个物体查看 v-t 图'}</strong>
        {body && <span className="dp-read">v {cur.toFixed(2)} m/s · a≈{a.toFixed(2)} m/s²</span>}
      </div>
      <canvas ref={cvRef} />
    </div>
  )
}
