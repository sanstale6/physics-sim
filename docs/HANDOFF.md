# 高中物理模拟器 · 交接文档

> 写给下一个会话 / 下一位开发者。读完这份 + docs/DESIGN.md + README.md 即可接手。

## 项目概览
- 路径：/root/workspace/physics-sim（Vite 8.3.6 + React 19.3.1 + matter-js 0.20.0，pnpm）
- 仓库：github.com/sanstale6/physics-sim（main，最新 commit 4a3147a）
- 定位：2D 物理沙盘，真题图元风格（简约线条），玩家自由放置元件观察现象
- 部署：纯静态 dist/，`pnpm build` 后任意静态托管（本地用 `npx serve dist -l 8090`，已 setsid 常驻，serve 直读 dist、重建即生效）。局域网 http://192.168.3.4:8090
- 目标：无 server 依赖，可 Vercel/Netlify/GH Pages（vercel.json 已提交）

## 常用命令
```
pnpm build          # 构建
pnpm exec oxlint src  # lint（~53 warnings 0 errors，warnings 是 React Compiler 提示，无害）
pnpm test           # 全链回归（14 个脚本，见下）
```
测试链 = bodies/charged/regression/incline/fields/track/rope/pendulum/spring/presets(37)/draw/parallel/runtime(happy-dom 冒烟)/cyc，共 100+ 断言。
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
- 磁场（匀强 B / 条形磁铁）：不用洛伦兹力，每步把速度矢量精确旋转 φ=ω/60（ω=qB/m），大角时弦补偿 push=R(1−cos(φ/2))
- 电场（uniformE/plates）：跳蛙法 kick-drift-kick（两半步 kick），比 applyForce 一次更准
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

## 已知遗留 / 下一步建议
- ~~磁铁调角度时可能与极性标注分离~~ 已修复：useSim.js 重建刚体时静态元件 setAngle 被清零，已统一传 ang
- ~~电压表内接/外接误差演示、电桥、变阻器分压接法：未做~~ 已完成：4 个新预设（电压表外接/内接、惠斯通电桥、变阻器分压）+ scripts/circuits2.mjs 15 断言（外接 Iv=5.85e-6、电桥平衡 Ig=0/失衡 Ig=0.0346、分压 I载=0.1935）
- wire 误报「无电流（断路）」已修复：circuit.js open-circuit 过滤加入 wire（导线 1e-3Ω 压降 0 属正常）
- presets.js 曾有 串联电路/并联电路 重复键，已删
- 光学四元件（lightSource/mirror/lens/screen + optics.js 光线追迹）已实现但用户说"暂时不做"——还在面板里，去留待定
- 回旋加速器出盒有轻微圆心漂移（教学可接受）；出盒判定 |dy|<gap/2 时 EXIT
- 移动端布局在很矮的屏（<560px）会隐藏动量面板
- preset「回旋加速器」vmax 断言只是冒烟（检查不 NaN/不飞出），无精确轨迹断言

## 验收方式
- 数值验证：node scripts/*.mjs 直接断言（理论值对比，参考现有脚本写法）
- UI 冒烟：scripts/runtime.mjs（happy-dom 21.0.4 + Proxy 假 canvas ctx；shims: ResizeObserver/location/history/navigator(Object.defineProperty)/matchMedia）
- 用户真机：http://192.168.3.4:8090（手机同局域网）
