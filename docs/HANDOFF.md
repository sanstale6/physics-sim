# 高中物理模拟器 · 交接文档

> 写给下一个会话 / 下一位开发者。读完这份 + docs/DESIGN.md + README.md 即可接手。

## 项目概览
- 路径：/root/workspace/physics-sim（Vite 8.3.6 + React 19.3.1 + matter-js 0.20.0，pnpm）
- 仓库：github.com/sanstale6/physics-sim（main）
- 定位：2D 物理沙盘，真题图元风格（简约线条），玩家自由放置元件观察现象
- 部署：纯静态 dist/，`pnpm build` 后任意静态托管（本地用 `npx serve dist -l 8090`，已 setsid 常驻，serve 直读 dist、重建即生效）。局域网 http://192.168.3.4:8090
- 目标：无 server 依赖，可 Vercel/Netlify/GH Pages（vercel.json 已提交）

## 常用命令
```
pnpm build          # 构建
pnpm exec oxlint src  # lint（~53 warnings 0 errors，warnings 是 React Compiler 提示，无害）
pnpm test           # 全链回归（22 个脚本，见下）
```
测试链 = bodies/charged/regression/incline/fields/track/rope/pendulum/spring/presets/draw/parallel/circuits2/runtime(happy-dom 冒烟)/cyc/velsel/electrostatic/capacitor/gravity/ampere/ohmmeter/belt/reset，共 210+ 断言、22 个脚本。
**每次部署前必须跑 pnpm test**——runtime.mjs（happy-dom 加载 dist bundle 逐预设点击）曾多次抓到真机黑屏级 bug。

## 架构
- src/sim/registry.js — 元件注册表（契约见 DESIGN.md 第 9 节）：name/defaults/fields/body(x,y,props)/force(c,components)?/overlay(ctx,c,components)?
- src/sim/engine.js — matter 世界 + 每步施力（applyForces）+ 约束后处理（postStep → constraints.js PBD）
- src/sim/{incline,contacts,constraints,analysis,circuit,magnetism,share,optics,presets}.js
- src/hooks/useSim.js — React 绑定：spawn/dragTo/update/reset/undo/redo/场景恢复/电子枪发射/固定 60Hz 步长
- src/components/ — SimCanvas（手势+渲染）/Pallete/Toolbar/Inspector/DataPanel(v-t)/MomentumPanel/SceneIO/StatusBar/Help
- scripts/*.mjs — 回归（node 直跑，import src/sim/*.js）

## 物理标度（核心约定，改前先懂）
- SCALE=100px=1m，g=9.8，FORCE_SCALE=1e-4（1N → matter 1e-4），VEL_SCALE=0.6（matter px/step → m/s）
- **matter-js 陷阱**：gravity 对所有非静态 body 生效且无 gravityScale 开关（Body.gravityScale 无效）→ 电荷类每步需 applyForce 反向抵消（engine.js 内 gw = gravityState.on ? mass*GRAV.y*GRAV.scale : 0）
- 质量 = props.m 精确 kg（Body.setMass）；v-t 面板与动量面板都按 VEL_SCALE 换算
- 磁场（匀强 B / 条形磁铁）：不用洛伦兹力，每步把速度矢量精确旋转 φ=ω/60（ω=qB/m）；位置用**解析圆周**推进——圆心由「旋转前速度」的法向推算（`R=(v/VEL_SCALE)/|φ|`，注意速度换成 px/step），弧终点 = 圆心 + 旋转矩阵·(P−圆心)，再 `setPosition(终点 − 本步直线位移, false)` + 手写 `positionPrev = position − velocity`，让 Engine.update 的直线积分恰好落在弧上。速度旋转 + 弦补偿 push=R(1−cos φ) 的老办法会累积半径漂移，已弃用
- 电场（uniformE/plates）：单次全步 kick（`v += qE/m · Δt`）放在磁旋转之后、位置预补偿之前；跳蛙两半步、applyForce 版本都试过，与解析圆周叠加会破坏切向关系
- 斜面/地面/桌面/传送带摩擦：registry 里 body friction 全 0，摩擦由 contacts.js 自己算（静摩擦 clamp 驱动力）——matter 静摩擦会把物体锁死
- 绳/弹簧/滑轮/单摆：constraints.js 的 PBD 位置投影（不是弹簧模拟，硬弹簧会发散）

## 电路
- circuit.js：pins → clusterNodes（并查集，12px + 接点 20px 吸力）→ solve（节点电压法 Norton + 高斯消元，结果按 key 缓存）
- 接点可吸附到导线线段任意位置（snapJunction 20px）
- **并联态**（用户最在意的设计）：findParallel(x,y,len,angle,objs)——放置元件时若附近有平行节点对（角度 mod π ≤14°、垂直距 ≤150、长度自适应 tolLen=max(40, len*0.4, 配对长*0.6)，短元件自动拉伸对齐），存 props._par={a1,a2}，connPins 返回 _par 端点、绘制灰色延展引线；拖动/改 len/angle 即解除。用户操作：按住从节点拖出、长度塑形参与匹配
- 分享链接丢 id 会导致节点塌缩 → encodeScene 保留 id（已修，勿回退）

## 手势（SimCanvas.jsx）
- 状态机 idle|pan|press|drag|pinch：单指拖空白=平移，双指=缩放+平移，拖元件=移动，tap(TAP_SLOP=8)=选中/放置
- 重叠元件连点轮换选中（hitTestAll + cycleRef）
- tool!=='select' 时点击即放置；tool==='select' 才选中
- 渲染循环叫 rafLoop，包 try/catch（曾因函数名写错每帧 ReferenceError → 画布冻死）
- **style 陷阱**：`.canvas-wrap canvas{position:absolute}` 会命中面板内 canvas 拦截点击 → 只能写 `.canvas-wrap > canvas`

## 历史踩坑清单（血泪，勿重犯）
1. 每帧抛错会中止 raf 循环 → 画布冻死/黑屏。任何 registry overlay 里调用外部函数必须确认已 import（曾漏 import solve）。runtime.mjs 冒烟必须跑。
2. 字符串 replace 编辑大文件曾把 registry.js 内容错写进 circuit.js、slice 曾截断文件尾 → **编辑后立刻构建/import 冒烟**，锚点要唯一，必要时 git checkout 恢复。
3. 给函数加参数时解构行漏加变量 → ReferenceError 整页黑屏（showB 事件）。
4. Inspector 收到扁平 object 时，读 props 要 {props: object} 包一层（resistance() 读 o.props.R 曾 undefined.R 崩）。
5. 触屏 click 被 touch 手势吞 → 关键按钮用 onPointerDown + preventDefault。
6. 测 matter 物理时 Bodies.circle 必须 {frictionAir:0}；测试场景先确认几何不重叠（两方块贴着会互相碰撞卡死，误判成约束 bug）。
7. presets.js 追加对象曾出现多余逗号 SyntaxError；写完文件必须读回验证。
8. pnpm/node 须 PATH=/usr/local/bin:/usr/bin:/bin + HOME=/root（run_code 内 execSync 环境很空）。
9. matter Body.setPosition(pos,false) 不改速度；Body.setVelocity 的 timeScale=1（baseDelta 16.667）。
10. 不要往这台手机装浏览器/Chromium（曾装 playwright 546MB 后删）；不要试图用 mcp__phone__* 操作 Edge 验收网页（前台会被 DSH 抢回）。

## 金属棒与电磁感应（metalRod，原 rail 已删）
- 元件：src/sim/registry.js:227 起。defaults `{len:200,R:2,m:0.5,angle:90,v0x:0,v0y:0,g:0}`，body = rotRect（`inertia: Infinity` 防安培力矩把棒转起来），overlay 画 ε / I 标注
- 电气接触：circuit.js clusterNodes 末尾「端子压在线段中段也算接入」——**只对 metalRod 开放**（其它元件蹭到导线中段会把电路短接，这条曾被放开导致 circuits2 全挂）
- 感应电动势（engine.js 金属棒段）：ε = B·L·(vx·sinθ − vy·cosθ)，B 取棒处 uniformB 之和；写入 `rod.props._eInst`，solve 把它当电动势源
- 安培力：Fx = I·L·(−B·sinθ)、Fy = I·L·(B·cosθ)，`FORCE_SCALE` 缩放后 applyForce
- 重力抵消：g=0（导轨上架空）时每步施加 −m·g 抵消 matter 重力
- **applyForces 每步只能调用一次**（body.force 累加，调两次重力抵消就被加两遍 → 棒凭空上漂）
- 预设「金属棒切割磁感线」：B=1T、L=2m、v0=3m/s → ε=6V、I=0.749A、τ=mR/B²L²≈1s，v 指数衰减（1s 后 1.10m/s）
- scripts/induction.mjs：18 断言（ε/I/楞次/反向 B/匀速/电路闭合）

## 多用电表 / 二极管 / 交流电
- circuit.js：CIRCUIT_TYPES 加 'diode','multimeter'；resistance：diode 导通 1e-2 / 截止 1e12（用 `p._on === false` 判据，初值 undefined 视为导通）、multimeter A=0.1Ω / V=1e6 / Ω=OHM_RESISTOR(100Ω 表内阻)
- solve 尾部二极管方向迭代：I<−1e-9 判反向截止重解，恢复导通后递归一次；解完删除临时 `_on`（保缓存 key 干净）
- 交流电源：battery defaults `ac:0, freq:0.5`；useSim raf 每物理步写 `_eInst = E·sin(2πft)`，关掉交流档时 delete `_eInst`（否则残留最后一帧值）；solve 的缓存 key 已含 `_eInst`
- 多用电表读数：A 档 I、V 档 uAcross、Ω 档按真实欧姆表原理——表内电池 OHM_BATTERY=3V 串 OHM_RESISTOR=100Ω（中值电阻），`R = E/|I| − R内`；表笔悬空 I≈0 显示「表笔接电阻两端」
- 预设：二极管单向导电（正向 I=0.479A、角度 180 即截止）、交流电路（f=0.5Hz，I 在 0↔0.479 间摆动）

## 本轮修复（第 17 轮：交互与演示 bug）
- **回旋加速器**：改成极坐标驱动（engine.js 回旋段）——圆心固定在加速器中心做同心半圆，穿缝时 v'=√(v²+2qU/m)、r'=mv/(qB)，r≥R 后直线飞出。旧的「按 v+Δv 沿速度方向加」既多给能量（两次就出盒）又让圆心漂移（粒子跑出 D 形盒）。预设改 v0=0.5（从盒中心附近起步），scripts/cyc.mjs 7 断言（动能定理、同心、出盒速率 qBR/m=6.8）
- **电子枪发射间隔不起作用**：useSim raf 里 `gunAcc` 原本累加在循环外（=总运行时长），于是每帧都满足 `_t >= rate`。改为每帧 `const gunAcc = n*STEP_MS/1000`
- **磁铁/金属棒旋转时出现两个矩形**：这些元件有自己的 overlay 画外形，SimCanvas 又用 drawBody 画了 matter 刚体，角度不一致就重影。新增 `SKIP_BODY_DRAW = {pulley, magnet, metalRod, conveyor}` 跳过通用绘制
- **极板电压变了灯泡功率不变**：solve 的缓存 key 里 plates 落到 `props.R ?? ''`（无 R），U 变化不触发重算。key 里补 `'U' + props.U`。scripts/coulomb_switch.mjs 断言 U 翻倍功率 4 倍
- **新增「忽略电荷相互作用」开关**：engine.js `coulombState.on`，useSim `coulomb/setCoulomb`，Toolbar 按钮（电荷力 / 忽略电荷力）。关掉后电荷只受外加电场/磁场作用，做「粒子在电场中偏转」演示时避免同批电荷互斥干扰
- **交流电源样式**：电源 ac=1 时画高中课本符号（圆圈内正弦波 + ~ + 频率），中缝电场方向随穿缝次数奇偶翻转

## 电容器（第 18 轮）
- circuit.js：CIRCUIT_TYPES 加 'capacitor'；resistance 返回 0.1（ESR，储能元件不耗能）；solve 的电源分支判据扩为 `battery||plates||metalRod||capacitor`（capacitor 的 E=`props.U`，r=0.1）；缓存 key 补 `'C' + (props.U??0).toFixed(6)`（充放电电压变化必须触发重算）；功率分支 `power=(props.U)*i`（可负=放电，不计 totalPower）；open 断路过滤加 'capacitor'（充满后 I→0 正常）
- engine.js applyForces：金属棒段后插入电容积分段——`U = U - I·dt/Ceff`（前向欧拉，dt=1/60，`Ceff = (props.C??100)*1e-3` 放大 1000 倍把 μF 教学量级拉回秒级 τ）；I 取 solve(components).currents 的 capacitor 电流
- registry.js：capacitor 元件（defaults `{C:100, len:90, angle:90}`，fields C/len/angle，body:null，overlay=drawCircuit 两条平行竖线），label `C=…μF U=…V`
- 符号约定：电容 b 端（angle 方向 +len/2）= 参考正端，U=V_b−V_a；solve 电流 I=(V_a−V_b+U)/r；积分 dU/dt=−I/C 自洽。b 端接电源正极侧则 U 为正
- scripts/capacitor.mjs（8 断言）：串联 RC 回路 τ=(0.5+10+0.1)×0.1=1.06s，充电 U 0→5.98V 单调、稳态 I→1.89e-3A、放电短路电源后 U 5.98→0.015V
- 预设「电容充放电」：battery(E6,r0.5)+switch(闭合)+resistor(10Ω)+capacitor(100μF,angle180)，矩形串联环，τ≈1s 秒级可见

## 万有引力 / 行星运动（第 19 轮）
- engine.js applyForces：库仑力后加万有引力段——`F=GM·m/r²` 指向源（GM=(G??1)*(M??120) 教学值，rPx=max(hypot,20) 软化防 r→0 爆炸，Fm=F*FORCE_SCALE）
- **matter 0.19 没有 body.gravityScale**（grep 全库只在 Engine.js 用全局 gravity.scale）：所以「失重」靠施加反向力抵消全局重力，统一段在万有引力段之前，对所有 `props.g === 0` 的非静态 body 施加 `-mass*GRAV.y*GRAV.scale`
- registry.js：gravity 元件（defaults `{M:120,G:1,r:26}`，fields M/G，body:null，overlay 画发光恒星+光晕+M/G 标注）；ball 加 g 字段（重力 0=失重/1=受重力），g=0 时 body 加 frictionAir:0（真空中无空气阻力）
- 数值：GM=120，r=300px(3m) → 圆速度 v=√(GM/r)≈6.32 m/s，周期 2.98s；椭圆初速 4<6.32 → 近地点 75px、远地点 300px
- 预设：行星圆周运动、椭圆轨道；scripts/gravity.mjs（6 断言：圆轨道半径 294.5-305px 稳定、速率 6.22-6.44 恒定、椭圆远地点 300.1/近地点 75.9）
- 教训：metalRod 原有的 g=0 重力抵消与统一失重段**重复施力**（force 累加导致棒向上漂移），已删金属棒段内抵消逻辑

## 交互与电路修正 + 安培力（第 20 轮）
- 关对账：src/App.jsx 删 import MomentumPanel 与 `<MomentumPanel/>` 渲染（MomentumPanel.jsx 文件保留未删）
- 恒力持久绑定：engine.js 恒力段从「每帧 nearestTarget 重算」改为「`_target` 一旦确定不重算，目标失效/拖走才重新绑定」；useSim dragTo 里 `constantForce` 拖拽时 `delete o._target`；registry overlay 箭头+标注画在目标 body.position（跟随目标），虚线从元件连到目标
- 万有引力吸收：坠入恒星半径（`g.props.r ?? 26`）内时 setVelocity(0)+setPosition(停在表面)+continue，修穿心飞走 bug（原软化 rPx=max(hypot,20) 让物体穿过无碰撞体的恒星）
- 点电荷无碰撞：registry.js charge body options 改 `collisionFilter:{mask:0}`（删无效 gravityScale:0）——电荷失重本靠 engine 手动反向力，极板附着/感光屏钉住是 engine 手动几何检测，均不依赖 matter 碰撞
- 多用电表重做（真实还原高中实验用法）：mode 从字符串 'A' 改数字 0/1/2（Inspector 只支持 number+range，不支持 options 下拉）；drawCircuit 重画真实表盘（方形外壳+弧形刻度+红色指针按读数偏转 A满量程1A/V满量程10V/Ω满量程100Ω+档位字母+红黑表笔）；Ω 档接电阻显示 `R=XXΩ`，带电时 `R=XXΩ（带电！请断电）`，未接显示「表笔接电阻两端」
- **metalRod 电动势默认值 bug 修复**：circuit.js solve 两处（G/I 构建 + currents 回算）原用 `(e.props._eInst ?? e.props.E ?? 3)`，metalRod 无 E 字段 → `_eInst` undefined 时 E 落到 3 而非 0（静止杆被当 3V 电压源，I 错 1.2A 而非 2.4A）。已加 metalRod 分支 `(e.props._eInst ?? 0)`
- 新增预设「安培力通电导线」（电磁炮/导轨）：battery(E6,r0.5)+wire×2(len640)+metalRod(R2,angle90)+uniformB(bz2)；初始 I=6/2.5=2.4A、F=BIL=9.6N 加速、终速 v=E/(BL)=1.5m/s 反电动势平衡；scripts/ampere.mjs 6 断言全过
- 电路接线：battery 端子必须精确重合 wire 端点（≤12px 容差），「端子压线段中段」规则只对 metalRod 开放

## 磁铁磁感线 + 传送带旋转（第 21 轮）
- 磁铁 S 极磁感线不显示：根因是 drawFieldLines 的场强截断阈值 `f.mag < 1e-3` 太严——偶极场 1/r³ 衰减，外部磁感线（绕回 S 极的弧，最远点距磁铁 100-300px 处场强仅 1e-4~1e-5）在到达 S 极前就「场弱」断开。修复：①阈值降到 1e-5；②出射角从全 360° 改为「朝向 S 极的半球」`spread = π/2 + (k/(n-1))·π`（90°→270°）——背向 S 的正前方场线是最外层磁感线，偶极场里绕太远必然衰减断掉，排除后 8 条线全部回到 S 极
- 磁铁填充色与极性标注对齐：原 overlay 红填左半边却标 N 在右、蓝填右半边却标 S 在左（磁场模型 N 在 +len/2、S 在 −len/2）→ 交换填充色（左半边蓝=S、右半边红=N）
- 传送带旋转功能：conveyor 加 `angle` 字段（0-60°，正=右端低）；body 从 rectangle 改 rotRect；overlay 支架腿竖直不旋转、带体/滚筒/花纹/箭头随带面 rotate；倾斜带面走 contactIncline（incline.js 扩展识别 conveyor，带面=中心线沿上方法线上移半高 8），frictionForce 里倾斜传送带摩擦取「相对皮带」速度（belt 正=沿带向下）带动物体
- scripts/belt.mjs 10 断言全过（接触检测/摩擦方向/水平带速回归/倾斜带速端到端）；预设新增「倾斜传送带」

## 全方位打磨（第 22 轮：逻辑 + 设计）
### 逻辑修复（都会改变行为，勿回退）
- **重置不清运行时状态（最严重）**：原来的 reset() 只把刚体搬回 home，`props._Q`/`props.U`/`body._attached`/`_photographed`/`_cyc`/`_crossings`/`_t`/`_target`/`_eInst` 全留着 → 极板带着电荷、电容带着电压、附着在极板上的电荷被 setStatic 钉死永远解不开。engine.js 新增导出 `resetRuntime(components)`：清对象级与 props 级的 `_` 前缀字段（白名单 `KEEP_KEYS={_par,_a,_b}` 保留摆放结构）→ 极板 U 还原成 `component.init.U`（spawn 时记的放置值）、其它 `delete props.U` → 删 body 上的运行态标记 → `charge && body.isStatic` 时 `setStatic(false)`。useSim.reset() 第一行调用它。scripts/reset.mjs 20 断言
- **dragTo 不进撤销栈**：`dragIdRef` 记录当前拖拽手势，`dragTo` 首次进入时 pushHistory 一次、SimCanvas 的 finish() 调 `endDrag()` 重置 → 一次拖拽 = 一个撤销点
- **改长度（len）不同步刚体**：Inspector 拉长度滑杆时「一端依附」分支只改 `o.x/o.y`，body 留在原地 → 导线改长度后视觉/物理脱节。用 `geoShift` 把新坐标带进重建刚体的流程，重建后回写 o.x/o.y/home
- **角度单位错位**：`snapToIncline()` 返回弧度（给刚体 setAngle），而 `props.angle` 全项目存**度数**（Inspector 滑杆、presets、撤销快照）。spawn 原样 `p.angle = angle` → 斜面吸附后 props.angle 变成 0.52（被当 0.52°）。spawn 里统一换算 `p.angle = angle*180/Math.PI`；scripts/incline.mjs 补 4 条断言钉住这个约定
### 设计改进
- **元件栏分类 tab**（Pallete.jsx）：原来 39 个按钮挤在一条横向滚动条里，预设下拉被挤到看不见。现在四个 tab（力学/电磁/电路/光学 + 未分组进「其他」），只渲染当前分类；`useEffect` 跟随当前选中工具自动切 tab；≥1100px 宽屏用 CSS 撤销 tab、四组平铺（`@media (min-width:1100px){.pal-tabs{display:none}.pal-group.hidden{display:flex}}`）
- **顶栏减负**（Toolbar.jsx）：受力/磁感线/重力/电荷力四个开关收进 `👁 显示` 弹出面板（.disp-menu，点外部或 Esc 收起）。角标只统计**偏离默认**的项（失重、忽略电荷力、关受力、关磁感线），默认状态顶栏干净
- **Inspector 重复角度滑杆**（Inspector.jsx）：22 个元件的 fields 里本就有 angle，ROTATABLE 又额外渲染一个 → 两个角度滑杆。条件改为 `ROTATABLE.has(type) && !fields.some(f=>f.key==='angle')`
### UI 验收记录（ego-browser 实测）
1280px 无 tab 四组平铺；430px tab 正常切换；`.disp-menu` 展开正常；预设「电容充放电」运行 2.5s 后 P=0.03W，点重置 → ⏱0.00s、P 回到 3.20W（电容电压确实被清空）；拖拽物块后撤销按钮由 disabled 变可用并成功回退

## 已知遗留 / 下一步建议
- ~~磁铁调角度时可能与极性标注分离~~ 已修复：useSim.js 重建刚体时静态元件 setAngle 被清零，已统一传 ang
- ~~电压表内接/外接误差演示、电桥、变阻器分压接法：未做~~ 已完成：4 个新预设（电压表外接/内接、惠斯通电桥、变阻器分压）+ scripts/circuits2.mjs 15 断言（外接 Iv=5.85e-6、电桥平衡 Ig=0/失衡 Ig=0.0346、分压 I载=0.1935）
- wire 误报「无电流（断路）」已修复：circuit.js open-circuit 过滤加入 wire（导线 1e-3Ω 压降 0 属正常）
- presets.js 曾有 串联电路/并联电路 重复键，已删
- 光学四元件（lightSource/mirror/lens/screen + optics.js 光线追迹）已实现但用户说"暂时不做"——还在面板里，去留待定
- ~~金属导轨 rail~~ 已删除，替代为「金属棒」（可运动、导电、切割磁感线）
- 回旋加速器出盒有轻微圆心漂移（教学可接受）；出盒判定 |dy|<gap/2 时 EXIT
- 移动端布局在很矮的屏（<560px）会隐藏动量面板
- preset「回旋加速器」vmax 断言只是冒烟（检查不 NaN/不飞出），无精确轨迹断言

## 验收方式
- 数值验证：node scripts/*.mjs 直接断言（理论值对比，参考现有脚本写法）
- UI 冒烟：scripts/runtime.mjs（happy-dom 21.0.4 + Proxy 假 canvas ctx；shims: ResizeObserver/location/history/navigator(Object.defineProperty)/matchMedia）
- 用户真机：http://192.168.3.4:8090（手机同局域网）
