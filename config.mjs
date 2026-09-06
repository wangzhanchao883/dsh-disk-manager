import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * C盘空间规划整理大师 DSH 插件配置。
 * 持久化位置 ~/.dsh-disk-manager/config.json。
 * 默认目标盘为空(首次使用让用户选),180 天为"冷废弃软件"阈值。
 */
export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  // 目标盘:首次使用由用户在 Web UI 下拉选择,如 "D"。为空则提示先选盘。
  targetDrive: "",
  // 冷废弃软件判定:超过该天数未使用视为"可能废弃"(类 D)
  abandonDays: 180,
  // 扫描根目录:整 C 盘用户区 + Program Files(不扫 Windows)。
  // 页面统一显示为"整 C 盘";内部聚焦这些能发现真实大户的区。
  scanRoots: [
    { root: "C:\\Users\\Administrator\\AppData\\Local", zone: "appdata" },
    { root: "C:\\Users\\Administrator\\AppData\\Roaming", zone: "appdata" },
    { root: "C:\\Users\\Administrator", zone: "user" },
    { root: "C:\\Program Files", zone: "program" },
    { root: "C:\\Program Files (x86)", zone: "program" },
  ],
  // 最小展示体积阈值(MB),低于此不列,避免刷屏
  minSizeMB: 50,
  // 用户黑名单:这些路径标签永远只展示不执行
  blacklist: [
    "\\Programs\\",
    "\\Packages\\",
    "\\Microsoft\\Windows",
    "\\Windows\\",
  ],
  // 是否生成 undo 日志(junction 迁移/删除可再生缓存时)
  undoLog: true,
});

export function configDir() {
  return join(homedir(), ".dsh-disk-manager");
}

export function configPath() {
  return join(configDir(), "config.json");
}

/** 合并默认 + 配置文件 + 运行时入参(插件行 config 覆盖最高) */
export function resolveConfig(input = {}) {
  let file = {};
  try {
    if (existsSync(configPath())) {
      file = JSON.parse(readFileSync(configPath(), "utf8"));
    }
  } catch {
    file = {};
  }
  const merged = mergeDeep(structuredClone(DEFAULT_CONFIG), file);
  return mergeDeep(merged, input);
}

export function saveConfig(config) {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
}

/** 分类缓存:记录"目录特征 -> 用户确认的类别",命中则跳过 LLM/人工 */
export function classifyCachePath() {
  return join(configDir(), "classify-cache.json");
}

export function loadClassifyCache() {
  try {
    if (existsSync(classifyCachePath())) {
      return JSON.parse(readFileSync(classifyCachePath(), "utf8"));
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function saveClassifyCache(cache) {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(classifyCachePath(), JSON.stringify(cache, null, 2), "utf8");
}

function mergeDeep(base, patch) {
  if (patch === undefined || patch === null) return base;
  if (typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] =
      typeof v === "object" && v !== null && !Array.isArray(v) && typeof out[k] === "object" && out[k] !== null
        ? mergeDeep(out[k], v)
        : v;
  }
  return out;
}
