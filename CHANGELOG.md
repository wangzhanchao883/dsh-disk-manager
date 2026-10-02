# Changelog

## 0.1.3 (2026-10-02)

**发布通道迁移 —— 无代码变更、无行为变更。**

改用 npm Trusted Publishing（GitHub Actions + OIDC）发布，不再依赖任何长期令牌。
本版本用于验证新的发布链路，并让该版本带上 provenance（可验证的来源证明）。

## 0.1.2 (2026-09-29)

**兼容 DSH 0.2 / DSH 0.2 compatibility**(本机在 `0.2.0-rc.1` 实测通过)。**无代码变更。**

- **`peerDependencies` 上界抬高**:`@deepseek-ai/dsh-tools` 由
  `>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0`
  改为 `>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0`。
  原因:旧上界 `<0.2.0-0` 的语义是「排除 0.2.0 的**全部**预发布」,而 DSH 的门禁比的是**整个 DSH 的版本号**
  (与 `dsh-tools` 这个包实际装的是哪版无关),于是插件在 `plugin add` 时被直接 `installation rejected` +
  `nothing was installed`。0.1.7 只是启动期 `skipping` 跳过,0.2.0 把门禁提前到了安装期硬拒。
- **必须补显式预发布分支**:node-semver 规定「带预发布标签的版本,只有范围内存在**同一 major.minor.patch
  元组**、且自身带预发布标签的比较符时才放行」。所以单写 `>=0.1.0-rc.1 <0.3.0-0` 会**静默漏掉**
  `0.2.0-rc.1` —— 必须把 `>=0.2.0-rc.1 <0.3.0-0` 显式写出来。
- **实测结论**(隔离环境,未改动使用中的 DSH):改后 `0.2.0-rc.1` 通过门禁、可直接 `plugin add` 装入并激活,
  启动 stderr 无 `skipping`/`did not activate`,host 工具与浏览器端设置页(`configForms`)均正常工作。
- **代码零改动**:host 侧 `index.mjs`、浏览器侧 `client.js`、`Config` schema 全部未动;0.1.7 上的行为不受影响。

### 未随版本发布的文档更正(0.1.1 期间)

- **文档更正(仅表述,无代码变更)**:0.1.1 的 CHANGELOG 与 README 曾把对话里的命令结果写成"对话视图不渲染该
  command 节点"——**这是错的**。实测(用户在 0.1.7-rc.2 线上点按钮后的截图)它渲染成**一条可折叠的流程节点**
  (`⌄ disk_scan · …完成`,点开可见全文);当时判"不渲染"是因为隔离实例的页面停在另一个会话/草稿上、看到空白界面就
  反推了结论。npm 上已发布的 `0.1.1` tarball 仍是旧表述,仓库内已改正。

## 0.1.1 (2026-09-26)

**适配 DSH 0.1.7 设置契约**(针对 0.1.5-rc.1 → 0.1.7-rc.2 的破坏性变更)。

- **host 侧**:去掉 `settings.register(ns, schema, {base})` + `scope.get()` + `scope.watch()` 三连(0.1.7 已无此 API),改为 `export const Config` 声明可写字段 + `settings.describe()` 按需重读。
  - 6 个字段全部标 `.volatile()`(含数组字段 `drives`);漏标会被 `describe()` **静默过滤**,整个设置条目消失、不打任何日志。
  - 加 `vol()` 降级包装:老版 schemastery 无 `.volatile()` 时不炸。
  - 依赖 `@deepseek-ai/schemastery` `^3.18.1` → `^3.18.4`(`.volatile()` 需 ≥3.18.4,否则模块加载期即崩)。
- **客户端**:`ctx.settingsScope.bind({namespace})` → `ctx.configForms.get("<条目 id>")`(0.1.7 把 `settingsScope` 服务整个移除);inject 同步换名。快照结构与 `getSnapshot()/subscribe()/set()` 签名两版一致 → 组件体未改。
- **浏览器端声明**:`dsh.client.inject` 去掉 `@deepseek-ai/dsh-client-runtime`(0.1.7 已无该包)。
- **修正既有 bug**:旧 `fromFlat()` 在每次同步设置时会把 schema 里没有的 `scanRoots`/`blacklist` 重置回默认值,冲掉用户在 `config.json` 里的自定义。改为只合并设置中真实存在的 6 个字段(`pickSettings()`)。
- **合并未提交改进**:设置页「开始扫描C盘」按钮原先走 `connection.api.sessions.prompt()`,该 API 自 DSH 0.1.5-rc.1 起已不存在 → 改用 `remote.commands.execute()`;并加入「优先投递到非空白会话」的选靶逻辑与扫描完成回显。
- **修正设置页选盘"看起来没选上"**:`configForms` 的写入要一个宿主来回(实测约 1.4 秒),这段时间受控 `<select>` 会把用户刚选的值弹回旧值 → 加**乐观回显**(本地先用所选值渲染,宿主视图追上后自动撤掉);同时 `set()` 返回 `false`(宿主拒收)时不再假报"已保存",改为红字报错。
- **修正扫描按钮"发起了但永远看不到结果"**:旧代码用 20 秒 `Promise.race` 把 RPC 回执丢掉 —— 整盘扫描要 3~4 分钟,超时后只显示"已发起扫描",后续结果(以及"宿主根本没受理")被静默吞掉。现在全程等待,并在面板里:
  - 持续显示「扫描中…(目标对话 + 会话 id + 已用 Ns)」,90 秒未受理给明确提示;
  - 取到报告文本后**直接渲染在设置页**(`<pre>` 可滚动),对话里那份仍由 host 写;
  - 区分「宿主未受理(value `undefined`)」「执行失败(ok:false)」「无文本」三种结局,各自给可读提示。
- **修正选靶与连接时效**:`dsh-api-session-controller` 的列表快照是 `{ids, byId, phase}`,**没有 `current` 字段**,旧代码的"当前会话"分支恒不命中 → 显式按"最近更新过的非空白会话"选靶,并把目标会话标题 + id 前 8 位显示出来;`remote.commands`/`sessions` 服务引用改为**每次点击现取**,避免插件 apply 时抓到的引用在页面重连/实例重启后失效(表现为"已发起扫描但什么都没发生")。
- 版本兼容:peer 区间 `>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0` 经 semver 实算满足 `0.1.7-rc.2`,**未改**。
- **修正 LLM 兜底是死代码**:`core/classify.mjs` 原先调 `ctx.llm.call(prompt)` —— 0.1.7 的 llm 服务只有 `stream()`,**没有 `call()`**,于是每次都走 catch、静默降级成"需人工确认"(而 README 写着"LLM 兜底分类")。现在改走真实通道 `ctx.llm.stream()`:
  - 模型路由:优先宿主的 agent 默认模型(`ctx.agentDefaultModel.currentSelection()`),退而取第一个可用 provider 的第一个模型;都没有则照旧降级为人工确认;
  - 按项目规则**默认关闭推理**(`reasoningEffort: "off"`)+ `maxTokens: 2000` —— 推理 token 与正文共享预算,带推理会把 JSON 挤没;
  - 消息用惰性可选导入的官方 `createUserMessage`,失败则退化成等价结构(缺依赖不瘫痪)。
- **设置页盘符改为真实检测值**:新增只读路由 `GET /dsh-disk-manager/drives`(宿主 `webServer.register`),设置页下拉改为拉这条路由;原先硬编码 `C~H`,本机只有 C/D 也会列出不存在的 E~H。路由不可用时保留兜底列表。
- **清理发布面**:删掉 `package.json` 里指向已删除文件的 `scripts`(`dev`/`dev:auto` → `dev-run.mjs` 早被清理);README「开发」章节改写为 link 安装 + 隔离实例联调;`presentCall.kind` 由非法值 `"text"` 改为 0.1.7 `ToolCallKind` 内的 `"other"`。
- **对话里的呈现方式**:`remote.commands.execute()` 的结果由 host 写进会话日志(`command/run` + `command/done`,含完整报告),在对话里渲染成**一条可折叠的流程节点**(`⌄ disk_scan · …扫描完成`,点开看全文);0.1.1 起设置页面板**另外**把同一份报告直接渲染出来,省去展开。想在对话里看到报告也可以走工具路径(`disk_scan`)。

## 0.1.0 (2026-09-05)

- 首个发布版:C盘空间规划整理大师。
- 扫描整 C 盘,按 A/B/C/D/E/P 分类每个大空间,LLM 兜底 + 人工确认,支持删/搬/改址,带强红线与 dry-run/undo。
- 新增 Web 设置页("开始扫描C盘"按钮 + 一句话总结)。
- 修复冷废弃(D)误判:进程在跑/常用白名单的软件永不判废弃。
