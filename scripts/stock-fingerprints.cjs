#!/usr/bin/env node
/* 输出 module-template/config 各模板的 stock 指纹，用于更新
 * native/src/profiles.rs 的 STOCK_FINGERPRINTS。
 * 复刻 profiles::stock_fingerprint：解析后的值去掉 meta 的 OWNED_META
 * 字段，经 json::stringify（BTreeMap 排序 + 2 空格缩进）序列化后 FNV-1a 64。
 * profiles.rs 的 tests::shipped_templates_are_stock 保证列表与模板一致。 */
"use strict";
const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "module-template", "config");
const OWNED_META = [
  "name", "author", "version", "module_id", "module_version",
  "profile_id", "profile_schema", "soc_id", "processor",
];

function fnv1a64(bytes) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash;
}

function serialize(value, depth = 0) {
  const pad = "  ".repeat(depth);
  const padIn = "  ".repeat(depth + 1);
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return String(Math.trunc(value));
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return "[\n" + value.map((item) => padIn + serialize(item, depth + 1)).join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(value).sort();
  if (!keys.length) return "{}";
  return "{\n" + keys.map((key) => `${padIn}${JSON.stringify(key)}: ${serialize(value[key], depth + 1)}`).join(",\n") + "\n" + pad + "}";
}

function fingerprint(root) {
  const copy = JSON.parse(JSON.stringify(root));
  for (const key of OWNED_META) delete copy.meta[key];
  return fnv1a64(Buffer.from(serialize(copy), "utf8"));
}

const out = {};
for (const file of fs.readdirSync(CONFIG_DIR).filter((name) => name.endsWith(".json"))) {
  const config = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), "utf8"));
  out[file] = "0x" + fingerprint(config).toString(16).padStart(16, "0");
}
for (const [file, hash] of Object.entries(out)) console.log(`${file}\t${hash}`);
