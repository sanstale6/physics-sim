import Matter from 'matter-js'
import { solve, pins } from './circuit.js'
import { fieldAt } from './magnetism.js'
import { capacitance } from './engine.js'

// 叠加层线宽随相机缩放：SimCanvas 每帧调用 setLineScale(view.scale)
export let LW = 1
export function setLineScale(s) { LW = 1 / (s || 1) }
// 元件注册表：新增元件只需在此登记
// fields: 属性面板自动生成用
export const registry = {
  block: {
    name: '物块',
    defaults: () => ({ m: 1, mu: 0.2, rest: 0.2, v0x: 0, v0y: 0 }),
    fields: [
      { key: 'm', label: '质量', unit: 'kg', min: 0.1, max: 10, step: 0.1 },
      { key: 'mu', label: '摩擦系数 μ', min: 0, max: 1, step: 0.05 },
      { key: 'rest', label: '碰撞弹性', unit: '', min: 0, max: 1, step: 0.1 },
      { key: 'v0x', label: '初速度 vx', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'v0y', label: '初速度 vy（向上为正）', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'q', label: '带电量', unit: 'μC', min: -100, max: 100, step: 1 },
    ],
    body: (x, y, p) => ({ type: 'rectangle', w: 50, h: 30,
      options: { density: 0.001, friction: 0, frictionStatic: 0, restitution: p.rest ?? 0.2 }, label: 'block' }),
  },
  particle: {
    name: '质点',
    defaults: () => ({ m: 1, r: 7, v0x: 0, v0y: 0 }),
    fields: [
      { key: 'm', label: '质量', unit: 'kg', min: 0.1, max: 10, step: 0.1 },
      { key: 'r', label: '半径', unit: 'px', min: 3, max: 30, step: 1 },
      { key: 'v0x', label: '初速度 vx', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'v0y', label: '初速度 vy（向上为正）', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'q', label: '带电量', unit: 'μC', min: -100, max: 100, step: 1 },
    ],
    body: (x, y, p) => ({ type: 'circle', r: p.r, options: { density: 0.001, friction: 0 }, label: 'particle' }),
  },
  ball: {
    name: '小球',
    defaults: () => ({ m: 1, r: 20, rest: 0.8, v0x: 0, v0y: 0 }),
    fields: [
      { key: 'm', label: '质量', unit: 'kg', min: 0.1, max: 10, step: 0.1 },
      { key: 'r', label: '半径', unit: 'px', min: 8, max: 60, step: 1 },
      { key: 'rest', label: '弹性', unit: '', min: 0, max: 1, step: 0.1 },
      { key: 'v0x', label: '初速度 vx', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'v0y', label: '初速度 vy（向上为正）', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'q', label: '带电量', unit: 'μC', min: -100, max: 100, step: 1 },
    ],
    body: (x, y, p) => ({ type: 'circle', r: p.r,
      options: { density: 0.001, friction: 0, restitution: p.rest ?? 0.8 }, label: 'ball' }),
  },
  incline: {
    name: '斜面',
    defaults: () => ({ angle: 30, len: 320 }),
    fields: [
      { key: 'angle', label: '倾角 θ', unit: '°', min: 5, max: 75, step: 1 },
      { key: 'len', label: '斜面长度', unit: 'px', min: 120, max: 800, step: 10 },
    ],
    // 绘制为真题里的直角三角形（见 sim/incline.js），碰撞体是沿斜边放置的静态厚板：
    // fromVertices 依赖 poly-decomp，三顶点凸包不可靠会穿模；旋转矩形完全稳定。
    body: (x, y, p) => {
      const ang = ((p.angle ?? 30) * Math.PI) / 180
      return { type: 'rotRect', w: p.len ?? 320, h: 6, angle: ang,
        options: { isStatic: true, friction: 0 }, label: 'incline' }
    },
  },
  ground: {
    name: '地面',
    defaults: () => ({}),
    fields: [],
    body: (x, y) => ({ type: 'rectangle', w: 1200, h: 20,
      options: { isStatic: true, friction: 0 }, label: 'ground' }),
  },
  track: {
    name: '桌面/轨道',
    defaults: () => ({ len: 320 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 120, max: 900, step: 10 },
    ],
    body: (x, y, p) => ({ type: 'rectangle', w: p.len ?? 320, h: 14,
      options: { isStatic: true, friction: 0 }, label: 'track' }),
    overlay: (ctx, c) => {
      const { len } = c.props
      const x = c.x, y = c.y, w = len ?? 320
      ctx.save()
      ctx.strokeStyle = 'rgba(148,163,184,.55)'; ctx.lineWidth = 1 * LW
      ctx.beginPath()
      for (let i = -w / 2 + 10; i < w / 2; i += 16) {
        ctx.moveTo(x + i, y + 7)
        ctx.lineTo(x + i - 7, y + 16)
      }
      ctx.stroke()
      ctx.restore()
    },
  },
  pendulum: {
    name: '单摆',
    defaults: () => ({ len: 140 }),
    fields: [{ key: 'len', label: '摆长', unit: 'px', min: 40, max: 500, step: 10 }],
    body: null,
    overlay: (ctx, c, all) => {
      const L = c.props.len ?? 140
      const tgt = c._target != null ? all.find(o => o.id === c._target) : null
      ctx.save()
      if (tgt?.body) {
        ctx.strokeStyle = 'rgba(201,162,39,.9)'; ctx.lineWidth = 1 * LW; ctx.setLineDash([6, 4])
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tgt.body.position.x, tgt.body.position.y); ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = 'rgba(201,162,39,.5)'; ctx.setLineDash([4, 6])
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y + L); ctx.stroke(); ctx.setLineDash([])
        ctx.beginPath(); ctx.arc(c.x, c.y + L, 10, 0, 7); ctx.stroke()
      }
      // 悬点符号
      ctx.fillStyle = '#c9a227'
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, 7); ctx.fill()
      ctx.strokeStyle = 'rgba(201,162,39,.8)'
      ctx.beginPath(); ctx.moveTo(c.x - 9, c.y - 6); ctx.lineTo(c.x + 9, c.y - 6); ctx.stroke()
      ctx.fillStyle = 'rgba(219,230,245,.75)'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'
      const Tm = 2 * Math.PI * Math.sqrt(L / 100 / 9.8)
      ctx.fillText('L=' + (L / 100).toFixed(2) + 'm  T=' + Tm.toFixed(2) + 's', c.x, c.y + 16)
      ctx.restore()
    },
  },
  compass: {
    name: '小磁针',
    defaults: () => ({ len: 44 }),
    fields: [{ key: 'len', label: '长度', unit: 'px', min: 24, max: 80, step: 2 }],
    body: null,
    overlay: (ctx, c, all) => {
      const L = (c.props.len ?? 44) / 2
      let ang = c.angle ?? 0
      const f = fieldAt(c.x, c.y, all)
      if (f.mag > 1e-4) ang = Math.atan2(f.by, f.bx)
      c.angle = ang
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang)
      ctx.fillStyle = '#f87171'
      ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.45, -4); ctx.lineTo(-L * 0.45, 4); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#93c5fd'
      ctx.beginPath(); ctx.moveTo(-L * 0.45, -4); ctx.lineTo(-L, 0); ctx.lineTo(-L * 0.45, 4); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#f87171'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('N', L + 7, 3)
      ctx.restore()
      ctx.fillStyle = '#dbe6f5'
      ctx.beginPath(); ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2); ctx.fill()
    },
  },
  cyclotron: {
    name: '回旋加速器',
    defaults: () => ({ R: 160, U: 5, B: 0.5 }),
    fields: [
      { key: 'R', label: 'D 形盒半径', unit: 'px', min: 80, max: 300, step: 10 },
      { key: 'U', label: '加速电压 U', unit: 'V', min: 0.5, max: 20, step: 0.5 },
      { key: 'B', label: '磁场 B（垂直盒面）', unit: 'T', min: 0.1, max: 5, step: 0.1 },
    ],
    body: null,
    overlay: (ctx, c, all) => {
      const R = c.props.R ?? 160, gap = 14, U = c.props.U ?? 5, B = c.props.B ?? 0.5
      ctx.save()
      // 两个 D 形盒（上下留缝）
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2 * (1 / (c._lw || 1))
      ctx.lineWidth = 2; ctx.fillStyle = 'rgba(56,189,248,.08)'
      ctx.beginPath(); ctx.arc(c.x, c.y - gap / 2, R, Math.PI, 0, false); ctx.lineTo(c.x + R, c.y - gap / 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(c.x, c.y - gap / 2, R, Math.PI, 0); ctx.fill()
      ctx.beginPath(); ctx.arc(c.x, c.y + gap / 2, R, 0, Math.PI, false); ctx.lineTo(c.x - R, c.y + gap / 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(c.x, c.y + gap / 2, R, 0, Math.PI); ctx.fill()
      // 中缝加速电场箭头：交变电场每半个周期反向，按穿缝次数奇偶翻转（教学重点）
      const up = ((c._crossings ?? 0) % 2) === 0
      const y1 = up ? c.y + gap / 2 : c.y - gap / 2, y2 = up ? c.y - gap / 2 : c.y + gap / 2
      ctx.strokeStyle = '#ffd166'; ctx.fillStyle = '#ffd166'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(c.x, y1); ctx.lineTo(c.x, y2); ctx.stroke()
      const tipY = y2, baseY = up ? y2 + 9 : y2 - 9
      ctx.beginPath(); ctx.moveTo(c.x - 6, baseY); ctx.lineTo(c.x, tipY); ctx.lineTo(c.x + 6, baseY); ctx.fill()
      // 标注
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#9fb3c8'
      ctx.fillText('B = ' + B + 'T', c.x, c.y - R - 10)
      ctx.fillText('U = ' + U + 'V', c.x + R + 6, c.y + 3)
      if (c._crossings) ctx.fillText('已加速 ' + c._crossings + ' 次', c.x, c.y + R + 16)
      ctx.restore()
    },
  },
  solenoid: {
    name: '通电螺线管',
    defaults: () => ({ len: 160, angle: 0, I: 2, n: 8, hel: 1, R: 2 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 60, max: 400, step: 10 },
      { key: 'angle', label: '方向（N 朝）', unit: '°', min: 0, max: 330, step: 30 },
      { key: 'I', label: '电流 I（未接电路时）', unit: 'A', min: -10, max: 10, step: 0.5 },
      { key: 'n', label: '匝数密度', unit: '匝/cm', min: 1, max: 20, step: 1 },
      { key: 'hel', label: '螺旋方向（右手=1）', unit: '', min: -1, max: 1, step: 2 },
      { key: 'R', label: '线圈电阻', unit: 'Ω', min: 0.5, max: 50, step: 0.5 },
    ],
    body: null,
    overlay: (ctx, c, all) => {
      const len = c.props.len ?? 160, a = ((c.props.angle ?? 0) * Math.PI) / 180
      const hel = c.props.hel ?? 1
      // 接入电路 → 取解算电流（带方向）；否则用面板 I
      let I = c.props.I ?? 2
      if (all && all.some(o => o.type === 'battery')) {
        try {
          const res = solve(all)
          const cur = res.currents.get(c.id)
          if (cur != null) { c.props._I = cur; I = cur }
        } catch { /* 忽略 */ }
      }
      const on = Math.abs(I) > 0.01
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a)
      const L = len / 2
      // 引线：两端各画一小段水平线接入
      ctx.strokeStyle = on ? '#facc15' : '#64748b'
      ctx.lineWidth = 2 * LW
      ctx.beginPath(); ctx.moveTo(-L - 12, 0); ctx.lineTo(-L, 0); ctx.moveTo(L, 0); ctx.lineTo(L + 12, 0); ctx.stroke()
      // 线圈弧：hel=1 时弧朝上（右手螺旋 N 在轴向正方向），hel=-1 弧朝下
      const n = Math.max(6, Math.round(len / 14))
      for (let k = 0; k < n; k++) {
        const x = -L + (k + 0.5) * (len / n)
        ctx.beginPath()
        if (hel >= 0) ctx.arc(x, 0, 9, -Math.PI * 0.5, Math.PI * 0.5)
        else ctx.arc(x, 0, 9, Math.PI * 0.5, Math.PI * 1.5)
        ctx.stroke()
      }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#475569'; ctx.lineWidth = 1 * LW
      ctx.beginPath(); ctx.moveTo(-L - 14, 0); ctx.lineTo(L + 14, 0); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#f87171'; ctx.font = `${11 * LW}px sans-serif`; ctx.textAlign = 'center'
      if (on) ctx.fillText('N', L + 22, 4)
      if (on) { ctx.fillStyle = '#facc15'; ctx.fillText('I=' + Math.abs(I).toFixed(2) + 'A', 0, 22) }
      ctx.restore()
    },
  },
  metalRod: {
    name: '金属棒',
    defaults: () => ({ len: 200, R: 2, m: 0.5, angle: 90, v0x: 0, v0y: 0, g: 0 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 600, step: 10 },
      { key: 'R', label: '电阻', unit: 'Ω', min: 0.1, max: 50, step: 0.1 },
      { key: 'm', label: '质量', unit: 'kg', min: 0.1, max: 10, step: 0.1 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
      { key: 'v0x', label: '初速度 vx', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'g', label: '受重力（0=导轨上架空 1=受重力）', min: 0, max: 1, step: 1 },
    ],
    // 可运动导体：动态刚体（惯性取无穷，避免切割磁感线时被安培力矩转起来）
    body: (x, y, p) => ({ type: 'rotRect', w: p.len ?? 200, h: 12, angle: ((p.angle ?? 90) * Math.PI) / 180,
      options: { density: 0.001, friction: 0, frictionAir: 0, restitution: 0, inertia: Infinity }, label: 'metalRod' }),
    overlay: (ctx, c, all) => {
      const b = c.body
      const x = b ? b.position.x : c.x, y = b ? b.position.y : c.y
      const th = b ? b.angle : ((c.props.angle ?? 90) * Math.PI) / 180
      const len = c.props.len ?? 200
      ctx.save()
      ctx.translate(x, y); ctx.rotate(th)
      // 铜棒本体
      const grd = ctx.createLinearGradient(0, -6, 0, 6)
      grd.addColorStop(0, '#fcd34d'); grd.addColorStop(0.5, '#b45309'); grd.addColorStop(1, '#fbbf24')
      ctx.fillStyle = grd
      ctx.fillRect(-len / 2, -6, len, 12)
      ctx.strokeStyle = 'rgba(251,191,36,.95)'; ctx.lineWidth = 1.2 * LW
      ctx.strokeRect(-len / 2, -6, len, 12)
      ctx.restore()
      // 感应电动势 / 电流标注
      const res = solve(all)
      const I = res?.currents?.get(c.id) ?? 0
      const eps = c.props._eInst ?? 0
      if (Math.abs(eps) > 1e-3) {
        ctx.save()
        ctx.font = `${10 * LW}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(147,197,253,.95)'
        ctx.fillText(`ε=${eps.toFixed(2)}V`, x, y - 16 * LW)
        if (Math.abs(I) > 1e-4) {
          ctx.fillStyle = 'rgba(248,113,113,.95)'
          ctx.fillText(`I=${Math.abs(I).toFixed(2)}A`, x, y + 24 * LW)
        }
        ctx.restore()
      }
      ctx.lineWidth = 1 * LW
    },
  },
  conveyor: {
    name: '传送带',
    defaults: () => ({ len: 320, v: 2 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 120, max: 1200, step: 10 },
      { key: 'v', label: '带速（正=向右）', unit: 'm/s', min: -8, max: 8, step: 0.5 },
    ],
    body: (x, y, p) => ({ type: 'rectangle', w: p.len ?? 320, h: 16,
      options: { isStatic: true, friction: 0 }, label: 'conveyor' }),
    overlay: (ctx, c) => {
      const len = c.props.len ?? 320, v = c.props.v ?? 0
      const x = c.x, y = c.y, rr = 14, half = len / 2
      const l = x - half + rr, rt = x + half - rr
      const dir = Math.sign(v) || 1
      const t = performance.now() / 1000
      ctx.save()
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      // 支架腿先画（在带体后面）
      ctx.strokeStyle = 'rgba(139,148,158,.75)'; ctx.lineWidth = 1.3 * LW
      for (const lx of [x - half * 0.32, x + half * 0.32]) {
        ctx.beginPath(); ctx.moveTo(lx, y + rr); ctx.lineTo(lx, y + rr + 18)
        ctx.moveTo(lx - 8, y + rr + 18); ctx.lineTo(lx + 8, y + rr + 18); ctx.stroke()
      }
      // 皮带轮廓（上带面/下带面 + 两端半圆弧），带体加厚更醒目
      ctx.strokeStyle = 'rgba(219,230,245,.95)'; ctx.lineWidth = 1.6 * LW
      ctx.beginPath()
      ctx.moveTo(l, y - rr); ctx.lineTo(rt, y - rr)
      ctx.arc(rt, y, rr, -Math.PI / 2, Math.PI / 2)
      ctx.lineTo(l, y + rr)
      ctx.arc(l, y, rr, Math.PI / 2, Math.PI * 3 / 2)
      ctx.closePath(); ctx.stroke()
      ctx.fillStyle = 'rgba(56,189,248,.06)'; ctx.fill()
      // 滚筒：实心感（深填充+青描边）+ 4 辐条 + 轴点，转动相位随带速
      const ph = (t * v * 10) % (Math.PI * 2)
      for (const cx of [l, rt]) {
        ctx.beginPath(); ctx.arc(cx, y, rr - 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(7,11,18,.85)'; ctx.fill()
        ctx.strokeStyle = 'rgba(56,189,248,.95)'; ctx.lineWidth = 1.4 * LW; ctx.stroke()
        ctx.lineWidth = 1.1 * LW
        for (let k = 0; k < 4; k++) {
          const a2 = ph + (k * Math.PI) / 2
          ctx.beginPath(); ctx.moveTo(cx, y)
          ctx.lineTo(cx + Math.cos(a2) * (rr - 3), y + Math.sin(a2) * (rr - 3)); ctx.stroke()
        }
        ctx.beginPath(); ctx.arc(cx, y, 2.2, 0, 7); ctx.fillStyle = '#38bdf8'; ctx.fill()
      }
      // 带面花纹：短斜线沿运动方向流动
      ctx.strokeStyle = 'rgba(56,189,248,.65)'; ctx.lineWidth = 1 * LW
      const step = 22, span = rt - l
      const off = ((t * Math.abs(v) * 40) % step) * dir
      for (let d = off; Math.abs(d) < span; d += step * dir) {
        const sx = l + d
        if (sx < l || sx > rt) continue
        ctx.beginPath(); ctx.moveTo(sx, y - rr + 3); ctx.lineTo(sx + 6 * dir, y - rr + 6)
        ctx.moveTo(sx, y + rr - 3); ctx.lineTo(sx + 6 * dir, y + rr - 6); ctx.stroke()
      }
      // 速度箭头 + 标注
      const ax = x - 26 * dir, ay = y - rr - 18
      ctx.strokeStyle = 'rgba(250,204,21,.9)'; ctx.lineWidth = 1.5 * LW
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 46 * dir, ay)
      ctx.moveTo(ax + 46 * dir, ay); ctx.lineTo(ax + 38 * dir, ay - 4)
      ctx.moveTo(ax + 46 * dir, ay); ctx.lineTo(ax + 38 * dir, ay + 4); ctx.stroke()
      ctx.fillStyle = 'rgba(250,204,21,.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.font = `${12 * LW}px system-ui`
      ctx.fillText(`v = ${v.toFixed(1)} m/s`, x, ay - 6)
      ctx.restore()
    },
  },

  constantForce: {
    name: '恒力 F',
    defaults: () => ({ fx: 10, fy: 0 }),
    fields: [
      { key: 'fx', label: '水平分量 Fx', unit: 'N', min: -50, max: 50, step: 1 },
      { key: 'fy', label: '竖直分量 Fy', unit: 'N', min: -50, max: 50, step: 1 },
    ],
    body: null,
    overlay: (ctx, c, all) => {
      const { fx, fy } = c.props
      // 到受力物体的虚线（表示力作用在谁身上）
      const t = c._target != null ? all.find(o => o.id === c._target) : null
      if (t?.body) {
        ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,95,86,.45)'; ctx.lineWidth = 1 * LW
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(t.body.position.x, t.body.position.y); ctx.stroke(); ctx.restore()
      }
      const mag = Math.hypot(fx, fy) || 1
      const L = 26 + Math.min(46, mag * 1.6)
      drawArrow(ctx, { x: c.x, y: c.y }, { x: c.x + fx / mag * L, y: c.y - fy / mag * L }, '#ff5f56')
      ctx.fillStyle = '#ff8b84'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('F=' + mag.toFixed(0) + 'N', c.x, c.y + 20)
    },
  },
  charge: {
    name: '点电荷',
    defaults: () => ({ q: 1, m: 0.5, r: 10, v0x: 0, v0y: 0 }),
    fields: [
      { key: 'q', label: '电荷量 q', unit: 'μC', min: -20, max: 20, step: 0.5 },
      { key: 'm', label: '质量 m', unit: 'kg', min: 0.1, max: 10, step: 0.1 },
      { key: 'r', label: '半径', unit: 'px', min: 6, max: 40, step: 1 },
      { key: 'v0x', label: '初速度 vx', unit: 'm/s', min: -20, max: 20, step: 0.5 },
      { key: 'v0y', label: '初速度 vy（向上为正）', unit: 'm/s', min: -20, max: 20, step: 0.5 },
    ],
    // 带电粒子默认忽略重力（高中题：「不计重力」）；frictionAir 必须为 0，
    // 否则 Matter 默认 0.01 会让 B 圆周/速度选择器里的粒子能量持续泄漏（实测每步 -0.6%）
    body: (x, y, p) => ({ type: 'circle', r: p.r, options: { density: 0.001, friction: 0, frictionAir: 0, gravityScale: 0 }, label: 'charge' }),
  },
  uniformB: {
    name: '匀强磁场 B',
    defaults: () => ({ w: 240, h: 180, bz: 2 }),
    fields: [
      { key: 'w', label: '区域宽', unit: 'px', min: 80, max: 4000, step: 20 },
      { key: 'h', label: '区域高', unit: 'px', min: 80, max: 4000, step: 20 },
      { key: 'bz', label: '磁感应强度 B（+外/−内）', unit: 'T', min: -20, max: 20, step: 0.1 },
    ],
    body: null,
    overlay: (ctx, c, components) => {
      const { h, bz } = c.props
      const inf = c.props.w >= 3200
      const cw = ctx.canvas.width, ch = ctx.canvas.height
      const w = inf ? cw * 3 : c.props.w   // 无限场：按画布 3 倍宽，平移也看不到边
      const x = inf ? cw / 2 : c.x, y = inf ? ch / 2 : c.y
      ctx.save()
      ctx.strokeStyle = '#7ee787'; ctx.fillStyle = 'rgba(126,231,135,.07)'; ctx.lineWidth = 1.5 * LW
      ctx.fillRect(x - w/2, y - h/2, w, h); ctx.strokeRect(x - w/2, y - h/2, w, h)
      ctx.fillStyle = '#7ee787'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('B = ' + bz.toFixed(2) + ' T ' + (bz >= 0 ? '⊙ 垂直纸面向外' : '⊗ 垂直纸面向内'), x, y - h/2 - 8)
      ctx.globalAlpha = 0.5
      for (let gx = -w/2 + 20; gx < w/2; gx += 40)
        for (let gy = -h/2 + 20; gy < h/2; gy += 40) {
          ctx.beginPath()
          if (bz >= 0) { ctx.arc(x + gx, y + gy, 3.5, 0, 7); ctx.stroke() }
          else { ctx.arc(x + gx, y + gy, 5, 0, 7); ctx.moveTo(x + gx - 3.5, y + gy - 3.5); ctx.lineTo(x + gx + 3.5, y + gy + 3.5); ctx.moveTo(x + gx + 3.5, y + gy - 3.5); ctx.lineTo(x + gx - 3.5, y + gy + 3.5); ctx.stroke() }
        }
      // 区内带电粒子的回旋参数 r = mv/(qB)、T = 2πm/(qB)
      const B = Math.abs(bz)
      if (B > 0.01 && components) {
        for (const o of components) {
          if (!o.body || o.body.isStatic || o.type !== 'charge') continue
          const p = o.body.position
          if (Math.abs(p.x - x) > w / 2 || Math.abs(p.y - y) > h / 2) continue
          const q = Math.abs(o.props.q ?? 1) * 1e-6
          if (q < 1e-9) continue
          const v = Math.hypot(o.body.velocity.x, o.body.velocity.y) * 0.6
          const m = o.body.mass
          const rr = (m * v) / (q * B)
          const T = (2 * Math.PI * m) / (q * B)
          ctx.globalAlpha = 0.95
          ctx.fillStyle = '#7ee787'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'
          ctx.fillText('r = mv/qB = ' + rr.toFixed(2) + ' m   T = ' + T.toFixed(2) + ' s', x, y + h / 2 + 18)
          break
        }
      }
      ctx.restore()
    },
  },
  lightSource: {
    name: '光源',
    defaults: () => ({ rays: 12, spread: 60, angle: 0, color: '#ffd166' }),
    fields: [
      { key: 'rays', label: '光线条数', min: 1, max: 40, step: 1 },
      { key: 'spread', label: '发散角', unit: '°', min: 0, max: 360, step: 5 },
      { key: 'angle', label: '中心方向', unit: '°', min: -180, max: 180, step: 5 },
    ],
    body: null,
    overlay: (ctx, c) => {
      ctx.fillStyle = '#ffd166'
      ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, 7); ctx.fill()
      ctx.strokeStyle = 'rgba(255,209,102,.5)'; ctx.lineWidth = 1 * LW
      ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, 7); ctx.stroke(); ctx.lineWidth = 1 * LW
    },
  },
  mirror: {
    name: '平面镜',
    defaults: () => ({ len: 140, angle: 90 }),
    fields: [
      { key: 'len', label: '镜面长度', unit: 'px', min: 40, max: 400, step: 10 },
      { key: 'angle', label: '倾角', unit: '°', min: -180, max: 180, step: 5 },
    ],
    body: null,
    overlay: (ctx, c) => {
      const a = ((c.props.angle ?? 0) * Math.PI) / 180, L = c.props.len ?? 140
      const dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2
      ctx.strokeStyle = '#9ecbff'; ctx.lineWidth = 2 * LW
      ctx.beginPath(); ctx.moveTo(c.x - dx, c.y - dy); ctx.lineTo(c.x + dx, c.y + dy); ctx.stroke()
      // 背面斜线（表示反射面）
      const nx = Math.sin(a), ny = -Math.cos(a)
      ctx.strokeStyle = 'rgba(158,203,255,.5)'; ctx.lineWidth = 1 * LW
      for (let t = -L / 2 + 8; t < L / 2; t += 12) {
        const px = c.x + Math.cos(a) * t, py = c.y + Math.sin(a) * t
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nx * 7, py + ny * 7); ctx.stroke()
      }
      ctx.lineWidth = 1 * LW
    },
  },
  lens: {
    name: '凸透镜',
    defaults: () => ({ len: 140, f: 120, angle: 90 }),
    fields: [
      { key: 'len', label: '透镜高度', unit: 'px', min: 40, max: 400, step: 10 },
      { key: 'f', label: '焦距 f', unit: 'px', min: 30, max: 400, step: 10 },
      { key: 'angle', label: '摆放角', unit: '°', min: -180, max: 180, step: 5 },
    ],
    body: null,
    overlay: (ctx, c) => {
      const a = ((c.props.angle ?? 0) * Math.PI) / 180, L = c.props.len ?? 140
      const dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2
      const nx = Math.sin(a), ny = -Math.cos(a)
      ctx.strokeStyle = '#7ee787'; ctx.lineWidth = 2 * LW
      ctx.beginPath()
      ctx.moveTo(c.x - dx, c.y - dy)
      ctx.quadraticCurveTo(c.x + nx * 10, c.y + ny * 10, c.x + dx, c.y + dy)
      ctx.quadraticCurveTo(c.x - nx * 10, c.y - ny * 10, c.x - dx, c.y - dy)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(126,231,135,.35)'; ctx.lineWidth = 1 * LW
      ctx.beginPath(); ctx.moveTo(c.x - nx * 8, c.y - ny * 8); ctx.lineTo(c.x + nx * 8, c.y + ny * 8); ctx.stroke()
      ctx.fillStyle = '#7ee787'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('f=' + (c.props.f ?? 120), c.x + nx * 18, c.y + ny * 18)
      ctx.lineWidth = 1 * LW
    },
  },
  screen: {
    name: '光屏',
    defaults: () => ({ len: 160, angle: 90 }),
    fields: [
      { key: 'len', label: '屏幕长度', unit: 'px', min: 40, max: 400, step: 10 },
      { key: 'angle', label: '倾角', unit: '°', min: -180, max: 180, step: 5 },
    ],
    // 静态实体：带电粒子打上后钉住（感光记录），配合 engine.js 的感光钉住检测
    body: (x, y, p) => {
      const a = ((p.angle ?? 90) * Math.PI) / 180, L = p.len ?? 160
      const w = Math.abs(Math.cos(a)) * L, h = Math.abs(Math.sin(a)) * L
      return { type: 'rectangle', w: Math.max(w, 6), h: Math.max(h, 6),
        options: { isStatic: true, friction: 0 }, label: 'screen' }
    },
    overlay: (ctx, c) => {
      const a = ((c.props.angle ?? 0) * Math.PI) / 180, L = c.props.len ?? 160
      const dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2
      ctx.strokeStyle = '#c9d1d9'; ctx.lineWidth = 3 * LW
      ctx.beginPath(); ctx.moveTo(c.x - dx, c.y - dy); ctx.lineTo(c.x + dx, c.y + dy); ctx.stroke()
      ctx.lineWidth = 1 * LW
    },
  },
  junction: {
    name: '接点',
    defaults: () => ({ r: 6 }),
    fields: [{ key: 'r', label: '半径', unit: 'px', min: 4, max: 12, step: 1 }],
    body: null,
    overlay: (ctx, c) => {
      ctx.save()
      ctx.beginPath(); ctx.arc(c.x, c.y, c.props.r ?? 6, 0, Math.PI * 2)
      ctx.fillStyle = '#c9d1d9'; ctx.fill()
      ctx.strokeStyle = 'rgba(219,230,245,.9)'; ctx.lineWidth = 1.2 * LW; ctx.stroke()
      ctx.restore(); ctx.lineWidth = 1 * LW
    },
  },
  battery: {
    name: '电源',
    defaults: () => ({ E: 6, r: 0.5, len: 90, angle: 0, ac: 0, freq: 0.5 }),
    fields: [
      { key: 'E', label: '电动势 E', unit: 'V', min: 0.5, max: 24, step: 0.5 },
      { key: 'r', label: '内阻 r', unit: 'Ω', min: 0.05, max: 10, step: 0.05 },
      { key: 'ac', label: '交流（0=直流 1=交流）', unit: '', min: 0, max: 1, step: 1 },
      { key: 'freq', label: '交流频率 f', unit: 'Hz', min: 0.1, max: 5, step: 0.1 },
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  resistor: {
    name: '定值电阻',
    defaults: () => ({ R: 10, len: 90, angle: 0 }),
    fields: [
      { key: 'R', label: '阻值 R', unit: 'Ω', min: 0.5, max: 200, step: 0.5 },
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  rheostat: {
    name: '滑动变阻器',
    defaults: () => ({ R: 20, len: 110, angle: 0 }),
    fields: [
      { key: 'R', label: '接入阻值', unit: 'Ω', min: 0, max: 200, step: 1 },
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  bulb: {
    name: '小灯泡',
    defaults: () => ({ R: 12, len: 90, angle: 0 }),
    fields: [
      { key: 'R', label: '电阻 R', unit: 'Ω', min: 1, max: 100, step: 0.5 },
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  switch: {
    name: '开关',
    defaults: () => ({ closed: false, len: 80, angle: 0 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 200, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  ammeter: {
    name: '电流表',
    defaults: () => ({ len: 90, angle: 0 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  voltmeter: {
    name: '电压表',
    defaults: () => ({ len: 90, angle: 0 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  diode: {
    name: '二极管',
    defaults: () => ({ len: 90, angle: 0 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  multimeter: {
    name: '多用电表',
    defaults: () => ({ mode: 'A', len: 90, angle: 0 }),
    fields: [
      { key: 'mode', label: '档位', unit: '', min: 0, max: 0, step: 1, options: ['A（直流电流）', 'V（直流电压）', 'Ω（电阻）'] },
      { key: 'len', label: '长度', unit: 'px', min: 40, max: 300, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  wire: {
    name: '导线',
    defaults: () => ({ len: 90, angle: 0 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 20, max: 400, step: 10 },
      { key: 'angle', label: '方向', unit: '°', min: 0, max: 270, step: 90 },
    ],
    body: null,
    overlay: (ctx, c, all) => drawCircuit(ctx, c, all),
  },
  spring: {
    name: '弹簧',
    defaults: () => ({ k: 50, restLen: 120 }),
    fields: [
      { key: 'k', label: '劲度系数 k', unit: 'N/m', min: 5, max: 500, step: 5 },
      { key: 'restLen', label: '原长', unit: 'px', min: 40, max: 400, step: 10 },
    ],
    body: null,
    force: (c, components) => pairForce(c, components, (d, p) => -p.k * ((d - p.restLen) / 100)),
    overlay: (ctx, c, components) => drawSpring(ctx, c, components),
  },
  rope: {
    name: '轻绳',
    defaults: () => ({ len: 150 }),
    fields: [{ key: 'len', label: '绳长', unit: 'px', min: 40, max: 500, step: 10 }],
    body: null,
    overlay: (ctx, c, components) => {
      const ends = pairEnds(c, components); if (!ends) return
      ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.5 * LW
      ctx.beginPath(); ctx.moveTo(ends[0].body.position.x, ends[0].body.position.y)
      ctx.lineTo(ends[1].body.position.x, ends[1].body.position.y); ctx.stroke(); ctx.lineWidth = 1 * LW
    },
  },
  pulley: {
    name: '定滑轮',
    defaults: () => ({ r: 22, len: 320 }),
    fields: [
      { key: 'r', label: '半径', unit: 'px', min: 10, max: 60, step: 2 },
      { key: 'len', label: '绳总长', unit: 'px', min: 100, max: 800, step: 20 },
    ],
    body: (x, y, p) => ({ type: 'circle', r: p.r,
      options: { isStatic: true, friction: 0 }, label: 'pulley' }),
    // 跨过滑轮的绳：两端到滑轮距离之和 ≤ len（硬约束，见 sim/constraints.js）
    overlay: (ctx, c, components) => {
      const ends = pairEnds(c, components)
      const rad = c.props.r ?? 22
      ctx.save()
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      // 绳（黄色，画在轮体下面）：从物体到轮缘
      ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.6 * LW
      if (ends) for (const end of ends) {
        const b = end.body.position
        const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1
        ctx.beginPath(); ctx.moveTo(b.x, b.y)
        ctx.lineTo(c.x + dx / d * rad, c.y + dy / d * rad); ctx.stroke()
      }
      // 轮体：深色填充轮 + 亮外圈 + 6 轮辐 + 大中心轴
      ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(7,11,18,.9)'; ctx.fill()
      ctx.strokeStyle = 'rgba(219,230,245,.95)'; ctx.lineWidth = 1.6 * LW; ctx.stroke()
      ctx.lineWidth = 1.1 * LW
      ctx.strokeStyle = 'rgba(219,230,245,.55)'
      ctx.beginPath(); ctx.arc(c.x, c.y, rad * 0.62, 0, Math.PI * 2); ctx.stroke()
      for (let k = 0; k < 6; k++) {
        const a2 = (k * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(c.x + Math.cos(a2) * rad * 0.62, c.y + Math.sin(a2) * rad * 0.62)
        ctx.lineTo(c.x + Math.cos(a2) * rad, c.y + Math.sin(a2) * rad); ctx.stroke()
      }
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, 7)
      ctx.fillStyle = '#38bdf8'; ctx.fill()
      ctx.strokeStyle = 'rgba(56,189,248,.5)'; ctx.lineWidth = 1 * LW
      ctx.beginPath(); ctx.arc(c.x, c.y, rad + 4, 0, Math.PI * 2); ctx.stroke()
      ctx.restore(); ctx.lineWidth = 1 * LW
    },
  },
    spring: {
    name: '弹簧',
    defaults: () => ({ k: 50, restLen: 120 }),
    fields: [
      { key: 'k', label: '劲度系数 k', unit: 'N/m', min: 5, max: 500, step: 5 },
      { key: 'restLen', label: '原长', unit: 'px', min: 40, max: 400, step: 10 },
    ],
    body: null,
    force: (c, components) => pairForce(c, components, (d, p) => -p.k * ((d - p.restLen) / 100)),
    overlay: (ctx, c, components) => drawSpring(ctx, c, components),
  },
  rope: {
    name: '轻绳',
    defaults: () => ({ len: 150 }),
    fields: [{ key: 'len', label: '绳长', unit: 'px', min: 40, max: 500, step: 10 }],
    body: null,
    overlay: (ctx, c, components) => {
      const ends = pairEnds(c, components); if (!ends) return
      ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.5 * LW
      ctx.beginPath(); ctx.moveTo(ends[0].body.position.x, ends[0].body.position.y)
      ctx.lineTo(ends[1].body.position.x, ends[1].body.position.y); ctx.stroke(); ctx.lineWidth = 1 * LW
    },
  },
  pulley: {
    name: '定滑轮',
    defaults: () => ({ r: 22, len: 320 }),
    fields: [
      { key: 'r', label: '半径', unit: 'px', min: 10, max: 60, step: 2 },
      { key: 'len', label: '绳总长', unit: 'px', min: 100, max: 800, step: 20 },
    ],
    body: (x, y, p) => ({ type: 'circle', r: p.r,
      options: { isStatic: true, friction: 0 }, label: 'pulley' }),
    // 跨过滑轮的绳：两端到滑轮距离之和 ≤ len（硬约束，见 sim/constraints.js）
    overlay: (ctx, c, components) => {
      const ends = pairEnds(c, components)
      const rad = c.props.r ?? 22
      ctx.save()
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      // 绳（黄色，画在轮体下面）：从物体到轮缘
      ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.6 * LW
      if (ends) for (const end of ends) {
        const b = end.body.position
        const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1
        ctx.beginPath(); ctx.moveTo(b.x, b.y)
        ctx.lineTo(c.x + dx / d * rad, c.y + dy / d * rad); ctx.stroke()
      }
      // 轮体：深色填充轮 + 亮外圈 + 6 轮辐 + 大中心轴
      ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(7,11,18,.9)'; ctx.fill()
      ctx.strokeStyle = 'rgba(219,230,245,.95)'; ctx.lineWidth = 1.6 * LW; ctx.stroke()
      ctx.lineWidth = 1.1 * LW
      ctx.strokeStyle = 'rgba(219,230,245,.55)'
      ctx.beginPath(); ctx.arc(c.x, c.y, rad * 0.62, 0, Math.PI * 2); ctx.stroke()
      for (let k = 0; k < 6; k++) {
        const a2 = (k * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(c.x + Math.cos(a2) * rad * 0.62, c.y + Math.sin(a2) * rad * 0.62)
        ctx.lineTo(c.x + Math.cos(a2) * rad, c.y + Math.sin(a2) * rad); ctx.stroke()
      }
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, 7)
      ctx.fillStyle = '#38bdf8'; ctx.fill()
      ctx.strokeStyle = 'rgba(56,189,248,.5)'; ctx.lineWidth = 1 * LW
      ctx.beginPath(); ctx.arc(c.x, c.y, rad + 4, 0, Math.PI * 2); ctx.stroke()
      ctx.restore(); ctx.lineWidth = 1 * LW
    },
  },
  magnet: {
    name: '条形磁铁',
    defaults: () => ({ len: 120, strength: 5, angle: 0 }),
    fields: [
      { key: 'len', label: '长度', unit: 'px', min: 60, max: 400, step: 10 },
      { key: 'strength', label: '磁强度', unit: '', min: 1, max: 20, step: 1 },
      { key: 'angle', label: '方向（0°=N朝右）', unit: '°', min: 0, max: 330, step: 30 },
    ],
    // 简化模型：两个磁荷（N 在 +len/2 沿轴，S 在 −len/2），对带电运动电荷按 B∝1/r² 近似施加力
    body: (x, y, p) => ({ type: 'rotRect', w: p.len ?? 120, h: 22,
      angle: ((p.angle ?? 0) * Math.PI) / 180,
      options: { isStatic: true, friction: 0 }, label: 'magnet' }),
    overlay: (ctx, c) => {
      const len = c.props.len ?? 120, a = ((c.props.angle ?? 0) * Math.PI) / 180
      const x = c.x, y = c.y
      ctx.save()
      ctx.translate(x, y); ctx.rotate(a)
      const L = len / 2, hh = 11
      // N 半边（红）S 半边（蓝）
      ctx.fillStyle = 'rgba(248,113,113,.28)'
      ctx.fillRect(-L, -hh, L, hh * 2)
      ctx.fillStyle = 'rgba(96,165,250,.28)'
      ctx.fillRect(0, -hh, L, hh * 2)
      ctx.strokeStyle = 'rgba(219,230,245,.95)'; ctx.lineWidth = 1.5 * LW
      ctx.strokeRect(-L, -hh, len, hh * 2)
      ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, hh); ctx.stroke()
      ctx.fillStyle = '#f87171'; ctx.font = `bold ${12 * LW}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('N', L * 0.55, 0)
      ctx.fillStyle = '#60a5fa'
      ctx.fillText('S', -L * 0.55, 0)
      ctx.restore(); ctx.lineWidth = 1 * LW
    },
  },
  electronGun: {
    name: '电子枪',
    defaults: () => ({ q: -1, m: 0.5, v: 5, rate: 2, angle: 0 }),
    fields: [
      { key: 'q', label: '发射电荷 q', unit: 'μC', min: -20, max: 20, step: 0.5 },
      { key: 'm', label: '粒子质量 m', unit: 'kg', min: 0.1, max: 10, step: 0.1 },
      { key: 'v', label: '射出速度 v', unit: 'm/s', min: 0.5, max: 30, step: 0.5 },
      { key: 'rate', label: '发射间隔', unit: 's', min: 0.2, max: 5, step: 0.2 },
      { key: 'angle', label: '发射方向', unit: '°', min: 0, max: 360, step: 5 },
    ],
    body: null,   // 运行时由 useSim 每 rate 秒发射一个粒子
    overlay: (ctx, c) => {
      const p = c.props
      const a = ((p.angle ?? 0) * Math.PI) / 180
      const ux = Math.cos(a), uy = Math.sin(a)
      ctx.save()
      ctx.translate(c.x, c.y); ctx.rotate(a)
      ctx.strokeStyle = '#f5b342'; ctx.lineWidth = 2 * LW; ctx.fillStyle = 'rgba(245,179,66,.15)'
      ctx.strokeRect(-22, -9, 30, 18); ctx.fillRect(-22, -9, 30, 18)
      ctx.beginPath(); ctx.moveTo(8, -9); ctx.lineTo(20, -4); ctx.lineTo(20, 4); ctx.lineTo(8, 9); ctx.closePath()
      ctx.stroke(); ctx.fill()
      ctx.restore()
      ctx.beginPath(); ctx.moveTo(c.x + ux * 30, c.y + uy * 30); ctx.lineTo(c.x + ux * 58, c.y + uy * 58)
      ctx.strokeStyle = '#f5b342'; ctx.lineWidth = 2 * LW; ctx.stroke()
      const tip = 9, bx = c.x + ux * 58, by = c.y + uy * 58
      ctx.beginPath(); ctx.moveTo(bx + ux * tip - uy * tip * 0.5, by + uy * tip + ux * tip * 0.5)
      ctx.lineTo(bx, by)
      ctx.lineTo(bx + ux * tip + uy * tip * 0.5, by + uy * tip - ux * tip * 0.5)
      ctx.stroke()
      ctx.fillStyle = '#f5b342'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('电子枪 v=' + (p.v ?? 5).toFixed(1) + 'm/s', c.x - uy * 24, c.y + ux * 24 + 4)
    },
  },
  plates: {
    name: '平行极板',
    defaults: () => ({ len: 200, gap: 100, U: 100, angle: 0 }),
    fields: [
      { key: 'len', label: '板长 L', unit: 'px', min: 60, max: 800, step: 10 },
      { key: 'gap', label: '板间距 d', unit: 'px', min: 40, max: 400, step: 5 },
      { key: 'U', label: '电压 U', unit: 'V', min: -2000, max: 2000, step: 10 },
      { key: 'angle', label: '旋转', unit: '°', min: 0, max: 360, step: 5 },
    ],
    body: null,
    overlay: (ctx, c) => {
      const p = c.props
      const a = ((p.angle ?? 0) * Math.PI) / 180
      const ux = Math.cos(a), uy = Math.sin(a)
      const nx = -uy, ny = ux
      const hl = (p.len ?? 200) / 2, hg = (p.gap ?? 100) / 2
      const p1 = { x: c.x + nx * hg, y: c.y + ny * hg }
      const p2 = { x: c.x - nx * hg, y: c.y - ny * hg }
      ctx.save()
      ctx.lineWidth = 4 * LW; ctx.lineCap = 'butt'
      for (const [pl, ch, col] of [[p1, '+', '#38bdf8'], [p2, '−', '#f87171']]) {
        ctx.strokeStyle = col
        ctx.beginPath(); ctx.moveTo(pl.x - ux * hl, pl.y - uy * hl); ctx.lineTo(pl.x + ux * hl, pl.y + uy * hl); ctx.stroke()
        ctx.font = '13px system-ui'; ctx.fillStyle = col; ctx.textAlign = 'center'
        for (let s = -hl + 20; s <= hl - 20; s += 40) ctx.fillText(ch, pl.x + ux * s + nx * 11, pl.y + uy * s + ny * 11 + 4)
      }
      const sgn = Math.sign(p.U ?? 0)
      if (sgn) {
        const dx = -nx * sgn, dy = -ny * sgn
        ctx.strokeStyle = 'rgba(56,189,248,.7)'; ctx.lineWidth = 1.5 * LW
        for (let s = -hl + 24; s < hl - 10; s += 48) {
          const bx = c.x + ux * s, by = c.y + uy * s
          ctx.beginPath(); ctx.moveTo(bx - dx * 12, by - dy * 12); ctx.lineTo(bx + dx * 12, by + dy * 12)
          ctx.moveTo(bx + dx * 12, by + dy * 12); ctx.lineTo(bx + dx * 6 - dy * 4, by + dy * 6 + dx * 4)
          ctx.moveTo(bx + dx * 12, by + dy * 12); ctx.lineTo(bx + dx * 6 + dy * 4, by + dy * 6 - dx * 4)
          ctx.stroke()
        }
      }
      ctx.fillStyle = '#dbe6f5'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('U = ' + Math.round(p.U ?? 0) + 'V  d = ' + ((p.gap ?? 100) / 100).toFixed(2) + 'm', c.x - uy * (hg + 26), c.y + ux * (hg + 26))
      // 电容模型：显示两板累积电荷（_Q 由 engine 附着逻辑写入）
      if (p._Q) {
        ctx.font = '11px system-ui'; ctx.fillStyle = '#38bdf8'
        ctx.fillText('Q=' + p._Q.toFixed(1) + '  C=' + capacitance(p).toFixed(2) + 'F', c.x - uy * (hg + 44), c.y + ux * (hg + 44))
      }
      ctx.restore()
    },
  },
  uniformE: {
    name: '匀强电场 E',
    defaults: () => ({ w: 220, h: 160, ex: 0, ey: 100 }),  // N/C，ey>0 指上（物理坐标）
    fields: [
      { key: 'w', label: '区域宽', unit: 'px', min: 80, max: 500, step: 10 },
      { key: 'h', label: '区域高', unit: 'px', min: 80, max: 400, step: 10 },
      { key: 'ex', label: 'Ex', unit: 'N/C', min: -5000, max: 5000, step: 10 },
      { key: 'ey', label: 'Ey', unit: 'N/C', min: -5000, max: 5000, step: 10 },
    ],
    body: null,
    overlay: (ctx, c) => {
      const { ex, ey } = c.props
      const inf = c.props.w >= 3200 || c.props.h >= 3200
      const cw = ctx.canvas.width, ch = ctx.canvas.height
      const w = c.props.w >= 3200 ? cw * 3 : c.props.w
      const h = c.props.h >= 3200 ? ch * 3 : c.props.h
      const x = c.props.w >= 3200 ? cw / 2 : c.x, y = c.props.h >= 3200 ? ch / 2 : c.y
      ctx.save()
      ctx.strokeStyle = '#d2a8ff'; ctx.fillStyle = 'rgba(210,168,255,.06)'; ctx.lineWidth = 1.5 * LW
      ctx.fillRect(x - w/2, y - h/2, w, h); ctx.strokeRect(x - w/2, y - h/2, w, h)
      ctx.fillStyle = '#d2a8ff'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'
      ctx.fillText('E = (' + ex.toFixed(0) + ', ' + ey.toFixed(0) + ') N/C', x, y - h/2 - 8)
      const mag = Math.hypot(ex, ey)
      if (mag > 1) {
        const k = 22 / mag
        for (let gx = -w/2 + 30; gx < w/2; gx += 55)
          for (let gy = -h/2 + 30; gy < h/2; gy += 55) {
            ctx.globalAlpha = 0.65
            drawArrow(ctx, { x: x + gx - ex * k / 2, y: y + gy + ey * k / 2 },
              { x: x + gx + ex * k / 2, y: y + gy - ey * k / 2 }, '#d2a8ff')
          }
      }
      ctx.restore()
    },
  },
}

export function drawArrow(ctx, from, to, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5 * LW
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke()
  const a = Math.atan2(to.y - from.y, to.x - from.x)
  ctx.beginPath(); ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - 10 * Math.cos(a - 0.4), to.y - 10 * Math.sin(a - 0.4))
  ctx.lineTo(to.x - 10 * Math.cos(a + 0.4), to.y - 10 * Math.sin(a + 0.4))
  ctx.fill(); ctx.lineWidth = 1 * LW
}
// 弹簧/绳：连接最近的两个动态刚体，F = f(距离, 参数)
function pairEnds(c, components) {
  const dyn = components.filter(o => o.body && !o.body.isStatic)
  if (dyn.length < 2) return null
  // 放置时确定的连接对象优先（避免多个物体时「最近两体」随运动变化导致绳子跳绑）
  const pa = c.props._a != null ? dyn.find(o => o.id === c.props._a) : null
  const pb = c.props._b != null ? dyn.find(o => o.id === c.props._b) : null
  if (pa && pb && pa !== pb) return [pa, pb]
  const sorted = dyn.slice().sort((a, b) =>
    Math.hypot(a.body.position.x - c.x, a.body.position.y - c.y) -
    Math.hypot(b.body.position.x - c.x, b.body.position.y - c.y))
  return [sorted[0], sorted[1]]
}
function pairForce(c, components, fn) {
  const ends = pairEnds(c, components); if (!ends) return
  const [a, b] = ends
  const dx = b.body.position.x - a.body.position.x
  const dy = b.body.position.y - a.body.position.y
  const d = Math.max(Math.hypot(dx, dy), 1)
  const F = fn(d, c.props) * 1e-4
  const ux = dx / d, uy = dy / d
  Matter.Body.applyForce(a.body, a.body.position, { x: -F * ux, y: -F * uy })
  Matter.Body.applyForce(b.body, b.body.position, { x: F * ux, y: F * uy })
}
export function drawSpring(ctx, c, components) {
  const ends = pairEnds(c, components); if (!ends) return
  const [a, b] = ends
  const ax = a.body.position.x, ay = a.body.position.y
  const dx = b.body.position.x - ax, dy = b.body.position.y - ay
  const nx = -dy, ny = dx, m = Math.hypot(nx, ny) || 1
  ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = 2 * LW; ctx.beginPath(); ctx.moveTo(ax, ay)
  const coils = 12
  for (let i = 1; i < coils * 2; i++) {
    const t = i / (coils * 2)
    const off = i % 2 ? 9 : -9
    ctx.lineTo(ax + dx * t + nx / m * off, ay + dy * t + ny / m * off)
  }
  ctx.lineTo(b.body.position.x, b.body.position.y); ctx.stroke(); ctx.lineWidth = 1 * LW
}

// 定滑轮：两物体到滑轮的距离之和受绳长约束
// ——— 电路元件绘制 ———
function drawCircuit(ctx, c, all) {
  const p = c.props, len = p.len ?? 90
  const ang = ((p.angle ?? 0) * Math.PI) / 180
  const res = solve(all)
  const I = res?.currents.get(c.id) ?? 0
  const dead = res && c.type !== 'battery' && c.type !== 'switch' && Math.abs(I) < 1e-6
  ctx.save()
  ctx.globalAlpha = dead ? 0.4 : 1
  ctx.translate(c.x, c.y); ctx.rotate(ang)
  const L = len / 2, g = 16  // 引脚到图形
  ctx.strokeStyle = '#c9d1d9'; ctx.lineWidth = 2 * LW; ctx.lineCap = 'round'

  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() }
  // 引脚（纯导线画整条线，中间不留缺口）
  if (c.type === 'wire') line(-L, 0, L, 0)
  else { line(-L, 0, -g, 0); line(g, 0, L, 0) }
  ctx.fillStyle = '#8b949e'
  for (const sx of [-L, L]) { ctx.beginPath(); ctx.arc(sx, 0, 3, 0, 7); ctx.fill() }

  switch (c.type) {
    case 'battery': {
      if (p.ac) {
        // 交流电源：高中课本符号——圆圈里一条正弦波
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2 * LW
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.stroke()
        line(-g, 0, -12, 0); line(12, 0, g, 0)
        ctx.beginPath()
        for (let i = 0; i <= 24; i++) {
          const x = -7.5 + (i / 24) * 15
          const y = -5 * Math.sin((i / 24) * Math.PI * 2)
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        }
        ctx.stroke()
        ctx.fillStyle = '#ffd166'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('~', 0, -16)
        if (p.freq) ctx.fillText(`${p.freq} Hz`, 0, 24)
        break
      }
      // 长线为正极（+x 方向）
      line(-6, -10, -6, 10); line(6, -18, 6, 18)
      ctx.strokeStyle = '#ffd166'
      line(-g, 0, -6, 0); line(6, 0, g, 0)
      ctx.fillStyle = '#ffd166'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('+', 12, -12)
      break
    }
    case 'resistor':
    case 'rheostat': {
      ctx.strokeStyle = '#dbe6f5'
      ctx.strokeRect(-14, -8, 28, 16)
      if (c.type === 'rheostat') { line(-14, 12, 14, -14); ctx.beginPath(); ctx.moveTo(14, -14); ctx.lineTo(9, -10); ctx.lineTo(15, -8); ctx.closePath(); ctx.fillStyle = '#dbe6f5'; ctx.fill() }
      break
    }
    case 'bulb': {
      const on = Math.abs(I) > 0.02
      ctx.strokeStyle = '#dbe6f5'
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.stroke()
      line(-8, -8, 8, 8); line(-8, 8, 8, -8)
      if (on) { ctx.fillStyle = 'rgba(255,214,102,.18)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill() }
      break
    }
    case 'switch': {
      ctx.strokeStyle = '#dbe6f5'
      ctx.beginPath(); ctx.arc(-g + 2, 0, 3, 0, 7); ctx.arc(g - 2, 0, 3, 0, 7); ctx.stroke()
      if (p.closed) line(-g + 2, 0, g - 2, 0)
      else line(-g + 2, 0, g - 2, -12)
      break
    }
    case 'ammeter':
    case 'voltmeter':
    case 'multimeter': {
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2 * LW
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.stroke()
      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const mchar = c.type === 'multimeter' ? ['A','V','Ω'][Math.round(p.mode ?? 0)] : (c.type === 'ammeter' ? 'A' : 'V')
      ctx.fillText(mchar, 0, 1)
      break
    }
    case 'diode': {
      // 三角形指向正极 a→b 导通方向 + 竖杠
      ctx.fillStyle = '#dbe6f5'
      ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(-10, 9); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#dbe6f5'; ctx.lineWidth = 2 * LW
      line(10, -9, 10, 9)
      break
    }
    default: break
  }
  ctx.restore()

  // 并联态：元件端子到 A1A2 的延展引线（灰色、半透明）
  const par = p._par
  if (par?.a1 && par?.a2) {
    const hx = (Math.cos(ang) * len) / 2, hy = (Math.sin(ang) * len) / 2
    ctx.save()
    ctx.strokeStyle = 'rgba(139,148,158,.9)'
    ctx.lineWidth = 2 * LW
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(c.x - hx, c.y - hy); ctx.lineTo(par.a1.x, par.a1.y)
    ctx.moveTo(c.x + hx, c.y + hy); ctx.lineTo(par.a2.x, par.a2.y)
    ctx.stroke()
    ctx.restore()
  }

  // 电流方向箭头（沿元件轴线，正方向 a→b）
  if (Math.abs(I) > 1e-3) {
    const dir = Math.sign(I)
    const ax = Math.cos(ang), ay = Math.sin(ang)
    const bx = c.x - ax * (len / 2 - 10), by = c.y - ay * (len / 2 - 10)
    const tip = { x: bx + ax * 10 * dir, y: by + ay * 10 * dir }
    ctx.strokeStyle = '#5ad1a5'; ctx.fillStyle = '#5ad1a5'; ctx.lineWidth = 2 * LW
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tip.x, tip.y); ctx.stroke()
    const a2 = Math.atan2(ay * dir, ax * dir)
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x - 7 * Math.cos(a2 - 0.45), tip.y - 7 * Math.sin(a2 - 0.45))
    ctx.lineTo(tip.x - 7 * Math.cos(a2 + 0.45), tip.y - 7 * Math.sin(a2 + 0.45))
    ctx.fill(); ctx.lineWidth = 1 * LW
  }

  // 数值标注
  const nx = -Math.sin(ang), ny = Math.cos(ang)
  const lx = c.x + nx * 24, ly = c.y + ny * 24
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  let label = ''
  if (c.type === 'battery') label = `E=${p.E}V r=${p.r}Ω`
  else if (c.type === 'resistor' || c.type === 'rheostat' || c.type === 'bulb') label = `R=${p.R}Ω`
  else if (c.type === 'switch') label = p.closed ? '闭合' : '断开'
  if (c.type === 'ammeter') label = `I=${Math.abs(I).toFixed(3)}A`
  if (c.type === 'resistor' || c.type === 'rheostat' || c.type === 'bulb') label += `  P=${(res?.power.get(c.id) ?? 0).toFixed(2)}W`
  if (c.type === 'voltmeter') {
    const u = res ? Math.abs(uAcross(res, c, all)) : 0
    label = `U=${u.toFixed(2)}V`
  }
  if (c.type === 'multimeter') {
    const mode = ['A','V','Ω'][Math.round(p.mode ?? 0)]
    if (mode === 'A') label = `I=${Math.abs(I).toFixed(3)}A`
    else if (mode === 'V') label = `U=${Math.abs(uAcross(res, c, all)).toFixed(2)}V`
    else {
      // Ω 档：表笔接在电阻类元件两端时显示其标称阻值（高中用法：测前断电、单独测量）
      const ps = pins(c)
      const target = all.find(e => e !== c && ['resistor', 'rheostat', 'bulb'].includes(e.type) &&
        pins(e).every((q, k) => Math.hypot(q.x - ps[k === 0 ? 0 : 1].x, q.y - ps[k === 0 ? 0 : 1].y) < 14 ||
                                   Math.hypot(q.x - ps[k === 0 ? 1 : 0].x, q.y - ps[k === 0 ? 1 : 0].y) < 14))
      label = target ? `R=${target.props.R}Ω` : '---'
    }
  }
  if (label) {
    const w = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(20,24,32,.7)'
    ctx.fillRect(lx - w / 2 - 3, ly - 7, w + 6, 14)
    ctx.fillStyle = '#9fb3c8'
    ctx.fillText(label, lx, ly)
  }
}

function uAcross(res, c, all) {
  const p = c.props, len = p.len ?? 90
  const ang = ((p.angle ?? 0) * Math.PI) / 180
  const dx = (Math.cos(ang) * len) / 2, dy = (Math.sin(ang) * len) / 2
  // 用电表两端端子所在节点求电压差（solve 已聚过类，这里用端子坐标重新映射）
  void all
  const va = res.V[res.nodeOf.get(c.id)?.a ?? 0] ?? 0
  const vb = res.V[res.nodeOf.get(c.id)?.b ?? 0] ?? 0
  return va - vb
  void dx; void dy
}
