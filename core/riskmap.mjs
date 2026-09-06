/**
 * riskmap.mjs —— 静态规则库:把目录名/特征映射到 A/B/C/D/E 五类。
 *
 * 五类定义:
 *   A 无忧缓存   —— Cache/GPUCache/Code Cache/CachedData/Temp/log/*.updater,可再生,可删或junction搬
 *   B 官方可改址 —— 软件自己支持改存储位置(Docker/npm/pnpm/pip/浏览器profile/下载目录),走官方设置
 *   C 可junction —— 软件不支持改址但数据纯可再生(剪映Cache/Notion离线库/Trae/Cursor缓存),junction搬
 *   D 冷废弃软件 —— 大体积 + 超过 abandonDays 未使用,提示"你很久没用它了",只提醒不自动删
 *   E 配置/记忆  —— Config/Storage/IndexedDB/MEMORY/数据库/.openviking/.qclaw,红线,只展示不执行
 *
 * 分类引擎(safety.mjs/executor.mjs 依赖)优先级:
 *   1) 红线特征(E)优先 —— 命中即判 E,即使 LLM 判错也不自动执行
 *   2) 用户黑名单 -> E
 *   3) 静态规则库
 *   4) 本地分类缓存 classify-cache
 *   5) LLM 兜底 + 人工确认
 */

/** 判断 feature 提取后是否命中"无法访问/受保护",这类直接跳过 */
const PROTECTED = ["AccessDenied", "NotFound"];

/**
 * 程序本体/系统目录:这些是软件主程序或系统组件,属于"保护",一律 E(只展示)。
 * 不删不搬。即使叫 cache 之类也不动 —— 优先级高于一切。
 */
const RULE_PROTECTED = [
  "programs",
  "program files",
  "package cache",
  "packages",
  "microsoft",
  "windows",
  "programdata",
  "system32",
  "brother", // 打印机驱动
  "intel corporation",
  "nvidia corporation",
  "comms",
  "connecteddevicesplatform",
  "elevateddiagnostics",
  "peerdistrepub",
  "engine",
  "unrealengine",
  "godot",
  "steam", // Steam 客户端本体+游戏数据,保护
  "battle.net", // 暴雪客户端本体
  "blizzard entertainment",
  "neteaseui",
  "unicom",
  "tssgame",
];

/** 目录名小写后 -> 类别 的精确规则 */
const RULE_EXACT = {
  "programs": "E",
  "packages": "E",
  "microsoft": "E",
  "windows": "E",
  // ---- A 无忧缓存 ----
  "cache": "A",
  "gpu cache": "A", // Common: "GPUCache"
  "code cache": "A",
  "cacheddata": "A",
  "cachedprofilesdata": "A",
  "cachedextensionvsixs": "A",
  "blob_storage": "A",
  "session storage": "A",
  "local storage": "A",
  "shared dictionary": "A",
  "dictionaries": "A",
  "webstorage": "A",
  "crashpad": "A",
  "crashdumps": "A",
  "d3dscache": "A",
  "log": "A",
  "logs": "A",
  "network": "A",
  "dawnwebgpucache": "A",
  "dawngraphitecache": "A",
  "videdecodestats": "A",
  "temp": "A",
  "cache_data": "A",
  "gpucache": "A",
  "updates": "A",
  "patch": "A",
  "update": "A", // 更新残留(非软件本体)
  "nointerrupt": "A",
  "logs_bytype": "A",
  "cache_media": "A",

  // ---- E 配置/记忆(红线) ----
  "preferences": "E",
  "prefs": "E",
  "settings": "E",
  "config": "E",
  "configure": "E",
  "indexeddb": "E",
  "storage": "E",
  "profile": "E",
  "profiles": "E",
  "user data": "E",
  "default": "E", // Chrome 默认 profile 下,默认 E,但其中 Cache 子目录再被规则引擎细分
  "mem": "E",
  "memory": "E",
  "databases": "E",
  "database": "E",
  "sqlite": "E",
  "keystore": "E",
  "cookies": "E",
  "login data": "E",
  "bookmarks": "E",
  "history": "E",
  "top sites": "E",
  "extensions": "E",
  "session": "E",
  "sessions": "E",
  "localdata": "E",
  "local state": "E",
  "rust_data": "E",
  ".qclaw": "E",
  ".openviking": "E",
  ".dsh": "E",
  ".agents": "E",
  ".config": "E",
  ".local": "E",
};

/**
 * 目录名子串规则(包含即命中)。注意顺序:越具体越靠前。
 * 键->值:[类别, 说明]
 */
const RULE_CONTAINS = [
  // updater 家族 -> A(更新残留,可再生;注意与软件本体区分,通常目录本身即更新包)
  ["-updater", "A", "更新器下载的安装包残留,可删"],
  ["_updater", "A", "更新器残留,可删"],
  ["electron-updater", "A", "更新器残留,可删"],
  ["desktop-updater", "A", "更新器残留,可删"],

  // 缓存家族 -> A
  ["cache", "A", "缓存目录,可再生"],
  ["gpucache", "A", "GPU 缓存"],
  ["codecache", "A", "代码缓存"],
  ["cacheddata", "A", "缓存数据"],
  ["cachedprofiles", "A", "缓存 profile"],

  // npm/pnpm/pip/uv 包缓存 -> B(可用官方设置改址)
  ["npm-cache", "B", "npm 缓存,可 npm config set cache 改址"],
  ["npm_cache", "B", "npm 缓存,可改址"],
  ["pnpm-cache", "B", "pnpm 缓存,可改址"],
  ["pnpm-store", "B", "pnpm store,可改址"],
  ["pnpm-store", "B", "pnpm store"],
  ["uv", "B", "uv 包缓存"],
  ["pip", "B", "pip 缓存"],
  ["node-gyp", "B", "node-gyp 缓存"], // 偏可改址,但保底也算可再生
  ["_npx", "B", "npx 缓存,可改址"],
  ["_cacache", "B", "npm 内部缓存"],
  ["ms-playwright", "B", "Playwright 浏览器,可设 PLAYWRIGHT_BROWSERS_PATH"],

  // 官方可改址的大户软件 -> B(它们有专属设置)
  ["docker", "B", "Docker,可在设置改 Disk image location"],
  ["wsl", "B", "WSL 发行版,可用 wsl --import 迁盘"],

  // 浏览器 profile/data —— 主体 E(有书签/登录),但其 Cache 子目录规则引擎会再判 A
  ["user data", "E", "用户数据,含配置/登录,勿动非缓存部分"],
  ["profile", "E", "Profile 数据"],
  ["storage", "E", "存储数据"],
  ["indexeddb", "E", "IndexedDB,含应用数据"],
  ["memory", "E", "记忆库"],
  ["sqlite", "E", "SQLite 数据库"],
  ["localstorage", "E", "本地存储"],
  ["local storage", "E", "本地存储"],
  ["config", "E", "配置"],
  ["settings", "E", "设置"],
  ["preferences", "E", "偏好设置"],

  // 游戏/语音类大客户端的缓存 -> A/C(可再生),如 YY/duowan
  ["duowan", "C", "多玩/YY 客户端数据,可junction搬"],
  ["yy", "C", "YY 客户端数据,可junction搬"],
  ["heybox", "C", "游戏盒缓存,可junction搬"],
  ["tencent", "C", "腾讯系客户端缓存,可junction搬(仅缓存部分)"],
  ["xwechat", "C", "微信缓存,可junction搬(仅缓存部分)"],
  ["wechat", "C", "微信"],
  ["qqmusic", "C", "QQ音乐缓存"],
  ["battle.net", "C", "暴雪客户端"],
  ["steam", "C", "Steam 数据"],
  ["doubao", "C", "豆包缓存"],
  ["notion", "C", "Notion 离线库,可junction搬"],
  ["trae", "C", "Trae 缓存"],
  ["cursor", "C", "Cursor 缓存"],
  ["bigfoot", "C", "bigfoot 缓存"],
  ["douyin", "C", "抖音缓存"],
  ["xmind", "C", "Xmind 数据"],
  ["chatglm", "C", "ChatGLM"],
  ["dingtalk", "C", "钉钉缓存"],
  ["obsidian", "C", "Obsidian 数据"],
  ["typora", "C", "Typora"],

  // 剪映/视频剪辑 -> C
  ["jianyingpro", "C", "剪映缓存,可junction搬"],
  ["剪映", "C", "剪映"],
  ["wangxin", "C", "剪映"],
  ["capcut", "C", "剪映国际版"],

  // Android/Arduino 等开发者工具 SDK(大,可再生但本机要用则保留,倾向 C 提示) —— 这类更适合"C 可junction/保留"
  ["android", "C", "Android SDK,可junction搬或仅提示"],
  ["arduino", "C", "Arduino 数据"],

  // 数据库服务 -> B/E,倾向 E(服务数据别乱动)
  ["mongo", "E", "MongoDB 数据"],
  ["redis", "E", "Redis 数据"],
  ["postgres", "E", "PostgreSQL 数据"],
  ["mysql", "E", "MySQL 数据"],
];

/** 从目录名提取规范键(小写、去空格) */
function normKey(name) {
  return name.toLowerCase();
}

/**
 * 提取一个目录的特征包,供 classify/LLM 使用。
 * 返回 { name, path, sizeMB, subdirs:[...], hasCache, hasConfig, hasStorage, hasDatabase }
 */
function extractFeature(entry) {
  const lower = entry.name.toLowerCase();
  return {
    name: entry.name,
    path: entry.path,
    sizeMB: entry.sizeMB,
    subdirs: entry.subdirs || [],
    hasCache: /cache|gpucache|codecache|temp|log|updater/i.test(lower),
    hasConfig: /config|setting|prefer|profile/i.test(lower),
    hasStorage: /storage|indexeddb|localstorage|sqlite|database|memory/i.test(lower),
    hasData: /user ?data|workspace|session|vault/i.test(lower),
  };
}

/**
 * 主分类函数:给定条目特征返回 { category, reason, confidence }。
 * confidence: "high"(规则库/红线) | "medium" | "low"(需 LLM+人工)
 */
export function classify(entry) {
  const f = extractFeature(entry);
  const key = normKey(f.name);
  const zone = entry.zone || "appdata";

  // 0) 程序本体/系统目录 —— 保护,优先级最高,一律 E
  if (RULE_PROTECTED.some((p) => key.includes(p))) {
    return { category: "E", reason: "程序本体/系统目录,保护,只展示", confidence: "high" };
  }

  // 0.1) 用户 profile 个人文件区(Downloads/Documents/Desktop 等) —— 绝不自动删,只提醒
  if (zone === "user") {
    // 点目录(.xxx)、配置/存储/记忆特征一律优先红线 E(而非 P),因为这些常是工具配置/记忆库
    if (f.name.toLowerCase().startsWith(".") || f.hasStorage || f.hasConfig || /memory|sqlite|database|indexeddb|config|storage/.test(key)) {
      return { category: "E", reason: "用户区里的点目录/配置/记忆,红线保护", confidence: "high" };
    }
    // 排除已知纯缓存子目录(仍可删/可搬)
    if (f.hasCache && !/download|document|desktop|picture|video|music/.test(key)) {
      return { category: "C", reason: "用户区里的缓存子目录,可junction搬", confidence: "high" };
    }
    return { category: "P", reason: "个人文件(用户自己的数据),只提醒大文件,绝不自动删", confidence: "high" };
  }

  // 0.2) Program Files 里的软件 —— 程序本体判 E 保护,但 >180 天未用会再提示冷废弃(类 D)
  if (zone === "program") {
    // 更新残留/缓存子目录仍可处理
    if (f.hasCache || /-updater|_updater|electron-updater/.test(key)) {
      return { category: "A", reason: "软件更新残留/缓存,可删", confidence: "high" };
    }
    return { category: "E", reason: "已安装软件,保护不自动删", confidence: "high" };
  }

  // 1) 红线优先:E —— 任何 config/storage/memory/database/.openviking/.qclaw 特征都判 E
  if (f.hasStorage || f.name.toLowerCase().startsWith(".") || /memory|sqlite|database|indexeddb/.test(f.name.toLowerCase())) {
    // 注意:若子目录纯是 cache,仍可细分。这里对顶层这个"父目录"给 E 是保守策略。
    return { category: "E", reason: "命中红线特征(存储/记忆/数据库/点目录)", confidence: "high" };
  }

  // 2) 精确规则
  if (RULE_EXACT[key]) {
    const cat = RULE_EXACT[key];
    return { category: cat, reason: "精确规则命中", confidence: "high" };
  }

  // 3) 包含规则(先过 A 家族,再 E 家族等)
  for (const [sub, cat, note] of RULE_CONTAINS) {
    if (key.includes(sub)) {
      return { category: cat, reason: note, confidence: "high" };
    }
  }

  // 4) 未命中 -> 触发 LLM 兜底(由 classify.mjs 处理),这里返回 low 让上层决定
  return { category: null, reason: "未命中规则库,需 LLM 判断", confidence: "low" };
}

export function isCategory(cat) {
  return ["A", "B", "C", "D", "E", "P"].includes(cat);
}

export const CATEGORY_META = {
  A: { label: "无忧缓存", color: "green", action: "删 或 junction 搬", auto: true },
  B: { label: "官方可改址", color: "blue", action: "改软件设置到其他盘", auto: false },
  C: { label: "可junction搬", color: "cyan", action: "junction 搬到其他盘", auto: true },
  D: { label: "冷废弃软件", color: "orange", action: "提示你可能没用它了", auto: false },
  E: { label: "配置/记忆·红线", color: "red", action: "只展示,不执行", auto: false },
  P: { label: "个人文件", color: "purple", action: "只提醒大文件,可手动搬,绝不自动删", auto: false },
};

export { PROTECTED, extractFeature };
