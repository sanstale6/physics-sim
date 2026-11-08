// 内置真题场景：每个返回 [ {type, x, y, props?}, ... ]（画布坐标 px）

export const elasticCollision = [
  { type: 'ground', x: 250, y: 560 },
  { type: 'ball', x: 120, y: 500, props: { m: 2, r: 20, rest: 1 } },
  { type: 'ball', x: 330, y: 500, props: { m: 1, r: 20, rest: 1 } },
]

export const presets = {
  '弹性碰撞': elasticCollision,
  平抛运动: [
    { type: 'ground', x: 500, y: 560 },
    { type: 'ball', x: 200, y: 200, props: { m: 1, r: 15, v0x: 5 } },
  ],
  斜面滑动: [
    { type: 'ground', x: 500, y: 560 },
    { type: 'incline', x: 450, y: 400, props: { angle: 30 } },
    { type: 'block', x: 430, y: 360, props: { m: 1, mu: 0.1 } },
  ],
  带电粒子圆周: [
    { type: 'uniformB', x: 480, y: 320, props: { w: 480, h: 360, bz: 2 } },
    { type: 'charge', x: 400, y: 300, props: { q: 2, m: 0.5, r: 12, v0x: 6 } },
  ],
  电场中偏转: [
    { type: 'uniformE', x: 520, y: 340, props: { w: 420, h: 300, ex: 0, ey: 8 } },
    { type: 'charge', x: 340, y: 260, props: { q: -1, m: 0.5, r: 12, v0x: 10 } },
  ],
  复合场: [
    { type: 'uniformB', x: 500, y: 330, props: { w: 520, h: 420, bz: 2 } },
    { type: 'uniformE', x: 500, y: 330, props: { w: 520, h: 420, ex: 4, ey: 0 } },
    { type: 'charge', x: 280, y: 330, props: { q: 1, m: 0.5, r: 12 } },
  ],
  点电荷相互作用: [
    { type: 'ground', x: 500, y: 560 },
    { type: 'charge', x: 300, y: 300, props: { q: 5, r: 14 } },
    { type: 'charge', x: 700, y: 300, props: { q: -5, r: 14 } },
  ],
  弹簧振子: [
    { type: 'track', x: 420, y: 480, props: { len: 440 } },
    { type: 'block', x: 260, y: 458, props: { m: 5, mu: 0 } },
    { type: 'block', x: 460, y: 458, props: { m: 1, mu: 0 } },
    { type: 'spring', x: 360, y: 458, props: { k: 40, restLen: 160 } },
  ],
  连接体: [
    { type: 'track', x: 450, y: 480, props: { len: 800 } },
    { type: 'block', x: 340, y: 458, props: { m: 2, mu: 0.05 } },
    { type: 'block', x: 500, y: 458, props: { m: 1, mu: 0.05 } },
    { type: 'rope', x: 420, y: 458, props: { len: 160 } },
    { type: 'constantForce', x: 330, y: 440, props: { fx: -6, fy: 0 } },
  ],
  串联电路: [
    { type: 'battery', x: 400, y: 240, props: { E: 6, r: 0.5, len: 200, angle: 0 } },
    { type: 'resistor', x: 500, y: 320, props: { R: 20, len: 160, angle: 90 } },
    { type: 'wire', x: 400, y: 400, props: { len: 200, angle: 0 } },
    { type: 'wire', x: 300, y: 320, props: { len: 160, angle: 90 } },
  ],
  并联电路: [
    { type: 'battery', x: 400, y: 240, props: { E: 6, r: 0.5, len: 200, angle: 0 } },
    { type: 'resistor', x: 400, y: 320, props: { R: 20, len: 200, angle: 0 } },
    { type: 'resistor', x: 400, y: 400, props: { R: 20, len: 200, angle: 0 } },
    { type: 'wire', x: 300, y: 280, props: { len: 80, angle: 90 } },
    { type: 'wire', x: 300, y: 360, props: { len: 80, angle: 90 } },
    { type: 'wire', x: 500, y: 280, props: { len: 80, angle: 90 } },
    { type: 'wire', x: 500, y: 360, props: { len: 80, angle: 90 } },
  ],
  伏安法测电阻: [
    { type: 'battery', x: 400, y: 240, props: { E: 6, r: 0.5, len: 200, angle: 0 } },
    { type: 'ammeter', x: 500, y: 280, props: { len: 80, angle: 90 } },
    { type: 'resistor', x: 500, y: 360, props: { R: 20, len: 80, angle: 90 } },
    { type: 'voltmeter', x: 560, y: 360, props: { len: 80, angle: 90 } },
    { type: 'wire', x: 530, y: 320, props: { len: 60, angle: 0 } },
    { type: 'wire', x: 530, y: 400, props: { len: 60, angle: 0 } },
    { type: 'wire', x: 400, y: 400, props: { len: 200, angle: 0 } },
    { type: 'wire', x: 300, y: 320, props: { len: 160, angle: 90 } },
  ],
  单摆: [
    { type: 'pendulum', x: 420, y: 160, props: { len: 234 } },
    { type: 'ball', x: 500, y: 380, props: { m: 1, r: 14 } },
  ],
  传送带: [
    { type: 'ground', x: 500, y: 600 },
    { type: 'conveyor', x: 420, y: 520, props: { len: 560, v: 2 } },
    { type: 'block', x: 240, y: 498, props: { m: 1, mu: 0.4, v0x: 0 } },
  ],
  凸透镜成像: [
    { type: 'lightSource', x: 140, y: 300, props: { rays: 9, spread: 46, angle: 0 } },
    { type: 'lens', x: 420, y: 300, props: { len: 180, f: 150, angle: 90 } },
    { type: 'screen', x: 700, y: 300, props: { len: 220, angle: 90 } },
  ],
  平面镜反射: [
    { type: 'lightSource', x: 260, y: 200, props: { rays: 7, spread: 30, angle: 60 } },
    { type: 'mirror', x: 480, y: 380, props: { len: 220, angle: 0 } },
  ],
  碰撞动量守恒: [
    { type: 'ground', x: 500, y: 600 },
    { type: 'block', x: 340, y: 550, props: { m: 2, mu: 0 } },
    { type: 'block', x: 520, y: 550, props: { m: 1, mu: 0 } },
    { type: 'constantForce', x: 270, y: 535, props: { fx: 6, fy: 0 } },
  ],
  定滑轮提升: [
    { type: 'ground', x: 500, y: 600 },
    { type: 'pulley', x: 500, y: 200, props: { r: 22, len: 492 } },
    { type: 'block', x: 400, y: 420, props: { m: 2, mu: 0 } },
    { type: 'block', x: 600, y: 430, props: { m: 1, mu: 0 } },
  ],
  恒力拉动物块: [
    { type: 'ground', x: 500, y: 560 },
    { type: 'block', x: 300, y: 520, props: { m: 1, mu: 0.2 } },
    { type: 'constantForce', x: 360, y: 505, props: { fx: 10, fy: 0 } },
  ],
}
// ── 第二批真题场景 ───────────────────────────────────────────────
Object.assign(presets, {
  竖直上抛: [
    { type: 'ground', x: 450, y: 560 },
    { type: 'block', x: 300, y: 480, props: { m: 1, mu: 0, v0y: 10 } },
  ],
  斜面平抛: [
    { type: 'ground', x: 500, y: 560 },
    { type: 'incline', x: 430, y: 400, props: { angle: 30, len: 320 } },
    { type: 'ball', x: 275, y: 285, props: { m: 1, r: 10, v0x: 4 } },
  ],
  追及相遇: [
    { type: 'ground', x: 500, y: 560 },
    { type: 'block', x: 180, y: 525, props: { m: 1, mu: 0, v0x: 4 } },
    { type: 'block', x: 480, y: 525, props: { m: 1, mu: 0 } },
    { type: 'constantForce', x: 480, y: 470, props: { fx: 1, fy: 0 } },
  ],
  限流法测电阻: [
    { type: 'battery', x: 400, y: 240, props: { E: 6, r: 0.5, len: 200, angle: 0 } },
    { type: 'ammeter', x: 500, y: 280, props: { len: 80, angle: 90 } },
    { type: 'rheostat', x: 500, y: 360, props: { R: 10, len: 80, angle: 90 } },
    { type: 'wire', x: 300, y: 320, props: { len: 160, angle: 90 } },
    { type: 'wire', x: 330, y: 400, props: { len: 60, angle: 0 } },
    { type: 'resistor', x: 400, y: 400, props: { R: 20, len: 80, angle: 0 } },
    { type: 'wire', x: 470, y: 400, props: { len: 60, angle: 0 } },
    { type: 'wire', x: 360, y: 430, props: { len: 60, angle: 90 } },
    { type: 'wire', x: 440, y: 430, props: { len: 60, angle: 90 } },
    { type: 'voltmeter', x: 400, y: 460, props: { len: 80, angle: 0 } },
  ],
  测电源电动势与内阻: [
    { type: 'battery', x: 400, y: 240, props: { E: 6, r: 1, len: 200, angle: 0 } },
    { type: 'wire', x: 300, y: 320, props: { len: 160, angle: 90 } },
    { type: 'wire', x: 500, y: 320, props: { len: 160, angle: 90 } },
    { type: 'rheostat', x: 400, y: 400, props: { R: 8, len: 200, angle: 0 } },
    { type: 'wire', x: 300, y: 210, props: { len: 60, angle: 90 } },
    { type: 'wire', x: 500, y: 210, props: { len: 60, angle: 90 } },
    { type: 'voltmeter', x: 400, y: 180, props: { len: 200, angle: 0 } },
  ],
  两灯串联亮度: [
    { type: 'battery', x: 400, y: 240, props: { E: 6, r: 0.5, len: 200, angle: 0 } },
    { type: 'wire', x: 300, y: 320, props: { len: 160, angle: 90 } },
    { type: 'bulb', x: 500, y: 320, props: { R: 10, len: 160, angle: 90 } },
    { type: 'bulb', x: 400, y: 400, props: { R: 20, len: 200, angle: 0 } },
  ],
  磁铁吸引电子束: [
    { type: 'ball', x: 150, y: 300, props: { m: 0.5, r: 10, q: -10, v0x: 8, v0y: 0, mu: 0 } },
    { type: 'magnet', x: 450, y: 300, props: { len: 160, strength: 10, angle: 0 } },
    { type: 'track', x: 150, y: 560, props: { len: 300 } },
  ],
  带电摆线偏转: [
    { type: 'pendulum', x: 400, y: 160, props: { len: 240 } },
    { type: 'ball', x: 460, y: 380, props: { m: 1, r: 12, q: 5, mu: 0 } },
    { type: 'uniformE', x: 400, y: 400, props: { w: 400, h: 260, ex: 300, ey: 0 } },
  ],
  金属导轨上滑杆: [
    { type: 'rail', x: 400, y: 330, props: { len: 420, gap: 120 } },
    { type: 'block', x: 400, y: 330, props: { m: 0.5, mu: 0, q: 30, v0x: 3, v0y: 0 } },
    { type: 'uniformB', x: 400, y: 330, props: { w: 480, h: 200, bz: 2 } },
  ],
  小磁针指北: [
    { type: 'compass', x: 300, y: 300, props: { len: 48 } },
    { type: 'magnet', x: 480, y: 300, props: { len: 140, strength: 8, angle: 0 } },
    { type: 'compass', x: 620, y: 220, props: { len: 44 } },
  ],
  通电螺线管磁场: [
    { type: 'solenoid', x: 400, y: 300, props: { len: 220, angle: 0, I: 4, n: 10 } },
    { type: 'compass', x: 400, y: 180, props: { len: 44 } },
    { type: 'compass', x: 580, y: 300, props: { len: 44 } },
  ],
  传送带刹车: [
    { type: 'conveyor', x: 400, y: 500, props: { len: 520, v: 3 } },
    { type: 'block', x: 260, y: 480, props: { m: 1, mu: 0.5, v0x: 0, v0y: 0 } },
    { type: 'constantForce', x: 620, y: 430, props: { fx: -3, fy: 0 } },
  ],
  竖直圆周运动: [
    { type: 'ball', x: 400, y: 200, props: { m: 0.5, r: 12, q: 0, v0x: 9, v0y: 0 } },
    { type: 'uniformB', x: 400, y: 330, props: { w: 520, h: 460, bz: 1.5 } },
  ],
  // 速度选择器：直线通过条件 v0 = E/B = 20/2 = 10 m/s（换 q 或 v 看偏转）
  速度选择器: [
    { type: 'charge', x: 180, y: 300, props: { q: 1, m: 0.5, r: 10, v0x: 10, v0y: 0 } },
    { type: 'uniformE', x: 400, y: 300, props: { w: 440, h: 300, ex: 0, ey: 20 } },
    { type: 'uniformB', x: 400, y: 300, props: { w: 440, h: 300, bz: 2 } },
  ],
  // 质谱仪：选择器 E/B=10 直进，偏转区 B’=10 → R=mv/(qB’)=1×10/10=1m=100px，打在底部感光板（改 m 看 R 变化）
  质谱仪: [
    { type: 'charge', x: 160, y: 380, props: { q: 1, m: 1, r: 10, v0x: 10, v0y: 0 } },
    { type: 'uniformE', x: 340, y: 380, props: { w: 180, h: 220, ex: 0, ey: 6 } },
    { type: 'uniformB', x: 340, y: 380, props: { w: 180, h: 220, bz: 1 } },
    { type: 'uniformB', x: 780, y: 480, props: { w: 700, h: 900, bz: 10 } },
    { type: 'screen', x: 430, y: 623, props: { len: 346, angle: 90 } },
  ],
  // 电子枪偏转：a = qU/(md) = 5*1.4/(0.5*1.4)…取 U=5V → a=10 m/s²，穿越 3m 用时 0.5s，侧移 1.25m 合理
  电子枪偏转: [
    { type: 'electronGun', x: 140, y: 300, props: { q: -1, m: 0.5, v: 6, rate: 1.2, angle: 0 } },
    { type: 'plates', x: 480, y: 300, props: { len: 300, gap: 140, U: 3, angle: 0 } },
    { type: 'uniformB', x: 820, y: 160, props: { w: 300, h: 440, bz: -1.5 } },
  ],
  // 磁流体发电机：电荷入区被 B 分偏 → 附着极板 → U=Q/C 涨至平衡 U=vBd=8×2×1.6=25.6V（开路电压），此后后续电荷直穿
  磁流体发电机: [
    { type: 'plates', x: 400, y: 300, props: { len: 320, gap: 160, U: 0, angle: 0 } },
    { type: 'uniformB', x: 400, y: 300, props: { w: 380, h: 280, bz: 2 } },
    { type: 'charge', x: 220, y: 260, props: { q: 1, m: 0.5, r: 10, v0x: 8, v0y: 0 } },
    { type: 'charge', x: 220, y: 340, props: { q: -1, m: 0.5, r: 10, v0x: 8, v0y: 0 } },
  ],
  回旋加速器: [
    { type: 'cyclotron', x: 480, y: 300, props: { R: 170, U: 2, B: 2 } },
    { type: 'charge', x: 480, y: 300, props: { q: 1, m: 0.5, r: 8, v0x: 2, v0y: 0 } },
  ],
  // 电压表外接：V 直接并在 R 两端（A 在干路）。I = 6/20.5 ≈ 0.293A，V 读数 = U_R（偏小方向）
  电压表外接: [
    { type: 'battery', x: 400, y: 300, props: { E: 6, r: 0.5, len: 120, angle: 90 } },
    { type: 'ammeter', x: 400, y: 420, props: { len: 120, angle: 90 } },
    { type: 'resistor', x: 400, y: 540, props: { R: 20, len: 120, angle: 90 } },
    { type: 'voltmeter', x: 560, y: 540, props: { len: 120, angle: 90 } },
    { type: 'wire', x: 530, y: 600, props: { len: 260, angle: 0 } },
    { type: 'wire', x: 660, y: 420, props: { len: 360, angle: 270 } },
    { type: 'wire', x: 530, y: 240, props: { len: 260, angle: 180 } },
    { type: 'wire', x: 480, y: 480, props: { len: 160, angle: 0 } },
    { type: 'wire', x: 480, y: 600, props: { len: 160, angle: 0 } },
  ],
  // 电压表内接：V 跨在「A+R」两端，读数含 A 分压（偏大方向）。对比外接看误差方向
  电压表内接: [
    { type: 'battery', x: 400, y: 300, props: { E: 6, r: 0.5, len: 120, angle: 90 } },
    { type: 'ammeter', x: 400, y: 420, props: { len: 120, angle: 90 } },
    { type: 'resistor', x: 400, y: 540, props: { R: 20, len: 120, angle: 90 } },
    { type: 'voltmeter', x: 560, y: 480, props: { len: 240, angle: 90 } },
    { type: 'wire', x: 530, y: 600, props: { len: 260, angle: 0 } },
    { type: 'wire', x: 660, y: 420, props: { len: 360, angle: 270 } },
    { type: 'wire', x: 530, y: 240, props: { len: 260, angle: 180 } },
    { type: 'wire', x: 480, y: 360, props: { len: 160, angle: 0 } },
    { type: 'wire', x: 480, y: 600, props: { len: 160, angle: 0 } },
  ],
  // 惠斯通电桥：R1=R2=R3=R4=20 平衡 → 桥（灯泡 G）无电流；R4=40 失衡看偏转
  惠斯通电桥: [
    { type: 'battery', x: 250, y: 400, props: { E: 6, r: 0.5, len: 280, angle: 90 } },
    { type: 'resistor', x: 430, y: 330, props: { R: 20, len: 140, angle: 90 } },
    { type: 'resistor', x: 430, y: 470, props: { R: 20, len: 140, angle: 90 } },
    { type: 'resistor', x: 630, y: 330, props: { R: 20, len: 140, angle: 90 } },
    { type: 'resistor', x: 630, y: 470, props: { R: 40, len: 140, angle: 90 } },
    { type: 'bulb', x: 530, y: 400, props: { R: 5, len: 200, angle: 0 } },
    { type: 'wire', x: 340, y: 260, props: { len: 180, angle: 0 } },
    { type: 'wire', x: 530, y: 260, props: { len: 200, angle: 0 } },
    { type: 'wire', x: 340, y: 540, props: { len: 180, angle: 0 } },
    { type: 'wire', x: 530, y: 540, props: { len: 200, angle: 0 } },
  ],
  // 滑动变阻器分压：变阻器 20Ω（上下两半各 10），负载 10Ω 并在下半段。I干≈0.387A、I载≈0.194A
  变阻器分压: [
    { type: 'battery', x: 250, y: 400, props: { E: 6, r: 0.5, len: 280, angle: 90 } },
    { type: 'resistor', x: 430, y: 330, props: { R: 10, len: 140, angle: 90 } },
    { type: 'resistor', x: 430, y: 470, props: { R: 10, len: 140, angle: 90 } },
    { type: 'resistor', x: 560, y: 470, props: { R: 10, len: 140, angle: 90 } },
    { type: 'wire', x: 340, y: 260, props: { len: 180, angle: 0 } },
    { type: 'wire', x: 340, y: 540, props: { len: 180, angle: 0 } },
    { type: 'wire', x: 495, y: 400, props: { len: 130, angle: 0 } },
    { type: 'wire', x: 495, y: 540, props: { len: 130, angle: 180 } },
  ],
})
