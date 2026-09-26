/* dsh-disk-manager client bundle — Web 设置页。
 * 以经典脚本形式注册到 window.__ModuleLoader__;工厂内用 require 取 React,
 * 不能用 JSX(无构建步骤),一律 React.createElement。
 * 说明:扫描/分类/执行由模型驱动的工具(disk_scan/disk_preview/disk_execute)
 *       在对话里呈现与确认;本页负责用户配置(目标盘/启用)。
 * 0.1.7 变更:客户端设置服务 `settingsScope` 被整体移除,改用 `configForms`;
 *       host 侧不再注册 schema,改由 `export const Config` 声明字段。 */
window.__ModuleLoader__.load({
  id: "dsh-disk-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = "settings.diskManager";
    const SETTINGS_NAMESPACE = "dsh-disk-manager";

    const zh = {
      nav: "C盘空间规划整理大师",
      loading: "正在读取配置…",
      unavailable: "配置面板不可用(设置服务未挂载)。请直接编辑配置文件 ~/.dsh-disk-manager/config.json。",
      saved: "已保存",
      error: "保存失败:",
      general: "通用设置",
      enabled: "启用C盘空间规划整理大师",
      enabledHint: "关闭后不再提供C盘扫描/清理工具",
      targetDrive: "将C盘缓存数据搬迁到的新盘符",
      targetDriveHint: "选择要把缓存/数据搬到的盘(如 D)。下拉框只列出检测到的盘符,避免乱填",
      targetDrivePlaceholder: "请选择盘符",
      abandon: "连续未运行的不常用软件扫描",
      abandonMark: "180 天",
      abandonHint: "连续 180 天未运行的软件会被提示「你可能很久没用它了」(默认 180 天,无需填写)",
      scanRootDesc: "整 C 盘",
      scanRootHint: "扫描整 C 盘用户区 + Program Files,不扫 Windows。",
      use: "使用说明",
      useText: "对话里调用 disk_scan 扫描分类、disk_preview 预览、disk_execute 确认执行。配置/记忆类(红线)永远只展示;个人文件只提醒、绝不自动删。",
      summary: "扫描整 C 盘占用,把每个大空间按「可删缓存 / 可改址 / 可搬盘 / 冷废弃 / 红线保护」分类,动手前先预览、做完可回滚。扫描过程中耗时较长,一般需要几分钟,请耐心等待。",
      startScan: "开始扫描C盘",
      startScanHint: "点击后在对话里运行扫描并按类别返回清单;扫描耗时约几分钟。",
      scanning: "扫描中…",
      scanRunning: ">>> 已发起扫描,请到当前对话查看结果。",
      scanDone: ">>> 扫描已完成,结果同时写入了对话:",
      scanNoSession: ">>> 无会话,请先在对话新建一个会话。",
      scanUnknown: ">>> 未知命令: /disk_scan(插件未加载该命令)。",
      scanFail: "发起失败:",
      scanTarget: "目标对话",
      scanElapsed: "已用",
      scanSeconds: "秒",
      scanStuck: ">>> 宿主 90 秒仍未返回受理结果,可能卡在会话受理。仍在等待;也可以直接在对话里输入 /disk_scan。",
      scanRejected: ">>> 宿主没有受理这条命令(命令未匹配,或目标会话当前不可用)。请在对话里直接输入 /disk_scan。",
      scanNoText: ">>> 命令已执行,但宿主没有返回报告文本。",
      scanRejectedWrite: "宿主拒绝了这次写入(设置服务未接受该值)。",
      scanReport: "扫描报告(同时也写进了对话):",
    };

    const en = {
      nav: "C Drive Planner",
      loading: "Reading configuration…",
      unavailable: "Configuration panel unavailable. Edit ~/.dsh-disk-manager/config.json instead.",
      saved: "Saved",
      error: "Save failed:",
      general: "General",
      enabled: "Enable C Drive Planner",
      enabledHint: "Disables C-drive scan/cleanup tools when off",
      targetDrive: "Target drive for C-drive cache",
      targetDriveHint: "Pick the drive to move caches/data to (e.g. D). Only detected drives are listed.",
      targetDrivePlaceholder: "Select a drive",
      abandon: "Rarely-used software scan",
      abandonMark: "180 days",
      abandonHint: "Software not run for 180 days is flagged as possibly abandoned (default, no input needed)",
      scanRootDesc: "Entire C drive",
      scanRootHint: "Scans C-drive user area + Program Files, not Windows.",
      use: "Usage",
      useText: "Call disk_scan in chat to scan/classify, disk_preview to dry-run, disk_execute to confirm. Config/memory (redline) is display-only; personal files are remind-only.",
      summary: "Scan the whole C drive, categorize each large space into cache / relocatable / movable / abandoned / redline, preview before acting and undoable after. Scanning takes a few minutes — please wait.",
      startScan: "Scan C Drive",
      startScanHint: "Runs the scan in the conversation and returns categorized results; takes a few minutes.",
      scanning: "Scanning…",
      scanRunning: ">>> Scan started, check the current conversation for results.",
      scanDone: ">>> Scan finished — the report was also written into the conversation:",
      scanNoSession: ">>> No session, create one in the chat first.",
      scanUnknown: ">>> Unknown command: /disk_scan (plugin not loaded).",
      scanFail: "Failed to start:",
      scanTarget: "target conversation",
      scanElapsed: "elapsed",
      scanSeconds: "s",
      scanStuck: ">>> The host has not answered the admission after 90s — still waiting; you can also type /disk_scan in the conversation.",
      scanRejected: ">>> The host did not admit this command (no match, or the target session is unavailable). Type /disk_scan in the conversation instead.",
      scanNoText: ">>> The command ran, but the host returned no report text.",
      scanRejectedWrite: "The host rejected this write (the settings service did not accept the value).",
      scanReport: "Scan report (also written into the conversation):",
    };

    const STYLES = [
      ".dsk-config{max-width:640px;display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary)}",
      ".dsk-group{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;background:var(--dsw-alias-bg-layer-2)}",
      ".dsk-group h3{margin:0 0 12px;font-size:13px;font-weight:600}",
      ".dsk-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}",
      ".dsk-field label{font-size:12px;font-weight:500}",
      ".dsk-field select,.dsk-field input[type=text],.dsk-field input[type=number]{height:30px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:0 8px;font:inherit;font-size:13px;box-sizing:border-box}",
      ".dsk-hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
      ".dsk-switch{display:flex;align-items:center;gap:8px;margin-bottom:6px}",
      ".dsk-switch input{accent-color:var(--dsw-alias-state-business-primary)}",
      ".dsk-status{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px;white-space:pre-wrap}",
      ".dsk-row{display:flex;gap:12px}",
      ".dsk-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}",
      ".dsk-static{font-size:13px;color:var(--dsw-alias-label-primary);padding:6px 0}",
      ".dsk-summary{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-left:4px solid var(--dsw-alias-state-business-primary);border-radius:8px;padding:12px 14px;white-space:pre-wrap}",
      ".dsk-btn{height:32px;padding:0 16px;border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:#fff;border-radius:6px;font:inherit;font-size:13px;cursor:pointer}",
      ".dsk-btn:disabled{opacity:.6;cursor:not-allowed}",
      ".dsk-report{margin-top:10px}",
      ".dsk-report pre{margin:6px 0 0;max-height:280px;overflow:auto;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:8px 10px;color:var(--dsw-alias-label-primary)}",
    ].join("");

    function Field({ label, hint, children }) {
      return h("div", { className: "dsk-field" }, h("label", null, label), children, hint ? h("div", { className: "dsk-hint" }, hint) : null);
    }

    /** 下拉选择(盘符) */
    function SelectInput({ value, onCommit, options, placeholder }) {
      return h("select", {
        value: value || "",
        onChange: (e) => onCommit(e.target.value),
      }, [
        h("option", { value: "", disabled: true }, placeholder || ""),
        ...(options || []).map((opt) => h("option", { key: opt.value, value: opt.value }, opt.label)),
      ]);
    }

    function ConfigSection({ scope, t, drives, runScan }) {
      const [snap, setSnap] = useState(() => scope.getSnapshot());
      const [status, setStatus] = useState("");
      const [scanMsg, setScanMsg] = useState("");
      const [scanning, setScanning] = useState(false);
      const [report, setReport] = useState("");
      // 盘符列表:先用兜底值渲染,再向宿主只读路由取真实盘符替换
      // (2026-09-26 修:原先硬编码 C~H,本机只有 C/D 也会列出 E~H)。
      const [driveList, setDriveList] = useState(() => (Array.isArray(drives) && drives.length ? drives : ["C", "D", "E", "F", "G", "H"]));
      useEffect(() => {
        let alive = true;
        Promise.resolve()
          .then(() => fetch("/dsh-disk-manager/drives", { headers: { accept: "application/json" }, credentials: "same-origin" }))
          .then((r) => (r && r.ok ? r.json() : null))
          .then((j) => {
            if (!alive || !j || !Array.isArray(j.drives) || !j.drives.length) return;
            setDriveList(j.drives.map((d) => String(d).toUpperCase()));
          })
          .catch(() => { /* 路由不可用(旧版/桌面版)则保留兜底值 */ });
        return () => { alive = false; };
      }, []);
      // 写值乐观回显:宿主回执要一个来回(实测约 1.4 秒),这段时间受控组件会把
      // 用户刚选的值弹回旧值,看起来就像"没选上"。本地先顶上,宿主视图追上再撤。
      const [optimistic, setOptimistic] = useState({});
      const statusTimer = useRef(null);
      useEffect(() => scope.subscribe(() => setSnap(scope.getSnapshot())), [scope]);
      useEffect(() => {
        setOptimistic((prev) => {
          const keys = Object.keys(prev);
          if (!keys.length) return prev;
          const v = scope.getSnapshot().value || {};
          const next = { ...prev };
          let changed = false;
          for (const k of keys) if (v[k] === prev[k]) { delete next[k]; changed = true; }
          return changed ? next : prev;
        });
      }, [snap, scope]);
      useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);
      const flash = (msg) => {
        setStatus(msg);
        if (statusTimer.current) clearTimeout(statusTimer.current);
        statusTimer.current = setTimeout(() => setStatus(""), 2500);
      };
      const dropOptimistic = (field) => setOptimistic((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, field)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
      const save = (field, value) => {
        setOptimistic((prev) => ({ ...prev, [field]: value }));
        Promise.resolve(scope.set(field, value))
          .then((accepted) => {
            // set() 返回 false = 宿主没收下这次写入;旧代码在这里照样显示"已保存",是假成功。
            if (accepted === false) { dropOptimistic(field); flash(`${t("error")}${t("scanRejectedWrite")}`); return; }
            flash(t("saved"));
          })
          .catch((err) => {
            dropOptimistic(field);
            flash(`${t("error")} ${err && err.message ? err.message : String(err)}`);
          });
      };
      const doScan = () => {
        if (!runScan || scanning) return;
        setScanning(true);
        setScanMsg("");
        setReport("");
        Promise.resolve(runScan({ progress: (m) => setScanMsg(m), report: (txt) => setReport(txt) }))
          .then((res) => setScanMsg(res || t("scanRunning")))
          .catch((err) => setScanMsg(`${t("scanFail")} ${err && err.message ? err.message : String(err)}`))
          .finally(() => setScanning(false));
      };

      if (snap.status === "loading") return h("p", { className: "dsk-status" }, t("loading"));
      if (snap.status === "unavailable") return h("p", { className: "dsk-status" }, t("unavailable"));
      const v = snap.value || {};
      // 本地乐观值优先(宿主视图到达后由上面的 effect 撤掉)
      const val = (k) => (Object.prototype.hasOwnProperty.call(optimistic, k) ? optimistic[k] : v[k]);
      const driveOptions = (driveList || []).map((d) => ({ value: d, label: d + ": 盘" }));

      return h("div", { className: "dsk-config" }, [
        h("div", { className: "dsk-summary" }, t("summary")),
        h("div", { className: "dsk-group" }, [
          h("button", { className: "dsk-btn", disabled: scanning, onClick: doScan }, scanning ? t("scanning") : t("startScan")),
          h("div", { className: "dsk-hint" }, t("startScanHint")),
          h("div", { className: "dsk-status" }, scanMsg),
          report ? h("div", { className: "dsk-report" }, [
            h("div", { className: "dsk-hint" }, t("scanReport")),
            h("pre", null, report),
          ]) : null,
        ]),
        h("div", { className: "dsk-group" }, [
          h("h3", null, t("general")),
          h("div", { className: "dsk-switch" }, [
            h("input", { type: "checkbox", id: "dsk-enabled", checked: !!val("enabled"), onChange: (e) => save("enabled", e.target.checked) }),
            h("label", { htmlFor: "dsk-enabled" }, t("enabled")),
          ]),
          h("div", { className: "dsk-hint" }, t("enabledHint")),
          Field({
            label: t("targetDrive"),
            hint: t("targetDriveHint"),
            children: h(SelectInput, { value: val("targetDrive") || "", onCommit: (val2) => save("targetDrive", val2), options: driveOptions, placeholder: t("targetDrivePlaceholder") }),
          }),
          Field({
            label: t("abandon"),
            hint: t("abandonHint"),
            children: h("div", { className: "dsk-static" }, t("abandonMark")),
          }),
          Field({
            label: t("scanRootDesc"),
            hint: t("scanRootHint"),
            children: h("div", { className: "dsk-static" }, t("scanRootDesc")),
          }),
          h("div", { className: "dsk-note" }, t("useText")),
        ]),
        h("div", { className: "dsk-status" }, status),
      ]);
    }

    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement("style");
        tag.setAttribute("data-plugin", "dsh-disk-manager");
        tag.textContent = STYLES;
        document.head.appendChild(tag);
        return () => { if (tag.parentNode) tag.parentNode.removeChild(tag); };
      }, "dsh-disk-manager: styles");

      ctx.effect(() => {
        return ctx.locale.register(NS, { zh, en });
      }, "dsh-disk-manager: dictionaries");

      const t = ctx.locale.bind(NS);
      // 0.1.7：ctx.settingsScope 整个被移除，改由 configForms.get(条目 id) 取共享表单。
      // getSnapshot()/subscribe()/set(field, value) 与旧 scope 同名同义 → 组件体无需改动。
      const scope = ctx.configForms.get(SETTINGS_NAMESPACE);
      const drives = ["C", "D", "E", "F", "G", "H"]; // 兜底;实际以配置/扫描检测为准
      // 选"要发到哪个对话"。
      // 2026-09-26 实测:dsh-api-session-controller 的列表快照是 {ids, byId, phase},
      // **没有 current 字段** —— 所以现实里总是走"最近更新过的非空白会话"(= 用户
      // 正在看的那个对话);下面保留 current 分支只为将来真有该字段时生效。
      const pickTarget = (sessions) => {
        const s = (sessions && sessions.list && sessions.list.getSnapshot && sessions.list.getSnapshot()) || {};
        const byId = s.byId || {};
        const ids = Array.isArray(s.ids) ? s.ids : [];
        const row = (id) => byId[id] || {};
        const short = (id) => String(id).replace(/^session-/, "").slice(0, 8);
        const shape = (id) => ({
          id,
          title: `${row(id).displayTitle || short(id)} (${short(id)})`,
        });
        if (s.current && !row(s.current).blank) return shape(s.current);
        const rows = ids
          .map((id) => ({ id, ...row(id) }))
          .filter((r) => r.id && !r.blank && r.origin !== "subagent")
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (rows[0]) return shape(rows[0].id);
        if (s.current) return shape(s.current);
        if (ids.length) return shape(ids[ids.length - 1]);
        return { id: void 0, title: void 0 };
      };
      /**
       * 让 host 执行 /disk_scan。
       * 2026-09-26 改：不再用 20 秒 race 把回执丢掉 —— 整盘扫描要 3~4 分钟，
       * 旧写法超时后只显示"已发起扫描"，RPC 后来的结果(以及"宿主根本没受理")
       * 全被静默吞掉，用户永远看不到结果也不知道失败。现在全程等，并：
       *   - 用 progress 回调持续显示"扫描中…（目标对话，已用 Ns）"；
       *   - 拿到报告文本就回填到设置页(report 回调)，对话里那份仍由 host 写；
       *   - 区分"宿主未受理(value undefined)"与"超时没返回"，给不同提示。
       * 另外：服务引用改成每次点击现取 —— apply 时抓到的引用在页面重连/实例
       * 重启后可能已经失效，表现为"已发起扫描但什么也没发生"。
       */
      const runScan = async (hooks = {}) => {
        const progress = typeof hooks.progress === "function" ? hooks.progress : () => {};
        const report = typeof hooks.report === "function" ? hooks.report : () => {};
        try {
          const remote = ctx.get("remote");
          const remoteCommands = ctx.get("remote.commands") || (remote && remote.commands);
          const sessionsNow = ctx.get("sessions");
          if (!remoteCommands || typeof remoteCommands.execute !== "function") return `${t("scanFail")} remote.commands 不可用`;
          if (!sessionsNow || !sessionsNow.list) return `${t("scanFail")} sessions 不可用`;
          const target = pickTarget(sessionsNow);
          if (!target.id) return t("scanNoSession");
          // 确保目标会话在前台(已选中则无副作用)
          try { if (sessionsNow.open) sessionsNow.open(target.id); } catch { /* 已在前台则忽略 */ }
          const where = `${t("scanTarget")}: ${target.title}`;
          const startedAt = Date.now();
          progress(`${t("scanning")}（${where}，${t("scanElapsed")} 0 ${t("scanSeconds")}）`);
          const tick = setInterval(() => {
            progress(`${t("scanning")}（${where}，${t("scanElapsed")} ${Math.round((Date.now() - startedAt) / 1000)} ${t("scanSeconds")}）`);
          }, 2000);
          const stuck = setTimeout(() => progress(`${t("scanStuck")}（${where}）`), 90000);
          try {
            let outcome;
            try {
              outcome = await remoteCommands.execute(target.id, "/disk_scan", []);
            } catch (e) {
              outcome = { ok: false, error: { message: e && e.message ? e.message : String(e) } };
            }
            if (outcome && outcome.ok === false) {
              return `${t("scanFail")}${outcome.error && outcome.error.message ? " " + outcome.error.message : ""}（${where}）`;
            }
            const value = outcome ? outcome.value : void 0;
            const text = value && value.result ? value.result.text : void 0;
            if (text) { report(text); return `${t("scanDone")}（${where}）`; }
            // value 为 undefined = 宿主没匹配到 /disk_scan(或该会话不可用)，什么都没跑
            if (value === void 0 || value === null) return `${t("scanRejected")}（${where}）`;
            return `${t("scanNoText")}（${where}）`;
          } finally {
            clearInterval(tick);
            clearTimeout(stuck);
          }
        } catch (e) {
          return `${t("scanFail")}${e && e.message ? " " + e.message : ""}`;
        }
      };
      const injected = () => ({ scope, drives, runScan });

      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "dsh-disk-manager",
        order: 210,
        label: () => t("nav"),
        locale: NS,
        inject: injected,
      }, ConfigSection));
    }

    module.exports = {
      name: "dsh-disk-manager",
      inject: ["slots", "locale", "configForms", "remote", "remote.commands", "sessions"],
      apply,
    };
    return module.exports;
  },
});
