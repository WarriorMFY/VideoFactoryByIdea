/* 无浏览器冒烟测试：用假 DOM + 假服务端跑 data.js + app.js。
   用法：node script/_smoke.js      验收磁盘化后的新版（在 Tool/director-editor 下执行）
        node script/_smoke.js --old  验收旧格式 project.json
         node _smoke.js --old     验收旧格式 project.json（缺 styles / anchorGroups）也能渲染

   app.js 已改成「磁盘为准」：启动时 GET /api/state，空则把种子 POST 落盘。
   这里用内存 store 模拟这组接口，顺带把落盘路径也测了。 */
const OLD = process.argv.includes("--old");
const OLD_PROJECT = {
  id: "c1", name: "旧项目", circle: 1, status: "active",
  budget: { total: 1, spent: 0 },
  script: { logline: "x", beats: [] },
  style: { name: "旧的单张风格", keywords: ["a"], palette: [{ hex: "#111111", name: "黑" }] },
  anchors: [
    { id: "A1-x", kind: "角色", status: "locked", note: "n1" },
    { id: "A4-y", kind: "机位", status: "draft", note: "n2" },
    { id: "K9-z", kind: "关键", status: "draft", note: "n3" },
    { id: "Q-other", kind: "?", status: "todo", note: "n4" }
  ],
  shots: []
};

/* ---------- 假服务端 ---------- */
const store = new Map(); // id -> project
const dirs = new Map(); // id -> 绝对目录
let assets = 0;
const replies = [];
const rel = (d) => (d.startsWith("Workspace/Projects/") ? d : "");
function jsonResp(obj, code = 200) {
  return { ok: code < 400, status: code, json: async () => obj };
}
global.fetch = async (url, opt = {}) => {
  const method = (opt.method || "GET").toUpperCase();
  const path = String(url).split("?")[0];
  replies.push(method + " " + path);
  if (path === "/api/state") {
    const projects = [...store.values()].map((p) => ({
      ...p,
      _dir: dirs.get(p.id) || "Workspace/Projects/" + p.id,
      _rel: rel(dirs.get(p.id) || "Workspace/Projects/" + p.id),
    }));
    return jsonResp({ ok: true, projects });
  }
  if (path === "/api/project" && method === "POST") {
    const p = JSON.parse(opt.body);
    store.set(p.id, p);
    dirs.set(p.id, p.dir || "Workspace/Projects/" + p.id);
    delete p.dir;
    return jsonResp({ ok: true, id: p.id, dir: dirs.get(p.id), rel: rel(dirs.get(p.id)) });
  }
  let m = /^\/api\/project\/([^/]+)\/asset$/.exec(path);
  if (m) {
    assets += 1;
    const file = `assets/up-${assets}.png`;
    return jsonResp({ ok: true, file, url: `/projfile/${m[1]}/${file}`, bytes: 2048 });
  }
  m = /^\/api\/project\/([^/]+)\/(lock|unlock)$/.exec(path);
  if (m) {
    const b = JSON.parse(opt.body);
    const stem = String(b.slot || "x").replace(/\./g, "-");
    const file = m[2] === "lock" ? `assets/${stem}.png` : `assets/uplock/${String(b.rel).split("/").pop()}`;
    return jsonResp({ ok: true, file, from: b.rel, moved: m[2] === "unlock" });
  }
  m = /^\/api\/project\/([^/]+)\/move$/.exec(path);
  if (m) {
    const pid = decodeURIComponent(m[1]);
    const to = JSON.parse(opt.body).dir;
    const p = store.get(pid);
    if (!p) return jsonResp({ ok: false, error: "项目不存在" }, 404);
    const abs = /^[A-Za-z]:[\\/]/.test(to) || to.startsWith("/") ? to.replace(/\\/g, "/") : "Workspace/Projects/" + to;
    dirs.set(pid, abs);
    return jsonResp({ ok: true, id: pid, dir: abs, rel: rel(abs) });
  }
  m = /^\/api\/project\/([^/]+)$/.exec(path);
  if (m && method === "PUT") {
    const pid = decodeURIComponent(m[1]);
    store.set(pid, JSON.parse(opt.body));
    const d = dirs.get(pid) || "Workspace/Projects/" + pid;
    return jsonResp({ ok: true, id: pid, dir: d, rel: rel(d), saved_at: "00:00:00" });
  }
  if (path === "/api/t2i") {
    return jsonResp({ ok: true, id: "t-stub", taskId: "999", charged: 11.35, file: "t2i/runs/t-stub/out.png", wall: 50 });
  }
  return jsonResp({ ok: false, error: "no route " + path }, 404);
};

/* ---------- 假 DOM ---------- */
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
global.localStorage = {
  _v: {},
  getItem(k) { return this._v[k] == null ? null : this._v[k]; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; },
};
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
global.prompt = () => "";
global.confirm = () => true;

if (OLD) store.set(OLD_PROJECT.id, OLD_PROJECT);

let pass = 0;
let fail = 0;
function check(name, ok) {
  console.log((ok ? "PASS " : "FAIL ") + name);
  ok ? pass++ : fail++;
}
const panel = () => nodes.get("panel").innerHTML;
const head = () => nodes.get("head").innerHTML;
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function click(action, extra = {}) {
  const el = { dataset: { action, ...extra }, disabled: false };
  const ev = { target: { closest: (sel) => (sel === "[data-action]" ? el : null) } };
  handlers.click.forEach((fn) => fn(ev));
}

(async () => {
  require("../html/data.js");
  require("../html/app.js");
  await tick(60); // 等 boot() 落盘 + 首屏渲染

  if (OLD) {
    /* 旧格式落在磁盘上：默认 tab 是剧本，先按 3 切到锚图 */
    handlers.keydown.forEach((fn) => fn({ target: { isContentEditable: false, tagName: "BODY" }, key: "3" }));
    const h = panel();
    const counts = [...h.matchAll(/<span class="cnt">(\d+)<\/span>/g)].map((m) => Number(m[1]));
    check("旧项目名保留", head().includes("旧项目"));
    check("五个抽屉（含未分类）", (h.match(/class="drawer /g) || []).length === 5);
    check("按前缀分配 0/1/1/1/1", JSON.stringify(counts) === "[0,1,1,1,1]");
    check("锚数合计 4", counts.reduce((a, b) => a + b, 0) === 4);
    handlers.keydown.forEach((fn) => fn({ target: { isContentEditable: false, tagName: "BODY" }, key: "2" }));
    const sth = panel();
    check("旧单张 style 迁成一张风格卡", (sth.match(/class="card style-card/g) || []).length === 1);
    check("旧单张 style 迁后即锁定", /已锁定<\/span>/.test(sth));
    console.log(fail ? "旧格式兼容失败" : "旧格式 project.json 兼容 OK");
    process.exit(fail ? 1 : 0);
  }

  /* ---------- 磁盘化：种子落盘 ---------- */
  check("首次启动把种子 POST 成项目目录", store.size === (window.SEED_PROJECTS || []).length && store.size > 0);
  check("/api/state 被调用", replies.includes("GET /api/state"));
  check("项目头显示本地目录", head().includes("Workspace/Projects/") && head().includes('data-action="proj-dir"'));
  check("UI 偏好只存 activeId/tab", !!localStorage.getItem("director-editor/ui") && !localStorage.getItem("director-editor/v1"));

  /* ---------- 锚图抽屉 ---------- */
  handlers.keydown.forEach((fn) => fn({ target: { isContentEditable: false, tagName: "BODY" }, key: "3" }));
  let html = panel();
  check("subshell", html.includes('class="subshell"'));
  check("drawers", html.includes('class="drawers"'));
  check("抽屉 1 场地", html.includes(">场地<"));
  check("抽屉 2 角色", html.includes(">角色<"));
  check("抽屉 3 机位", html.includes(">机位<"));
  check("抽屉 4 关键", html.includes(">关键<"));
  check("新抽屉按钮", html.includes("新抽屉"));
  check("新增锚按钮", html.includes("新增锚"));
  check("默认选中第一个", /class="drawer active" data-action="group" data-gid="site"/.test(html));
  check("卡片带删除", html.includes('data-action="anchor-del"'));
  check("卡片数量=场地 4 张", (html.match(/class="card anchor-card[^"]*"/g) || []).length === 4);
  check("锚卡有生成按钮", html.includes('data-action="anchor-gen"'));
  check("锚卡有模式分段（文生图 / 图生图）", html.includes('data-mode="t2i"') && html.includes('data-mode="i2i"'));
  check("锚卡有通道选择且含 Flux3", html.includes('data-chan="site|') && html.includes('value="flux3"'));
  check("生成条标了价格", html.includes("积分/"));
  check("锚卡有折叠钮", html.includes('data-action="anchor-fold"'));

  const firstAid = (html.match(/data-action="anchor-del" data-gid="site" data-aid="([^"]+)"/) || [])[1];
  click("agen-mode", { gid: "site", aid: firstAid, mode: "i2i" });
  html = panel();
  const selSeg = (html.match(/data-action="agen-mode"[^>]*data-mode="i2i"/g) || []).length;
  check("切图生图后模式高亮", /class="segbtn active"[^>]*data-mode="i2i"/.test(html));
  check("切图生图后通道自动选 Flux3", new RegExp('data-chan="site\\|' + firstAid + '"[\\s\\S]{0,500}value="flux3" selected').test(html));
  click("agen-mode", { gid: "site", aid: firstAid, mode: "t2i" });
  check("切回文生图通道回 G-2.0", new RegExp('data-chan="site\\|' + firstAid + '"[\\s\\S]{0,500}value="g2" selected').test(panel()));

  global.prompt = (() => {
    const q = ["测试抽屉", "T-test"];
    return () => q.shift() || "";
  })();
  html = click("group", { gid: "camera" }) || panel();
  check("切到机位抽屉", /class="drawer active"[^>]*data-gid="camera"/.test(html));
  check("机位抽屉 2 张卡", (html.match(/class="card anchor-card[^"]*"/g) || []).length === 2);

  click("group-add");
  html = panel();
  const newGid = (html.match(/class="drawer active"[^>]*data-gid="([^"]+)"/) || [])[1];
  check("新抽屉已加并选中", !!newGid && newGid.startsWith("g"));
  check("原四个抽屉仍在", html.includes('data-gid="site"'));

  click("anchor-add", { gid: newGid });
  html = panel();
  check("新抽屉里加了一张锚", html.includes("T-test"));
  const newAid = (html.match(new RegExp(`data-action="anchor-del" data-gid="${newGid}" data-aid="([^"]+)"`)) || [])[1];
  check("新锚有稳定 id（与名称分离）", !!newAid && newAid !== "T-test");
  click("anchor-del", { gid: newGid, aid: newAid });
  check("删掉后回到空抽屉", !panel().includes("T-test") && panel().includes("这个抽屉还空着"));

  /* ---------- 风格页 ---------- */
  handlers.keydown.forEach((fn) => fn({ target: { isContentEditable: false, tagName: "BODY" }, key: "2" }));
  await tick(0);
  let sh = panel();
  check("风格卡 2 张", (sh.match(/class="card style-card/g) || []).length === 2);
  check("只有 1 张已锁定", (sh.match(/已锁定<\/span>/g) || []).length === 1);
  check("新建按钮在", sh.includes('data-action="style-new"'));
  check("色板可改色", (sh.match(/class="block"[\s\S]{0,80}data-color="1"/g) || []).length >= 7);
  check("有挂本地图按钮", sh.includes('data-action="slot-pick"'));
  check("有 t2i 生成按钮", sh.includes('data-action="style-gen"'));
  check("关键词带删除", sh.includes('data-action="kw-del"'));
  check("锁定卡带解锁", sh.includes('data-action="style-unlock"'));
  check("未锁卡带锁定", sh.includes('data-action="style-lock"'));
  check("种子风格图走项目相对路径", sh.includes("/projfile/c32/t2i/runs/"));

  /* 图片锁定：assets/ 根＝已锁定，assets/uplock/ 或 runs 引用＝未锁定 */
  check("有图的卡带锁定钉", /class="lockpill[^"]*" data-action="img-(lock|unlock)"/.test(sh));
  check("t2i 产物默认未锁定（只存引用不复制）", /class="lockpill[^"]*" data-action="img-lock"[\s\S]{0,120}data-slot="styles\.S1\.img"/.test(sh));
  click("img-lock", { proj: "c32", slot: "styles.S1.img" });
  await tick(60);
  check("锁定后图落 assets/", panel().includes("assets/styles-S1-img.png"));
  check("锁定后钉子变已锁定", /class="lockpill on" data-action="img-unlock"/.test(panel()));
  check("锁定确实打了 /lock", replies.includes("POST /api/project/c32/lock"));
  check("锁定结果写回 project.json", store.get("c32").styles[0].image.file === "assets/styles-S1-img.png");
  click("img-unlock", { proj: "c32", slot: "styles.S1.img" });
  await tick(60);
  check("解锁后图移到 assets/uplock/", panel().includes("assets/uplock/"));
  check("解锁后钉子回未锁定", /class="lockpill[^"]*" data-action="img-lock"[\s\S]{0,120}data-slot="styles\.S1\.img"/.test(panel()));
  check("解锁确实打了 /unlock", replies.includes("POST /api/project/c32/unlock"));

  /* 整卡折叠：收起只留卡头 + 风格图；展开才出按钮 / 色板 / 关键词 / 规则 / 提示词 */
  check("每张卡各有一个折叠按钮", (sh.match(/class="fold-btn" data-action="style-fold"/g) || []).length === 2);
  check("默认是折叠态（只显示卡头与图）", (sh.match(/class="card style-card[^"]*folded/g) || []).length === 2);
  check("折叠时内容仍在 DOM、由 class 控制显隐", sh.includes('class="card-body"') && sh.includes('data-action="swatch-add"'));
  check("挂图按钮与提示词同属 body（折叠时一起藏）", /class="card-body"[\s\S]*?data-action="slot-pick"[\s\S]*?class="sec promptbox"/.test(sh));
  check("折叠按钮内是三角（CSS 控制方向）", (sh.match(/<span class="tri">/g) || []).length === 2);

  click("style-fold", { si: "0" });
  sh = panel();
  check("点开后该卡变 open", (sh.match(/class="card style-card[^"]*open/g) || []).length === 1);
  check("展开态写进 localStorage", /c32:S1/.test(localStorage.getItem("director-editor/folds") || ""));
  check("展开态与 open 类互斥（折叠卡无 open）", (sh.match(/class="card style-card[^"]*open/g) || []).length === 1);
  handlers.keydown.forEach((fn) => fn({ target: { isContentEditable: false, tagName: "BODY" }, key: "4" }));
  handlers.keydown.forEach((fn) => fn({ target: { isContentEditable: false, tagName: "BODY" }, key: "2" }));
  sh = panel();
  check("重绘后展开态保持", (sh.match(/class="card style-card[^"]*open/g) || []).length === 1);
  click("style-fold", { si: "0" });
  sh = panel();
  check("再点收回折叠", (sh.match(/class="card style-card[^"]*folded/g) || []).length === 2);

  sh = click("style-lock", { si: "1" }) || panel();
  const lockedName = (sh.match(/当前锚 <b>([^<]*)<\/b>/) || [])[1] || "";
  check("换锚后仍只有一张锁定", (sh.match(/已锁定<\/span>/g) || []).length === 1 && lockedName.includes("航站白夜"));
  check("换锚后新卡可解锁", sh.includes('data-action="style-unlock"'));

  click("style-new");
  check("新建第三张风格卡", (panel().match(/class="card style-card/g) || []).length === 3);

  handlers.keydown.forEach((fn) =>
    fn({
      target: {
        isContentEditable: false,
        tagName: "INPUT",
        value: "测试词，第二个",
        closest: (sel) => (sel === "[data-kwadd]" ? { dataset: { kwadd: "2" }, value: "测试词，第二个" } : null),
      },
      key: "Enter",
      preventDefault() {},
    })
  );
  sh = panel();
  check("回车加关键词（逗号拆两词）", sh.includes("测试词") && sh.includes("第二个"));

  const before = (sh.match(/class="card style-card/g) || []).length;
  click("style-del", { si: "2" });
  check("删风格卡", (panel().match(/class="card style-card/g) || []).length === before - 1);

  /* ---------- 落盘路径（本轮重点） ---------- */
  const proj = [...store.values()].find((p) => p.id === "c32");
  check("项目已落盘（内存 store 里有 project.json 等价物）", !!proj && Array.isArray(proj.styles));

  /* 保存去抖：等 500ms 看是否 PUT */
  const putBefore = replies.filter((r) => r.startsWith("PUT /api/project/")).length;
  click("tab", { tab: "shots" });
  await tick(700);
  check("切 tab 后触发 PUT 保存", replies.filter((r) => r.startsWith("PUT /api/project/")).length > putBefore);

  /* 改目录：只换目录，id 不动 */
  global.prompt = () => "c32-renamed";
  click("proj-dir");
  await tick(80);
  check("改目录成默认根下的新名", dirs.get("c32") === "Workspace/Projects/c32-renamed");
  check("改目录后 id 不变", !!store.get("c32") && !store.get("c32-renamed"));
  check("目录 chip 显示新路径", head().includes("c32-renamed"));

  /* 指到别的盘：这是本轮用户要的能力 */
  global.prompt = () => "D:/片子/封坛";
  click("proj-dir");
  await tick(80);
  check("可指到其他盘符的绝对路径", dirs.get("c32") === "D:/片子/封坛");
  check("外部目录在头上有标记", head().includes("外部目录") && head().includes("D:/片子/封坛"));
  check("指到外部后 id 仍稳定", !!store.get("c32"));

  /* 新建项目：prompt 里填绝对路径 */
  global.prompt = () => "E:/CardStudio/新片";
  const nBefore = store.size;
  click("new");
  await tick(120);
  const fresh = [...dirs.entries()].find(([id]) => id !== "c32" && id !== "c31" && dirs.get(id) === "E:/CardStudio/新片");
  check("新建项目时能直接指定外部目录", !!fresh);
  check("新建后项目数 +1", store.size === nBefore + 1);

  console.log(fail ? `\n${fail} 项失败` : `\n全部通过（${pass} 项）`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("崩溃：", e);
  process.exit(1);
});
