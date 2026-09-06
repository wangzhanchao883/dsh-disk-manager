import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { configDir } from "../config.mjs";

/**
 * safety.mjs —— 强红线 + dry-run 预览 + undo 日志。
 * 负责: 1) 红线判定(E 类永不执行)  2) E 类降级需二次确认
 *       3) 执行前 dry-run 生成"将做什么"  4) 写 undo 日志供回滚
 */

const REDLINE_CATEGORY = "E";

/** 单条待执行操作的 undo 记录结构 */
function undoPath() {
  return join(configDir(), "undo.log.json");
}

function readUndo() {
  try {
    if (existsSync(undoPath())) return JSON.parse(readFileSync(undoPath(), "utf8"));
  } catch {
    /* ignore */
  }
  return [];
}

function appendUndo(entry) {
  const arr = readUndo();
  arr.push({ ...entry, ts: new Date().toISOString() });
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(undoPath(), JSON.stringify(arr, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

/**
 * 校验一个条目能否执行。
 * @returns { ok:boolean, reason?:string, downgradeRequired?:boolean }
 */
export function canExecute(item, config) {
  const cat = item.category;

  // 用户黑名单/配置黑名单 -> 禁止
  if (item.path && config.blacklist?.some((b) => item.path.includes(b))) {
    return { ok: false, reason: "命中用户黑名单" };
  }

  // E 红线:默认禁止
  if (cat === REDLINE_CATEGORY) {
    return { ok: false, reason: "配置/记忆红线(E),默认不执行", downgradeRequired: true };
  }

  // P 个人文件:用户自己的数据,绝不自动删;只允许手动 junction 搬/提醒,删除一律禁止
  if (cat === "P") {
    if (item.action === "delete") return { ok: false, reason: "个人文件(P),绝不自动删除" };
    if (item.action === "junction") {
      if (!config.targetDrive) return { ok: false, reason: "搬移需先选择目标盘" };
      return { ok: true };
    }
    // 其余(remind/提示)允许
    return { ok: true };
  }

  // 未分类(null)-> 禁止
  if (!cat || cat === "unclassified") {
    return { ok: false, reason: "尚未分类,需先确认" };
  }

  // A/C 可自动;必须已选目标盘(针对搬)
  if ((cat === "A" || cat === "C") && !config.targetDrive && !["delete"].includes(item.action)) {
    return { ok: false, reason: "搬移需先选择目标盘" };
  }

  return { ok: true };
}

/**
 * 生成 dry-run 预览:列出"将对每个条目做什么",不真正执行。
 * 对 E/未确认的条目标"NOP(红线/未分类)"。
 */
export function preview(actions, config) {
  return actions.map((a) => {
    const chk = canExecute(a, config);
    if (!chk.ok) {
      return { ...a, will: "NOP", status: chk.reason };
    }
    let will = "DELETE";
    if (a.category === "B") will = "REDIRECT(改软件设置)";
    if (a.category === "C") will = "JUNCTION(搬到磁盘)";
    if (a.action === "delete") will = "DELETE";
    if (a.action === "junction") will = "JUNCTION";
    if (a.action === "redirect") will = "REDIRECT";
    return { ...a, will, status: "OK" };
  });
}

/**
 * 执行一条操作。返回 { ok, message, undo? }。
 * 由 executor.mjs 调用;这里只负责安全门 + undo 记录。
 */
export async function runAction(action, config, executorFn) {
  const chk = canExecute(action, config);
  if (!chk.ok) return { ok: false, message: chk.reason };

  const result = await executorFn(action, config);
  if (result.ok && config.undoLog) {
    appendUndo({ action: action.action, category: action.category, path: action.path, target: action.target, before: result.before, after: result.after });
  }
  return result;
}

export function readUndoLog() {
  return readUndo();
}

export { undoPath, appendUndo };
