# 沟通胶囊 V1.0 技术设计文档

## 1. 技术目标

开发一个可以直接安装到 Windows 的桌面应用。

V1 技术目标优先级：

1.  稳定
2.  简单
3.  本地运行
4.  快速响应
5.  跨应用文本操作
6.  易于 AI Agent 持续开发

## 2. 建议技术路线

推荐使用：

-   Electron + TypeScript
-   React
-   SQLite
-   Vite
-   Windows 原生 API / Electron API
-   electron-builder 用于 Windows 安装包

原因： - Windows 桌面能力成熟 - React 适合快速开发 UI - TypeScript 方便
AI 编程 Agent 理解项目 - SQLite 适合本地单机数据 - Electron
对悬浮窗、全局快捷键、剪贴板等能力支持成熟

如果开发 Agent 有明确理由，也可以选择 Tauri，但除非团队熟悉 Rust，否则
V1 不建议为了追求体积而增加技术复杂度。

## 3. 总体架构

应用分为：

### Renderer

负责： - UI - 搜索 - 胶囊展示 - 编辑 - 删除 - 设置

### Main Process

负责： - 窗口管理 - 全局快捷键 - 系统托盘 - 启动设置 - 跨应用操作 -
与本地数据库通信

### Database

SQLite 本地数据库。

## 4. 建议目录

src/ - main/ - main.ts - window.ts - shortcuts.ts - tray.ts -
clipboard.ts - insertion.ts - renderer/ - App.tsx - components/ -
CapsuleLauncher.tsx - SearchBox.tsx - CapsuleCard.tsx -
CapsuleList.tsx - EditCapsule.tsx - Settings.tsx - styles/ - db/ -
database.ts - capsuleRepository.ts - settingsRepository.ts - shared/ -
types.ts - constants.ts

tests/

## 5. 数据库

### capsules

id: INTEGER PRIMARY KEY

content: TEXT NOT NULL

color: TEXT NOT NULL

created_at: INTEGER NOT NULL

updated_at: INTEGER NOT NULL

### settings

key: TEXT PRIMARY KEY

value: TEXT NOT NULL

## 6. 搜索

V1 可先使用 SQLite LIKE 查询。

例如： SELECT \* FROM capsules WHERE content LIKE ? ORDER BY updated_at
DESC LIMIT 5;

当数据规模很大时再考虑 SQLite FTS5。

不要在 V1 为了几十/几百条话术引入复杂搜索基础设施。

## 7. 全局快捷键

必须支持： - 唤起 - 新增 - 替换

快捷键由设置保存。

应用启动时： 1. 读取配置 2. 注册快捷键 3. 如果冲突，提示用户 4. 允许修改

快捷键不能写死。

## 8. 获取选中文本

新增/替换需要获取当前其他应用中用户选中的文字。

建议实现策略：

1.  用户触发快捷键
2.  保存当前剪贴板内容
3.  模拟 Ctrl+C
4.  读取剪贴板
5.  恢复原剪贴板
6.  将获取到的文本传给应用

注意： - 不应永久占用用户剪贴板 - 应尽量恢复原内容 -
需要处理没有选中文本的情况 - 不同应用对 Ctrl+C 的响应可能不同

这是 V1 跨应用兼容性的核心风险点之一。

## 9. 跨应用文本插入

推荐优先方案：

1.  将胶囊文本写入剪贴板
2.  将焦点交给用户当前目标输入框
3.  模拟 Ctrl+V
4.  恢复用户原剪贴板

如果采用真实拖拽： - 尝试实现系统拖放 - 但必须提供双击/复制粘贴备用路径

重要： V1 不得自动发送消息。

## 10. 悬浮窗口

要求： - frameless - transparent/rounded visual - alwaysOnTop - 可拖动 -
右上角默认定位 - 不应成为传统任务栏窗口 - 支持隐藏/显示

需要处理： - 多显示器 - 分辨率变化 - DPI scaling - 窗口位置保存

## 11. 系统托盘

建议提供： - 显示/隐藏 - 设置 - 退出

应用关闭主窗口时默认不要直接退出后台。

## 12. 开机启动

设置中提供： - 开启 - 关闭

默认可选择开启，但第一次运行应符合 Windows 用户预期。

## 13. 隐私

V1 不需要服务器。

原则： - 本地数据库 - 不上传内容 - 不采集聊天记录 - 不发送分析数据 -
不接入第三方聊天平台账号

## 14. 安全

-   Electron 启用 contextIsolation
-   禁止 renderer 任意访问 Node.js
-   使用 preload 暴露有限 API
-   IPC 做参数校验
-   数据库操作统一经过 repository/service
-   不允许 UI 直接操作 SQLite 文件

## 15. 安装

使用 electron-builder。

目标： - Windows x64 - 标准 .exe 安装程序 -
安装后创建桌面/开始菜单入口 - 支持卸载

V1 可以先只支持 Windows 10/11。

## 16. 更新

V1 不强制实现自动更新。

如果实现自动更新，应独立于核心业务逻辑，不影响离线使用。

## 17. 日志

本地记录必要错误日志。

不要记录： - 用户全部话术 - 第三方聊天内容 - 剪贴板完整历史

## 18. 关键风险

### 风险 1：跨应用选中文字

不同软件可能对 Ctrl+C、权限、输入法存在差异。

### 风险 2：跨应用插入

不同软件输入框可能使用不同 UI 技术。

### 风险 3：拖拽

"拖到任何软件都能成功"不应作为 V1 的绝对承诺。

因此： \> V1 产品体验要求支持拖拽，但技术上必须准备可靠的备用插入方案。

### 风险 4：全局快捷键冲突

必须检测冲突。

## 19. MVP 技术验收

第一阶段不要一次开发全部功能。

建议先验证：

P0： 1. Electron Windows 应用启动 2. 悬浮窗口 3. 全局唤起 4. SQLite 5.
新增 6. 搜索 7. 展示胶囊

P1： 8. 编辑 9. 删除 10. 快捷键设置 11. 选中文字保存 12. 文本插入

P2： 13. 替换 14. 拖拽 15. 开机启动 16. 多显示器/位置保存 17. 安装包

## 20. 开发 Agent 原则

AI Agent 开发时必须： - 每完成一个功能运行测试 -
不要一次性生成整个系统 - 优先完成可运行 MVP - 不随意增加产品需求 -
遇到技术问题先寻找最简单可靠方案 - 不为了"看起来高级"增加复杂依赖 -
所有核心行为写自动化测试或最少人工验收步骤 -
修改已有功能前先理解当前代码 - 保持模块边界清晰

## 21. 完成定义

开发 Agent 只有在以下条件全部满足后，才认为 V1 完成：

-   可以安装
-   可以启动
-   可以常驻后台
-   可以唤起悬浮胶囊
-   可以新增
-   可以搜索
-   可以预览
-   可以拖拽/备用方式插入
-   不自动发送
-   可以编辑
-   可以删除
-   可以替换
-   快捷键可以自定义
-   数据重启后仍存在
-   无网络也可以正常工作

## 22. 迭代变更汇总（按实际开发记录整理）

### 跨应用插入

- 新增 `InsertEngine`，统一执行 Clipboard + Ctrl+V 注入：
  1. 保存原剪贴板快照；
  2. 写入胶囊文本；
  3. 隐藏或失焦沟通胶囊；
  4. 恢复目标前台窗口；
  5. 模拟 Ctrl+V；
  6. 恢复原剪贴板。
- 不再依赖 Slack/Boss 网页的 drop 接口；拖拽只作为 UI 交互，注入最终走插入引擎。
- 单击胶囊是可靠插入/兜底路径。

### TargetWindowTracker

- 新增 Windows 前台窗口跟踪器，持续监听当前前台窗口。
- 记录最近一个“非沟通胶囊自身窗口”的前台窗口，结构包含：hwnd、processId、processName、title、timestamp。
- 当前前台窗口是沟通胶囊自身或 Tooltip 窗口时不更新目标窗口。
- 单击插入使用 TargetWindowTracker 的最近目标窗口，不使用旧的缓存目标。
- 不写死 Slack、Boss 直聘、微信。

### 窗口管理

- 收起态窗口：64×32，无边框、透明、置顶、不显示任务栏、默认右上角 20px。
- 展开态窗口：可调整大小，右下角缩放把手；最小 280×240。
- 收起态和展开态切换时动态控制 `resizable`、`minimumSize`。
- 优先使用 `showInactive()` 与 `focusable: false` 降低抢焦点风险。
- Tooltip 使用独立透明小窗口承载“打开聊天胶囊”，其 HWND 同样加入自身窗口排除集合。
- 右键菜单：打开聊天胶囊、置顶/取消置顶、设置、退出。

### 本地状态

- 收起胶囊位置曾使用 `localStorage.capsule_position`，多显示器按 workArea 约束。
- 展开面板尺寸使用 `localStorage.capsule_panel_size` 记忆，收起后重新打开恢复。
- 已知问题：位置恢复曾导致启动窗口异常，当前先强制默认右上角，位置恢复方案待重新设计。

### 数据库与排序

- capsules 表新增 `sort_order`，旧库启动时自动迁移。
- 新增 `reorderCapsules`、`deleteCapsule` 数据操作。
- 列表按 `sort_order ASC, id ASC` 返回。

### 其他实现记录

- 搜索支持传入 limit；界面固定显示约 7 条并滚动查看，因此实际请求一次加载更多。
- 缩放拖动使用 Pointer Capture，避免鼠标移出窗口后无法缩小面板。
- 打开面板时主进程主动隐藏 Tooltip，避免“打开聊天胶囊”提示残留桌面。
