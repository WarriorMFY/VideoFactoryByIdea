/* 无浏览器冒烟测试：用假 DOM 跑 data.js + app.js。
   用法：node _smoke.js        验收新版种子数据
         node _smoke.js --old  验收旧版扁平 anchors 的迁移 */
const OLD = process.argv.includes("--old");
const OLD_FIXTURE = {
  activeId: "c1", tab: "script",
  projects: [{
    id: "c1", name: "旧项目", circle: 1, status: "active",
    budget: { total: 1, spent: 0 },
    script: { logline: "x", beats: [] }, style: {},
    anchors: [
      { id: "A1-x", kind: "角色", status: "locked", note: "n1" },
      { id: "A4-y", kind: "机位", status: "draft", note: "n2" },
      { id: "K9-z", kind: "关键", status: "draft", note: "n3" },
      { id: "Q-other", kind: "?", status: "todo", note: "n4" }
    ],
    shots: [], compose: { checks: [] }
  }]
};
const handlers = {};
function fakeEl() {
  return {
    innerHTML: "", textContent: "", style: {},
    classList: { add() {}, remove() {} },
    appendChild() {}, addEventListener() {},
  };
}
const nodes = new Map();
global.window = {};
global.localStorage = { getItem: () => (OLD ? JSON.stringify(OLD_FIXTURE) : null), setItem() {}, removeItem() {} };
global.document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, fakeEl());
    return nodes.get(id);
  },
  addEventListener(type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
  },
  body: fakeEl(),
  createElement: () => fakeEl(),
};

require("./data.js");
require("./app.js");

/* 键盘 3 切到锚图 */
handlers.keydown.forEach((fn) => fn({ target: { isContentEditable: false }, key: "3" }));

if (OLD) {
  const h = nodes.get("panel").innerHTML;
  const counts = [...h.matchAll(/<span class="cnt">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  const mChecks = [
    ["旧项目名保留", nodes.get("head").innerHTML.includes("旧项目")],
    ["五个抽屉（含未分类）", (h.match(/class="drawer /g) || []).length === 5],
    ["按前缀分配 0/1/1/1/1", JSON.stringify(counts) === "[0,1,1,1,1]"],
    ["锚数合计 4", counts.reduce((a, b) => a + b, 0) === 4],
  ];
  let mBad = 0;
  for (const [name, ok] of mChecks) {
    console.log((ok ? "PASS " : "FAIL ") + name);
    if (!ok) mBad++;
  }
  console.log(mBad ? "迁移失败" : "旧数据迁移 OK");
  process.exit(mBad ? 1 : 0);
}

const html = nodes.get("panel").innerHTML;
const checks = [
  ["subshell", html.includes('class="subshell"')],
  ["drawers", html.includes('class="drawers"')],
  ["抽屉 1 场地", html.includes(">场地<")],
  ["抽屉 2 角色", html.includes(">角色<")],
  ["抽屉 3 机位", html.includes(">机位<")],
  ["抽屉 4 关键", html.includes(">关键<")],
  ["新抽屉按钮", html.includes("新抽屉")],
  ["新增锚按钮", html.includes("新增锚")],
  ["默认选中第一个", /class="drawer active" data-action="group" data-gid="site"/.test(html)],
  ["卡片带删除", html.includes('data-action="anchor-del"')],
  ["卡片数量=场地 4 张", (html.match(/class="card anchor-card"/g) || []).length === 4],
];
let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) bad++;
}
if (bad) process.exit(1);
console.log("锚图抽屉渲染 OK");

/* ---------- 事件路径 ---------- */
function click(action, extra = {}) {
  const el = { dataset: { action, ...extra } };
  const ev = { target: { closest: (sel) => (sel === "[data-action]" ? el : null) } };
  handlers.click.forEach((fn) => fn(ev));
  return nodes.get("panel").innerHTML;
}
const promptQueue = ["测试抽屉", "T-test"];
global.prompt = () => promptQueue.shift() || "";
global.confirm = () => true;

let h = click("group", { gid: "camera" });
console.log((/class="drawer active"[^>]*data-gid="camera"/.test(h) ? "PASS " : "FAIL ") + "切到机位抽屉");
console.log(((h.match(/class="card anchor-card"/g) || []).length === 2 ? "PASS " : "FAIL ") + "机位抽屉 2 张卡");

h = click("group-add");
const newGid = (h.match(/class="drawer active"[^>]*data-gid="([^"]+)"/) || [])[1];
console.log((h.includes("测试抽屉") && newGid && newGid.startsWith("g") ? "PASS " : "FAIL ") + "新抽屉已加并选中：" + newGid);
console.log((h.includes('data-gid="site"') ? "PASS " : "FAIL ") + "原四个抽屉仍在");

h = click("anchor-add", { gid: newGid });
console.log((h.includes("T-test") ? "PASS " : "FAIL ") + "新抽屉里加了一张锚");

h = click("anchor-del", { gid: newGid, aid: "T-test" });
console.log((!h.includes("T-test") && h.includes("这个抽屉还空着") ? "PASS " : "FAIL ") + "删掉后回到空抽屉");
