/* dsh-disk-manager client bundle — Web 设置页。
 * 以经典脚本形式注册到 window.__ModuleLoader__;工厂内用 require 取 React,
 * 不能用 JSX(无构建步骤),一律 React.createElement。
 * 说明:扫描/分类/执行由模型驱动的工具(disk_scan/disk_preview/disk_execute)
 *       在对话里呈现与确认;本页负责用户配置(目标盘/启用)。 */
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
      scanNoSession: ">>> 无会话,请先在对话新建一个会话。",
      scanUnknown: ">>> 未知命令: /disk_scan(插件未加载该命令)。",
      scanFail: "发起失败:",
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
      scanNoSession: ">>> No session, create one in the chat first.",
      scanUnknown: ">>> Unknown command: /disk_scan (plugin not loaded).",
      scanFail: "Failed to start:",
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
      ".dsk-status{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px}",
      ".dsk-row{display:flex;gap:12px}",
      ".dsk-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}",
      ".dsk-static{font-size:13px;color:var(--dsw-alias-label-primary);padding:6px 0}",
      ".dsk-summary{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-left:4px solid var(--dsw-alias-state-business-primary);border-radius:8px;padding:12px 14px;white-space:pre-wrap}",
      ".dsk-btn{height:32px;padding:0 16px;border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:#fff;border-radius:6px;font:inherit;font-size:13px;cursor:pointer}",
      ".dsk-btn:disabled{opacity:.6;cursor:not-allowed}",
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
      const statusTimer = useRef(null);
      useEffect(() => scope.subscribe(() => setSnap(scope.getSnapshot())), [scope]);
      useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);
      const flash = (msg) => {
        setStatus(msg);
        if (statusTimer.current) clearTimeout(statusTimer.current);
        statusTimer.current = setTimeout(() => setStatus(""), 2500);
      };
      const save = (field, v) => {
        Promise.resolve(scope.set(field, v))
          .then(() => flash(t("saved")))
          .catch((err) => flash(`${t("error")} ${err && err.message ? err.message : String(err)}`));
      };
      const doScan = () => {
        if (!runScan || scanning) return;
        setScanning(true);
        setScanMsg("");
        Promise.resolve(runScan())
          .then((res) => setScanMsg(res || t("scanRunning")))
          .catch((err) => setScanMsg(`${t("scanFail")} ${err && err.message ? err.message : String(err)}`))
          .finally(() => setScanning(false));
      };

      if (snap.status === "loading") return h("p", { className: "dsk-status" }, t("loading"));
      if (snap.status === "unavailable") return h("p", { className: "dsk-status" }, t("unavailable"));
      const v = snap.value || {};
      const driveOptions = (drives || []).map((d) => ({ value: d, label: d + ": 盘" }));

      return h("div", { className: "dsk-config" }, [
        h("div", { className: "dsk-summary" }, t("summary")),
        h("div", { className: "dsk-group" }, [
          h("button", { className: "dsk-btn", disabled: scanning, onClick: doScan }, scanning ? t("scanning") : t("startScan")),
          h("div", { className: "dsk-hint" }, t("startScanHint")),
          h("div", { className: "dsk-status" }, scanMsg),
        ]),
        h("div", { className: "dsk-group" }, [
          h("h3", null, t("general")),
          h("div", { className: "dsk-switch" }, [
            h("input", { type: "checkbox", id: "dsk-enabled", checked: !!v.enabled, onChange: (e) => save("enabled", e.target.checked) }),
            h("label", { htmlFor: "dsk-enabled" }, t("enabled")),
          ]),
          h("div", { className: "dsk-hint" }, t("enabledHint")),
          Field({
            label: t("targetDrive"),
            hint: t("targetDriveHint"),
            children: h(SelectInput, { value: v.targetDrive || "", onCommit: (val) => save("targetDrive", val), options: driveOptions, placeholder: t("targetDrivePlaceholder") }),
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
      const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
      const drives = ["C", "D", "E", "F", "G", "H"]; // 兜底;实际以配置/扫描检测为准
      const connection = ctx.get("connection");
      const remote = ctx.get("remote");
      const sessions = ctx.get("sessions");
      const runScan = async () => {
        try {
          if (!connection) return `${t("scanFail")} connection 不可用`;
          if (!sessions || !sessions.list) return `${t("scanFail")} sessions 不可用`;
          // 1) 取当前会话(就是你正在看的这个对话);为空则回退到列表里最后一个
          const cur = sessions.list.getSnapshot();
          const targetId = cur.current || (cur.ids && cur.ids.length ? cur.ids[cur.ids.length - 1] : void 0);
          if (!targetId) return t("scanNoSession");
          // 2) 确保它在前台(已选中则无副作用)
          try { if (sessions.open) sessions.open(targetId); } catch { /* 已在前台则忽略 */ }
          // 3) 给该会话发一条用户消息 "/disk_scan",host 会走命令注册表执行、结果渲染进对话。
          //    用 session.prompt(入队、立即返回),避免像 commands.execute 那样长时间等待/挂住。
          const tz = (Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || "Asia/Shanghai";
          const { result } = await connection.api.sessions.prompt({
            sessionId: targetId,
            mode: "queue",
            content: [{ type: "text", text: "/disk_scan" }],
            clientTimeZone: tz,
          });
          if (result && result.ok === false) {
            return `${t("scanFail")}${result.error && result.error.message ? " " + result.error.message : ""}`;
          }
          return t("scanRunning");
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
      inject: ["slots", "locale", "settingsScope", "connection", "remote", "remote.commands", "sessions"],
      apply,
    };
    return module.exports;
  },
});
