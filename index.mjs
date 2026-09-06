import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_CONFIG, resolveConfig, saveConfig } from "./config.mjs";
import { scan } from "./core/scanner.mjs";
import { classifyEntry, recordUserDecision, CATEGORY_META } from "./core/classify.mjs";
import { snapshotProcessNames, isActive } from "./core/active.mjs";
import { preview, canExecute, runAction, readUndoLog } from "./core/safety.mjs";
import { dispatch, dirSizeMB, BASE } from "./core/executor.mjs";
import { execFileSync } from "node:child_process";

export const name = "dsh-disk-manager";
export const inject = ["tools", "llm", "commands"];

const SETTINGS_NS = "dsh-disk-manager";

/** 检测可用盘符(只读),供下拉框使用 */
function listDrives() {
  try {
    const raw = execFileSync("powershell", ["-NoProfile", "-Command",
      "Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Free -ne $null} | Select-Object -ExpandProperty Name | Sort-Object"], {
      encoding: "utf8",
      timeout: 15000,
    }).toString();
    const arr = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => s.toUpperCase());
    return [...new Set(arr.filter((d) => /^[A-Z]$/.test(d)))]; // C,D,E...
  } catch {
    return ["C", "D", "E", "F", "G", "H"];
  }
}

const settingsSchema = z.object({
  enabled: z.boolean().default(true),
  targetDrive: z.string().default(""),
  abandonDays: z.number().min(1).max(3650).default(DEFAULT_CONFIG.abandonDays),
  minSizeMB: z.number().min(0).max(10240).default(DEFAULT_CONFIG.minSizeMB),
  undoLog: z.boolean().default(true),
  drives: z.array(z.string()).default(["C", "D", "E", "F", "G", "H"]),
});

function toFlat(config, drives) {
  return {
    enabled: config.enabled,
    targetDrive: config.targetDrive,
    abandonDays: config.abandonDays,
    minSizeMB: config.minSizeMB,
    undoLog: config.undoLog,
    drives: drives || [],
  };
}

function fromFlat(flat) {
  return {
    enabled: flat.enabled,
    targetDrive: flat.targetDrive,
    abandonDays: flat.abandonDays,
    scanRoots: DEFAULT_CONFIG.scanRoots,
    minSizeMB: flat.minSizeMB,
    undoLog: flat.undoLog,
    blacklist: DEFAULT_CONFIG.blacklist,
    drives: Array.isArray(flat.drives) ? flat.drives : [],
  };
}

function textTool(definition) {
  return defineTool({
    ...definition,
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    presentCall: (args) => ({ card: "generic", kind: "text", title: definition.name, rawInput: args }),
  });
}

export function apply(ctx, input = {}) {
  let liveConfig = resolveConfig(input);

  // 设置命名空间:Web 配置界面读写
  const drives = listDrives();
  ctx.inject(["settings"], (settingsCtx) => {
    try {
      const scope = settingsCtx.settings.register(SETTINGS_NS, settingsSchema, { base: toFlat(liveConfig, drives) });
      const resolved = scope.get();
      if (resolved) liveConfig = { ...liveConfig, ...fromFlat(resolved) };
      scope.watch((next) => {
        if (!next) return;
        liveConfig = { ...liveConfig, ...fromFlat(next) };
      });
    } catch (err) {
      ctx.logger.warn(`dsh-disk-manager: 设置命名空间注册失败:${err.message}`);
    }
  });

  // ---------- 工具 0:查询可用盘符 ----------
  ctx.tools.register(textTool({
    name: "disk_drives",
    description: "列出当前机器上的可用盘符(C/D/E...),供选择迁移目标盘。",
    parameters: {},
    async execute() {
      return `可用盘符: ${drives.join(", ")}`;
    },
  }));

  // ---------- 工具 1:扫描 + 分类 ----------
  ctx.tools.register(textTool({
    name: "disk_scan",
    description:
      "扫描整 C 盘(用户区 AppData + 用户 profile + Program Files,不扫 Windows),量出各大目录体积,并按 A/B/C/D/E/P 分类(无忧缓存/官方可改址/可junction搬/冷废弃软件/配置记忆红线/个人文件)。返回分组清单。",
    parameters: {
      minSizeMB: { type: "number", description: "可选:最小展示体积阈值(MB),默认用配置值" },
    },
    async execute(args) {
      const cfg = { ...liveConfig, minSizeMB: args.minSizeMB ?? liveConfig.minSizeMB };
      return runScan(ctx, cfg);
    },
  }));

  // ---------- 工具 2:dry-run 预览------------
  ctx.tools.register(textTool({
    name: "disk_preview",
    description: "对选中的条目做 dry-run 预览:列出每个条目将执行什么,不真正执行。actions 传 {path, category, action} 数组。",
    parameters: {
      actions: { type: "array", items: { type: "string" }, description: "JSON 字符串数组,每项形如 {\"path\":\"...\",\"category\":\"A\",\"action\":\"junction\",\"name\":\"...\"}" },
    },
    async execute(args) {
      const acts = (args.actions || []).map((a) => {
        const o = typeof a === "string" ? JSON.parse(a) : a;
        return { ...o, target: buildTarget(o, liveConfig) };
      });
      const prev = preview(acts, liveConfig);
      return prev
        .map((p) => `[${p.will}] status=${p.status} path=${p.path}`)
        .join("\n");
    },
  }));

  // ---------- 工具 3:执行 ----------
  ctx.tools.register(textTool({
    name: "disk_execute",
    description:
      "真正执行选中的动作(删/junction搬/引导改址)。前提:必须已经 disk_preview 确认。E 红线/未分类条目不会被执行。",
    parameters: {
      actions: { type: "array", items: { type: "string" }, description: "JSON 字符串数组,每项形如 {\"path\":\"...\",\"category\":\"A\",\"action\":\"junction\",\"name\":\"...\"}" },
    },
    async execute(args) {
      const acts = (args.actions || []).map((a) => {
        const o = typeof a === "string" ? JSON.parse(a) : a;
        return { ...o, target: buildTarget(o, liveConfig) };
      });
      const results = [];
      for (const act of acts) {
        const outcome = await runAction(act, liveConfig, (a, c) => dispatch(a, c));
        results.push(`[${outcome.ok ? "OK" : "FAIL"}] ${act.path} :: ${outcome.message}`);
      }
      return results.join("\n");
    },
  }));

  // ---------- 工具 4:确认未知分类(写入本地缓存) ----------
  ctx.tools.register(textTool({
    name: "disk_classify_confirm",
    description:
      "用户对 LLM 判断的条目做最终确认,写入本地分类缓存。items 传 {path, name, category} 数组。category 必须 A/B/C/D/E。",
    parameters: {
      items: { type: "array", items: { type: "string" }, description: "JSON 字符串数组,每项形如 {\"path\":\"...\",\"name\":\"...\",\"category\":\"A\"}" },
    },
    async execute(args) {
      const lines = [];
      for (const raw of args.items || []) {
        const it = typeof raw === "string" ? JSON.parse(raw) : raw;
        recordUserDecision({ name: it.name, path: it.path }, it.category, "用户确认");
        lines.push(`确认 ${it.name} -> ${it.category}`);
      }
      return lines.join("\n");
    },
  }));

  // ---------- 工具 5:查看 undo 日志 ----------
  ctx.tools.register(textTool({
    name: "disk_undo",
    description: "列出本插件的 undo 日志(已执行的可逆操作),便于回滚。",
    parameters: {},
    async execute() {
      const log = readUndoLog();
      if (!log.length) return "暂无 undo 记录";
      return log.map((l, i) => `${i + 1}. [${l.ts}] ${l.action} ${l.path} -> ${l.target ?? "-"}`).join("\n");
    },
  }));

  // ---------- 工具 6:斜杠命令 /disk_scan(host 直跑,不经模型) ----------
  // 供「设置页「开始扫描C盘」按钮」及用户直接在对话里输入 /disk_scan 使用。
  if (ctx.commands) {
    ctx.commands.register({
      name: "disk_scan",
      description: "扫描整 C 盘,量体积,按 A/B/C/D/E/P 分类返回清单。",
      input: {
        hint: "扫描整 C 盘占用并按类别返回清单。可选参数 minSizeMB=<MB> 覆盖最小展示体积阈值。",
        images: false,
      },
      handler: async ({ rawInput }) => {
        try {
          const cfg = { ...liveConfig, minSizeMB: parseScanMinSize(rawInput) ?? liveConfig.minSizeMB };
          const text = await runScan(ctx, cfg);
          return { kind: "success", text };
        } catch (e) {
          return { kind: "error", text: `扫描失败: ${e && e.message ? e.message : String(e)}` };
        }
      },
    });
  }

  ctx.logger.info("dsh-disk-manager: C盘空间规划整理大师已加载");
}

/** 抽取共享的扫描+分类+分组+报告逻辑,供工具与 /disk_scan 命令复用 */
async function runScan(ctx, cfg) {
  const entries = await scan(cfg, (m) => ctx.logger.info(`disk_scan: ${m}`));
  const classified = [];
  for (const e of entries) {
    if (e.sizeMB !== null && e.sizeMB < cfg.minSizeMB) continue;
    const cls = await classifyEntry(e, { config: cfg, ctx });
    classified.push({ ...e, ...cls });
  }
  const byCat = group(classified, cfg, snapshotProcessNames());
  return renderReport(byCat, cfg);
}

/** 解析命令参数里的 minSizeMB,如 "minSizeMB=200" 或 "200" */
function parseScanMinSize(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/(minSizeMB\s*=\s*)?(\d+)/i);
  if (!m) return null;
  const n = Number(m[2]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 按类别分组 + D 冷废弃判断(process/custom 信号修正误判) */
function group(entries, cfg, procNames = []) {
  const now = Date.now();
  const byCat = { A: [], B: [], C: [], D: [], E: [], P: [], UNKNOWN: [] };
  for (const e of entries) {
    let cat = e.category;
    const stale = e.lastAccess && now - e.lastAccess > cfg.abandonDays * 86400000;
    const big = (e.sizeMB ?? 0) > 200;
    // 冷废弃判断:大体积 + 超期未用;但"软件正在跑/常用"则跳过,避免误判
    const active = isActive(e.name, procNames);
    if (big && stale && !active) {
      if (cat === "C") cat = "D";
      else if (cat === "E" && e.zone === "program") cat = "D"; // 软件本体静置 -> 提示可能废弃
    }
    byCat[cat] = byCat[cat] || [];
    byCat[cat].push(e);
  }
  return byCat;
}

function buildTarget(action, cfg) {
  const drive = cfg.targetDrive || "D";
  if (action.action === "junction") {
    const name = action.name || action.path.split("\\").pop() || "cache";
    const safe = name.replace(/[^\w.-]/g, "_");
    return `${drive}:\\AppCache\\${safe}`;
  }
  return null;
}

function renderReport(byCat, cfg) {
  const order = ["A", "B", "C", "D", "E", "P", "UNKNOWN"];
  const lines = [`C盘空间规划整理大师 · 整 C 盘扫描完成(target=${cfg.targetDrive || "未选盘"}, 废弃阈值=${cfg.abandonDays}天, 最小展示=${cfg.minSizeMB}MB)`, ""];
  let total = 0;
  for (const cat of order) {
    const arr = byCat[cat] || [];
    if (!arr.length) continue;
    const meta = CATEGORY_META[cat] || { label: cat, color: "gray" };
    const sum = arr.reduce((s, e) => s + (e.sizeMB ?? 0), 0);
    total += sum;
    lines.push(`【${cat} ${meta.label}】合计 ${sum.toFixed(1)} MB,${arr.length} 项  ${meta.action}`);
    for (const e of arr) {
      const confirm = e.needUser ? "(需人工确认)" : e.source === "llm" ? "(LLM判断)" : "";
      lines.push(`  - ${e.sizeMB ?? "?"} MB  [${e.confidence ?? "?"}] ${e.name} ${confirm} :: ${e.reason || ""}`);
    }
    lines.push("");
  }
  lines.push(`共识别约 ${total.toFixed(1)} MB`);
  return lines.join("\n");
}
