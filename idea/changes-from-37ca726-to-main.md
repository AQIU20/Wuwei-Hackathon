# `37ca726661893d9e769b32c778df531e8c1d7352` 到当前 `main` 的变更文档

## 范围

- 起点提交：`37ca726661893d9e769b32c778df531e8c1d7352`
- 终点分支：`main`
- 当前 `main` HEAD：`3a5f575f7614873e4e0efcbfaebbeffa658c1d28`
- 时间范围：2026-04-06

说明：
- 区间内共有 7 个提交。
- 其中 `bca5d19` 是 merge commit，本身不引入独立业务改动，主要作用是把 `94b424a` 合入主线。

## 总体结论

这一段提交主要完成了 `web/` 子项目从无到有、再到多轮界面和内容迭代的过程，主线可以概括为：

1. 新增 `web/` 官网子项目，落地基础页面、组件、聊天 API 和中英文能力。
2. 把早期单页结构扩展为多页面站点，补齐导航、文档页、开发者页、3D logo 和场景图库。
3. 将站点整体视觉从深色发光风格切换为白色极简风格。
4. 为 Landing 页引入 3D room、场景画廊重排、交互特效更新。
5. 用更完整的外部 CSS 3D room 方案替换早期的简化实现。
6. 重构 Landing 布局，并把 Docs 页面改写为更贴近真实系统架构的说明文档。

## 提交时间线

### 1. `94b424a`

标题：`feat(web): add unforce-make landing page as web/ subdirectory`

这是整个区间里最关键的初始化提交，直接把 `web/` 子项目加进仓库。

主要改动：
- 新增 `web/` 目录及完整 Next.js 项目结构。
- 新增 `web/app/api/chat/route.ts`，接入聊天接口。
- 新增一批基础组件：
  - `AgentPanel.tsx`
  - `DeveloperPanel.tsx`
  - `Landing.tsx`
  - `LanguageToggle.tsx`
  - `MagneticButton.tsx`
  - `SpotlightCard.tsx`
  - `Tabs.tsx`
  - `CursorSpotlight.tsx`
- 新增全局样式、布局、首页入口、配置文件和静态资源。
- 新增 `web/lib/i18n.tsx`，提供中英文文案能力。

影响：
- 仓库第一次拥有可独立运行的 `web` 前端。
- 功能上已经覆盖落地页、Agent 面板、开发者面板和双语支持。

### 2. `bca5d19`

标题：`Merge pull request #1 from yue-tsukiii/feat/landing-web`

说明：
- 这是合并 `94b424a` 的 merge commit。
- 从内容上看，没有超出 `94b424a` 之外的额外业务变更。

### 3. `4917b37`

标题：`feat(web): sync latest website to web/ + update repo README`

这是第一次大规模升级，把初版站点扩展成更完整的多页面官网。

主要改动：
- 页面结构扩展为多页：
  - Landing
  - Agent
  - Dev
  - Docs
- 新增页面入口：
  - `web/app/agent/page.tsx`
  - `web/app/dev/page.tsx`
- 新增核心组件：
  - `DocsPage.tsx`
  - `FloatingBlocks.tsx`
  - `Footer.tsx`
  - `Logo3D.tsx`
  - `Nav.tsx`
  - `Shell.tsx`
- `DeveloperPanel.tsx` 重命名并重构为 `DevHub.tsx`。
- `Landing.tsx` 大幅重写。
- 新增多张场景图片素材和品牌相关 logo 资源。
- 更新根目录 `README.md`，补充仓库结构和规划。
- 删除旧的 `web/README.md` 和 `Tabs.tsx`。

影响：
- 站点从“功能原型”升级为“有信息架构的官网”。
- 视觉层面开始引入更明确的品牌表达和展示型内容。

### 4. `43e8c8d`

标题：`style(web): switch to white minimalist theme`

这次提交主要是整站视觉风格切换。

主要改动：
- 页面背景改为白色，文本改为深色。
- 移除深色背景下的发光和渐变氛围。
- `Shell.tsx` 中去掉 `CursorSpotlight` 的鼠标跟随光效。
- 调整多个组件中的文字、边框、透明背景配色，使其适配白底。
- 更新 `globals.css`：
  - 去掉原有背景渐变
  - 改为白色背景
  - 调整滚动条样式
- 调整 `FloatingBlocks.tsx` 的颜色，提升在白底上的可见性。

影响：
- 官网从偏“炫技演示”的视觉语言转向更克制、更现代的白色极简风格。

### 5. `92a64d6`

标题：`feat(web): add isometric room, falling debris effect, scene gallery redesign`

这次提交开始强化 Landing 页的空间表达和动效设计。

主要改动：
- 新增 `web/app/components/IsometricRoom.tsx`：
  - 使用 CSS 3D 构建等距房间视觉。
- 更新 `Landing.tsx`：
  - 重新设计场景画廊布局
  - 用中心圆 + 周边卡片的方式组织内容
- 更新 `Logo3D.tsx`：
  - 点击后的特效从“爆炸”改成更柔和的“碎片下落”
- 更新 `LanguageToggle.tsx` 和 `MagneticButton.tsx`：
  - 去掉渐变，改成更统一的纯橙色表达
- `Nav.tsx` 改用 `logo-orange.svg`

影响：
- Landing 页更强调“智能空间”这一主题。
- 视觉和交互风格更接近品牌化展示，而不是纯技术 Demo。

### 6. `c9a2e1b`

标题：`feat(web): update slogan & replace 3D room with BhaskarAcharjee version`

这次提交对上一版的 3D room 做了方案替换。

主要改动：
- 更新中英文 slogan：
  - 中文改为“拼硬件如叠积木，用智能若话知音”
  - 英文改为 “Stack the blocks. The room gets you.”
- `IsometricRoom.tsx` 不再沿用前一个提交中的简化 3D 实现。
- 新增外部风格的完整 3D room 静态资源：
  - `web/public/3d-room/index.html`
  - `web/public/3d-room/style.css`
- 页面改为通过 iframe 使用这套更完整的 CSS 3D room。
- 增加房间视角的鼠标交互。

影响：
- 3D room 从“自绘简版组件”切换为“完整静态场景嵌入”。
- Landing 页空间感和完成度明显增强。

### 7. `3a5f575`

标题：`feat(web): recolor 3D room, restructure layout, rewrite dev docs`

这是当前 `main` 上的最新提交，重点是整理已有内容，使其更统一、更可读。

主要改动：
- 重配 `web/public/3d-room/style.css` 的色彩：
  - 从紫蓝色系切换为灰、白、橙色系
  - 去掉房间阴影
  - 调整为适配白色页面背景的透明效果
- 再次调整 `Landing.tsx`：
  - 模块展示改成更紧凑的横向条带
  - 智能空间部分改为左右分栏
  - 左侧 3D room，右侧 scenes
- 大幅重写 `DocsPage.tsx`：
  - 不再停留于宣传式介绍
  - 改为围绕真实系统组成进行说明
  - 包括桌面 Agent、provider system、memory system、hardware tools、web API、capability schema、quickstart 等内容
- 精简 `web/lib/i18n.tsx` 中一部分旧文案

影响：
- Landing 页的信息组织更清晰。
- Docs 页从“展示内容”升级为“可对外解释系统架构的文档页面”。

## 按阶段看演进

### 阶段一：初始化 `web/` 子项目

对应提交：
- `94b424a`
- `bca5d19`

阶段结果：
- 项目中新增独立 `web` 前端。
- 具备基础页面、基础组件、聊天 API 和双语能力。

### 阶段二：从原型站点升级为多页面官网

对应提交：
- `4917b37`

阶段结果：
- 信息架构更完整。
- 页面职责更明确。
- 品牌资源、3D 视觉和场景图库开始进入主视觉。

### 阶段三：视觉风格统一到白色极简主题

对应提交：
- `43e8c8d`

阶段结果：
- 整站从深色科技风切换到白色现代风。
- 视觉噪音减少，信息可读性提升。

### 阶段四：Landing 页连续迭代

对应提交：
- `92a64d6`
- `c9a2e1b`
- `3a5f575`

阶段结果：
- 3D room 从自定义简化实现，演进为完整静态场景嵌入。
- Landing 布局从普通展示进一步演化为更明确的“智能空间”叙事。
- 品牌文案、场景区布局和视觉色彩逐步统一。

## 最终落地产物概览

从 `37ca726...` 到当前 `main`，最终新增或显著演进的内容包括：

- 新的 `web/` 子项目
- 聊天 API
- Landing / Agent / Dev / Docs 多页面结构
- 导航、页脚、Shell 等站点基础骨架
- 3D logo 和动态展示组件
- 3D room 静态场景
- 场景图库图片资源
- 中英文文案系统
- 更贴近真实能力边界的文档页内容

## 总体评价

这段提交不是零散修补，而是一条连续的产品化演进路径：

- 前半段解决“站点是否存在、结构是否完整”的问题。
- 中段解决“视觉风格是否统一”的问题。
- 后半段集中优化 Landing 的核心表达，并把 Docs 从宣传页推进到架构说明页。

如果后续需要继续梳理，可以再补两份配套文档：

- 一份按文件维度的演进文档，重点看 `Landing.tsx`、`DocsPage.tsx`、`i18n.tsx`
- 一份按主题维度的演进文档，拆成“信息架构、视觉系统、交互系统、内容系统”四条线
