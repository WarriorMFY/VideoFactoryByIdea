/* 导演编辑工具 · v0.11
   数据落盘：每个项目一个目录（Workspace/Projects/<id>/），project.json 是唯一真源；
   图片挂进来即上传到该目录的 assets/，t2i 产物落该目录的 t2i/。
   浏览器只存 UI 偏好（当前项目 / 当前 tab）。 */
(() => {
  const UI_KEY = "director-editor/ui";
  const TABS = [
    { id: "script", label: "剧本" },
    { id: "style", label: "风格" },
    { id: "anchors", label: "锚图" },
    { id: "shots", label: "分镜" },
    { id: "compose", label: "合成" }
  ];
  const STATUS_CYCLE = ["active", "paused", "done"];
  const STATUS_LABEL = { active: "进行中", paused: "暂停", done: "已结圈" };
  const ANCHOR_STATE = { locked: ["已锁", "ok"], draft: ["待定", "warn"], todo: ["未抽", ""] };
  /* 锚图抽屉的缺省集合：新项目与旧数据迁移共用。要加抽屉，往数据里加一条即可。 */
  const ANCHOR_DRAWERS = [
    { id: "site", label: "场地", hint: "场景与空间：光、材质、纵深由它定" },
    { id: "character", label: "角色", hint: "身份锚：正脸 / 全身 / 局部（手）分开存" },
    { id: "camera", label: "机位", hint: "机位之锚：定住它，关键帧与分镜都被框住" },
    { id: "key", label: "关键", hint: "关键帧与关键物：语义待定（首帧？道具？）" }
  ];

  const drawerSel = new Map(); // projId -> 当前抽屉 id（不落库）
  let state = { projects: [], activeId: null, tab: "script" };

  /* ---------- 存取：磁盘为准 ---------- */
  async function api(path, opt) {
    const r = await fetch(path, opt);
    const j = await r.json().catch(() => ({ ok: false, error: "返回不是 JSON" }));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  const putJSON = (path, body) =>
    api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const postJSON = (path, body) =>
    api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  function readUI() {
    try {
      return JSON.parse(localStorage.getItem(UI_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function writeUI() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ activeId: state.activeId, tab: state.tab }));
    } catch (e) {
      /* 隐私模式也无所谓，UI 偏好丢了不影响数据 */
    }
  }

  async function fetchProjects() {
    const j = await api("/api/state");
    return j.projects || [];
  }

  /* 首次启动：磁盘空 → 把种子物化成真实目录 */
  async function boot() {
    const ui = readUI();
    let list = [];
    try {
      list = await fetchProjects();
      if (!list.length && (window.SEED_PROJECTS || []).length) {
        toast("首次启动，正在把种子数据落成项目目录…");
        for (const p of window.SEED_PROJECTS) await postJSON("/api/project", p);
        list = await fetchProjects();
      }
    } catch (err) {
      toast("读不到项目目录：" + (err && err.message ? err.message : err) + "（serve.py 在跑吗）");
    }
    state.projects = list.map(normalize);
    state.activeId = list.some((p) => p.id === ui.activeId) ? ui.activeId : (list[0] && list[0].id) || null;
    /* #style / #anchors 可直接落地到某个 tab（截图与分享靠它） */
    const hashTab = String((typeof location !== "undefined" && location.hash) || "").replace("#", "");
    state.tab = TABS.some((t) => t.id === hashTab) ? hashTab : ui.tab || "script";
    writeUI();
    render();
  }

  /* 自动存盘：去抖 + 按项目串行（同一项目两次改动不并发，避免乱序覆盖） */
  const saveChain = new Map();
  let saveTimer = null;

  function save(delay = 400) {
    writeUI();
    clearTimeout(saveTimer);
    const pid = state.activeId;
    saveTimer = setTimeout(() => {
      const p = state.projects.find((x) => x.id === pid);
      if (!p) return;
      const prev = saveChain.get(p.id) || Promise.resolve();
      const next = prev
        .then(async () => {
          const j = await putJSON("/api/project/" + encodeURIComponent(p.id), p);
          p._dir = j.dir || p._dir;
          p._rel = j.rel || "";
          toast(`已存 ${(j.rel || j.dir || p.id)}/project.json · ${j.saved_at}`);
        })
        .catch((err) => toast("保存失败：" + (err && err.message ? err.message : err)));
      saveChain.set(p.id, next);
    }, delay);
  }

  /* 项目内相对路径 → 可访问 URL（按 id 解析到项目真实目录，支持任意盘符；改目录也跟着走） */
  const assetUrl = (projId, rel) => (rel ? `/projfile/${encodeURIComponent(projId)}/${rel}` : "");

  /* 旧 project.json 补默认字段 / 迁旧结构（磁盘上的文件可能来自更早的版本） */
  function guessDrawer(id) {
    const v = String(id || "");
    if (/^A1/i.test(v)) return "character";
    if (/^A2b/i.test(v) || /^A4/i.test(v)) return "camera";
    if (/^A[23]/i.test(v)) return "site";
    if (/^K/i.test(v)) return "key";
    return "uncat";
  }

  function normalize(p) {
    /* 单张 style → 风格卡数组（旧版一张即「已选」，迁过去就是锁定那张） */
    if (!Array.isArray(p.styles)) {
      const st = p.style || null;
      const has = st && ((st.name || "").trim() || (st.keywords || []).length || (st.palette || []).length);
      p.styles = has
        ? [{ id: "S1", name: st.name || "未命名风格", keywords: st.keywords || [], palette: st.palette || [], rules: st.rules || [], prompt: "", image: null }]
        : [];
      if (has) p.styleLockedId = "S1";
      delete p.style;
    }
    /* 扁平 anchors → 抽屉（按 id 前缀猜归属） */
    if (!Array.isArray(p.anchorGroups)) {
      const groups = ANCHOR_DRAWERS.map((g) => ({ id: g.id, label: g.label, hint: g.hint, items: [] }));
      (Array.isArray(p.anchors) ? p.anchors : []).forEach((a) => {
        let g = groups.find((x) => x.id === guessDrawer(a.id));
        if (!g) {
          g = groups.find((x) => x.id === "uncat");
          if (!g) groups.push((g = { id: "uncat", label: "未分类", hint: "从旧版扁平锚图迁入", items: [] }));
        }
        g.items.push(a);
      });
      p.anchorGroups = groups;
    }
    delete p.anchors;
    /* 锚图卡：name 只给人看，id 才是引用键（改名不断引用）；refs 存指针不存图 */
    (p.anchorGroups || []).forEach((g) =>
      (g.items || []).forEach((a) => {
        if (typeof a.name !== "string" || !a.name.trim()) a.name = a.id;
        if (!Array.isArray(a.refs)) a.refs = [];
        if (typeof a.prompt !== "string") a.prompt = "";
        if (!a.gen || typeof a.gen !== "object") a.gen = { channel: "g2", mode: "t2i" };
        if (!a.gen.channel) a.gen.channel = "g2";
      })
    );
    if (p.styleLockedId === undefined) p.styleLockedId = (p.styles[0] && p.styles[0].id) || null;
    if (p.styleLockedId && !p.styles.some((x) => x.id === p.styleLockedId)) p.styleLockedId = null;
    if (!Array.isArray(p.shots)) p.shots = [];
    if (!p.script) p.script = { logline: "", source: "", beats: [], notes: "" };
    if (!p.compose) p.compose = { duration: "0s", res: "", audio: "", checks: [], notes: "" };
    if (!p.budget) p.budget = { total: 300, spent: 0 };
    return p;
  }

  function cur() {
    return state.projects.find((p) => p.id === state.activeId) || state.projects[0];
  }

  /* ---------- 小工具 ---------- */
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const keys = path.split(".");
    const last = keys.pop();
    const tgt = keys.reduce((o, k) => o[k], obj);
    tgt[last] = val;
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 1600);
  }

  const ed = (path, text, cls = "", tag = "div") =>
    `<${tag} class="editable ${cls}" contenteditable="true" data-path="${path}" spellcheck="false">${esc(text)}</${tag}>`;

  /* 图片归属：assets/ 根＝定稿区（已锁定）；assets/uplock/＝撤回区（未锁定）；
     t2i/runs/ 等外部引用＝未锁定（只存路径，不复制）。状态直接由路径推导，不另存字段。 */
  function lockState(rel) {
    const f = String(rel || "").replace(/\\/g, "/");
    if (!f) return "none";
    if (f.indexOf("assets/uplock/") === 0) return "unlocked";
    if (f.indexOf("assets/") === 0) return "locked";
    return "unlocked";
  }

  function slotPill(projId, key, rel) {
    const st = lockState(rel);
    if (st === "none") return "";
    const on = st === "locked";
    return `<button class="lockpill ${on ? "on" : ""}" data-action="${on ? "img-unlock" : "img-lock"}"
      data-slot="${esc(key)}" data-proj="${esc(projId)}"
      title="${on ? "已锁定：图已复制进 assets/（定稿区）。点一下解锁 → 移到 assets/uplock/" : "未锁定：卡里只存引用路径。点一下锁定 → 复制进 assets/"}">
      <span class="lk">${on ? "🔒" : "🔓"}</span>${on ? "图已锁定" : "图未锁定"}</button>`;
  }

  function slot(projId, key, label, sub = "", tall = false, rel = "") {
    const url = assetUrl(projId, rel);
    const style = url ? `style="background-image:url('${url}')"` : "";
    return `<div class="slot ${tall ? "tall" : ""} ${url ? "has-img" : ""}" data-slot="${esc(key)}" data-proj="${esc(projId)}" ${style}>
      ${url ? "" : `<div class="ph"><b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`}
      ${slotPill(projId, key, rel)}
    </div>`;
  }

  /* ---------- 渲染：左栏 ---------- */
  function renderSidebar() {
    const items = state.projects
      .map((p) => {
        const shotsDone = (p.shots || []).filter((s) => /已出|已完成/.test(s.status || "")).length;
        return `<button class="project-item ${p.id === state.activeId ? "active" : ""}" data-action="open" data-id="${p.id}">
          <span class="pname">${esc(p.name)}</span>
          <span class="pmeta"><span><i class="dot ${p.status}"></i>${STATUS_LABEL[p.status] || ""}</span>
          <span>圈 ${p.circle}</span><span>${shotsDone}/${(p.shots || []).length} 镜</span></span>
        </button>`;
      })
      .join("");
    document.getElementById("project-list").innerHTML = items || `<div class="empty">还没有项目</div>`;
  }

  /* ---------- 渲染：头部 ---------- */
  /* 目录显示：仓库内给相对路径，仓库外给绝对路径 + 「外部」标记 */
  function dirView(p) {
    if (p._rel) return { label: "目录", text: p._rel + "/", ext: false };
    const d = String(p._dir || "").replace(/\\/g, "/");
    return { label: "外部目录", text: d || "（未绑定）", ext: true };
  }

  function renderHead(p) {
    const b = p.budget || { total: 0, spent: 0 };
    const over = b.spent > b.total;
    const dv = dirView(p);
    document.getElementById("head").innerHTML = `
      <h1>${ed("name", p.name)}</h1>
      <div class="chips">
        <button class="chip" data-action="cycle-status" title="点击切换状态">
          <i class="dot ${p.status}"></i><b>${STATUS_LABEL[p.status]}</b>
        </button>
        <span class="chip">圈 <b>${p.circle}</b></span>
        <span class="chip">更新 <b>${esc(p.updated || "-")}</b></span>
        <span class="chip ${over ? "over" : ""}">预算 <b>${b.spent} / ${b.total}</b>${over ? " · 超" + (b.spent - b.total).toFixed(2) : ""}</span>
        <button class="chip dir ${dv.ext ? "ext" : ""}" data-action="proj-dir" title="点一下改本地目录（可填任意路径，含其他盘符）">
          <span>${dv.label}</span> <b class="mono">${esc(dv.text)}</b>
        </button>
        <span class="chip">tab <b>${TABS.find((t) => t.id === state.tab).label}</b></span>
      </div>`;
  }

  /* ---------- 渲染：tab 条 ---------- */
  function renderTabs() {
    document.getElementById("tabs").innerHTML = TABS.map(
      (t, i) => `<button class="tab ${t.id === state.tab ? "active" : ""}" data-action="tab" data-tab="${t.id}">
        <span class="idx">${i + 1}</span>${t.label}</button>`
    ).join("");
  }

  /* ---------- 渲染：面板 ---------- */
  function renderPanel(p) {
    const fn = PANELS[state.tab] || PANELS.script;
    document.getElementById("panel").innerHTML = fn(p);
    autosizePrompts();
  }

  /* 提示词框按内容长高（整行取整，避免末行被裁一半）；超长再滚动 */
  function autosizePrompt(ta) {
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(ta) : null;
    const lh = (cs && parseFloat(cs.lineHeight)) || 20;
    const pad = (cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 16) + 2;
    ta.style.height = "auto";
    const lines = Math.max(4, Math.ceil((ta.scrollHeight - pad) / lh));
    ta.style.height = Math.min(lines, 16) * lh + pad + "px";
  }

  function autosizePrompts() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll("[data-prompt],[data-aprompt]").forEach(autosizePrompt);
  }

  /* 当前项目选中的抽屉；抽屉被删或首次进入则退回第一个 */
  function activeDrawer(p) {
    const gs = p.anchorGroups || [];
    if (!gs.length) return null;
    const want = drawerSel.get(p.id);
    return gs.find((g) => g.id === want) || gs[0];
  }

  /* ---------- 风格卡 ---------- */
  const NEW_COLORS = ["#E56020", "#1F3A5F", "#C9A227", "#F2EFE8", "#8A8F98", "#6B2E1B"];
  const generating = new Set(); // `${projId}:${styleId}` 正在走 t2i

  /* 风格卡的细节区（色板/关键词/硬规则）默认收起，展开态记在这（只影响界面，不落 project.json） */
  const FOLDS_KEY = "director-editor/folds";
  const folds = (() => {
    try {
      const a = JSON.parse(localStorage.getItem(FOLDS_KEY) || "[]");
      return new Set(Array.isArray(a) ? a.map(String) : []);
    } catch (e) {
      return new Set();
    }
  })();
  const foldKey = (p, s) => `${p.id}:${s.id}`;
  function setFold(k, open) {
    if (open) folds.add(k);
    else folds.delete(k);
    try {
      localStorage.setItem(FOLDS_KEY, JSON.stringify([...folds]));
    } catch (e) {
      /* 无痕模式丢了也只是展开态，不影响数据 */
    }
  }

  /* 提示词 = 关键词 + 色板 + 硬规则 + 一条底线；用户可在卡里改写并覆盖 */
  function buildPrompt(s) {
    const kws = (s.keywords || []).filter(Boolean);
    const pal = (s.palette || []).filter((c) => c && c.hex);
    const parts = [];
    if (kws.length) parts.push(kws.join("，"));
    if (pal.length) parts.push("色板只用这几种：" + pal.map((c) => (c.name || "") + c.hex).join(" / "));
    if ((s.rules || []).length) parts.push(s.rules.filter(Boolean).join("；"));
    parts.push("单帧空景，不含人物与文字");
    return parts.join("。");
  }

  function styleImage(p, s) {
    const rel = (s.image && s.image.file) || "";
    return { key: `styles.${s.id}.img`, rel, url: assetUrl(p.id, rel) };
  }

  function styleCardHTML(p, s, i, isLocked) {
    const img = styleImage(p, s);
    const gen = generating.has(`${p.id}:${s.id}`);
    const meta = s.image
      ? s.image.kind === "t2i"
        ? `t2i · 实扣 ${s.image.charged != null ? s.image.charged : "?"} · ${s.image.taskId ? String(s.image.taskId).slice(-6) : "-"} · ${s.image.file || ""}`
        : "本地图 · " + (s.image.file || "")
      : "";
    const sw = (s.palette || [])
      .map(
        (c, j) => `<div class="swatch">
          <label class="block" style="background:${esc(c.hex)}">
            <input type="color" value="${esc(c.hex)}" data-color="1" data-si="${i}" data-pj="${j}" title="点一下改色">
          </label>
          <div class="nm">${ed(`styles.${i}.palette.${j}.name`, c.name || "", "small")}</div>
          <div class="hx mono muted">${esc(c.hex)}<button class="x tiny" data-action="swatch-del" data-si="${i}" data-pj="${j}" title="删掉这格">×</button></div>
        </div>`
      )
      .join("");
    const kws = (s.keywords || [])
      .map(
        (k, j) => `<span class="chip kw">${esc(k)}<button class="x tiny" data-action="kw-del" data-si="${i}" data-kw="${j}" title="删掉">×</button></span>`
      )
      .join("");
    const rules = (s.rules || [])
      .map(
        (r, j) => `<li>${ed(`styles.${i}.rules.${j}`, r, "small")}<button class="x tiny" data-action="rule-del" data-si="${i}" data-rj="${j}" title="删掉">×</button></li>`
      )
      .join("");
    const open = folds.has(foldKey(p, s));
    return `<div class="card style-card ${isLocked ? "locked" : ""} ${open ? "open" : "folded"}" data-sid="${s.id}">
      <div class="head">
        <span class="sid">S${i + 1}</span>
        <span class="sname">${ed(`styles.${i}.name`, s.name)}</span>
        <span class="head-r">
          <button class="fold-btn" data-action="style-fold" data-si="${i}"
            title="${open ? "收起：只留卡头与风格图" : "展开：挂图 / 色板 / 关键词 / 规则 / 提示词"}"><span class="tri"></span></button>
          ${
            isLocked
              ? `<span class="tag ok">已锁定</span><button class="btn small" data-action="style-unlock" data-si="${i}">解锁</button>`
              : `<button class="btn small" data-action="style-lock" data-si="${i}" ${gen ? "disabled" : ""}>锁定为风格锚</button>`
          }
          <button class="x" data-action="style-del" data-si="${i}" title="删除这张卡">×</button>
        </span>
      </div>
      <div class="slot tall style-slot ${img.url ? "has-img" : ""}" data-slot="${img.key}" data-proj="${p.id}"
        ${img.url ? `style="background-image:url('${img.url}')"` : ""}>
        ${img.url ? "" : `<div class="ph"><b>风格图</b><span>点击挂本地图 · 或走 t2i（约 11 积分/张）</span></div>`}
        ${slotPill(p.id, img.key, img.rel)}
        ${gen ? `<div class="gen-mask"><span class="spin"></span>生成中…</div>` : ""}
      </div>
      <div class="card-body">
        <div class="imgbar">
          <button class="btn small" data-action="slot-pick" data-slot="${img.key}" data-proj="${p.id}">挂本地图</button>
          <button class="btn small" data-action="style-gen" data-si="${i}" ${gen || !(s.keywords || []).length ? "disabled" : ""}>走 t2i 生成</button>
          <span class="gen-note muted small">${esc(meta)}</span>
        </div>
        <div class="sec">
          <h3>色板 <button class="x tiny" data-action="swatch-add" data-si="${i}" title="加一格">＋</button></h3>
          <div class="palette">${sw || `<span class="muted small">还没色，点 ＋ 加一格</span>`}</div>
        </div>
        <div class="sec">
          <h3>关键词 <b class="cnt">${(s.keywords || []).length}</b></h3>
          <div class="chips kws">${kws || `<span class="muted small">还没词，下面加</span>`}</div>
          <input class="kwadd" placeholder="加关键词，回车确认" data-kwadd="${i}">
        </div>
        <div class="sec">
          <h3>硬规则 <button class="x tiny" data-action="rule-add" data-si="${i}" title="加一条">＋</button></h3>
          <ul class="plain rules">${rules || `<li class="muted small">没有规则</li>`}</ul>
        </div>
        <div class="sec promptbox">
          <h3>t2i 提示词
            <span class="muted small" style="font-weight:400">${s.prompt ? "自定义" : "自动拼 · 可直接改"}</span>
            ${s.prompt ? `<button class="btn small" data-action="prompt-reset" data-si="${i}" title="清空自定义，回到按卡自动拼">恢复自动</button>` : ""}
          </h3>
          <textarea data-prompt="${i}" rows="4" spellcheck="false">${esc(s.prompt || buildPrompt(s))}</textarea>
          <p class="muted small">留空则每次按关键词 / 色板 / 规则自动拼；写了就用你这份。</p>
        </div>
      </div>
    </div>`;
  }

  function curStyle(i) {
    const p = cur();
    return p && (p.styles || [])[Number(i)] ? { p, s: p.styles[Number(i)] } : null;
  }

  /* ---------- 锚图卡（v0.8 原型） ----------
     结构只看三块：头顶（名称 / 折叠 / 删）· 中间（图）· 底部（参考图列表 + 提示词）。
     引用只存指针 {kind,gid,aid} / {kind,sid} / {kind,rel}，不复制图片：
     源图一换，引用方跟着换；源被删，这里显「源失效」而不是静默变空。 */
  function refTarget(p, r) {
    if (!r) return null;
    if (r.kind === "style") {
      const s = (p.styles || []).find((x) => x.id === r.sid);
      if (!s || !s.image || !s.image.file) return null;
      return { name: s.name || s.id, tag: "风格卡 " + s.id, rel: s.image.file, url: assetUrl(p.id, s.image.file) };
    }
    if (r.kind === "anchor") {
      const g = (p.anchorGroups || []).find((x) => x.id === r.gid);
      const a = g && (g.items || []).find((x) => x.id === r.aid);
      if (!a || !a.src) return null;
      return { name: a.name || a.id, tag: (g.label || "") + " · " + a.id, rel: a.src, url: assetUrl(p.id, a.src) };
    }
    if (r.kind === "file") {
      if (!r.rel) return null;
      return { name: String(r.rel).split("/").pop(), tag: "本地", rel: r.rel, url: assetUrl(p.id, r.rel) };
    }
    return null;
  }

  /* 生成通道：refs = 最多吃几张图（0 = 纯文生图，不吃任何图）；mode 与通道联动 */
  const GEN_CHANNELS = [
    { id: "g2", label: "G-2.0 文生图", mode: "t2i", refs: 0, price: "≈10.7–12 积分/张", hint: "纯文生图" },
    { id: "flux3", label: "Flux3 图编辑", mode: "i2i", refs: 3, price: "≈20–33 积分/次 · 出 2 张 · 按实扣", hint: "1–3 张参考图，图1 为主" }
  ];
  const genChannel = (a) => GEN_CHANNELS.find((c) => c.id === ((a.gen || {}).channel || "g2")) || GEN_CHANNELS[0];

  /* 把「本卡主图 + 参考图」按图位排成一条池子，再按通道上限切：use 是喂进去的，drop 是被丢的 */
  function genPlan(p, a) {
    const ch = genChannel(a);
    const main = a.src ? [{ rel: a.src, name: a.name || a.id }] : [];
    const refs = (a.refs || []).map((r) => refTarget(p, r));
    const dead = refs.filter((x) => !x).length;
    const pool = main.concat(refs.filter(Boolean));
    return { ch, pool, use: pool.slice(0, ch.refs), drop: pool.slice(ch.refs), dead, mode: (a.gen || {}).mode || ch.mode };
  }

  /* 只有「真会丢图」才拦人：通道不吃参考图 / 参考图多于通道图位 / 有失效引用 */
  function genWarn(plan) {
    const { ch, pool, drop, dead, use } = plan;
    const msgs = [];
    if (ch.refs === 0 && pool.length) {
      msgs.push(`「${ch.label}」是纯文生图，不吃任何图：本卡现有 ${pool.length} 张（含主图：${pool.map((x) => x.name).join("、")}）都不会被使用，只按提示词重新出一张，当前主图会被新图替换（旧图仍在 t2i/runs/）。`);
    }
    if (ch.refs > 0 && drop.length) {
      msgs.push(`「${ch.label}」最多只吃 ${ch.refs} 张图（图位固定 图1→图${ch.refs}），本卡有 ${pool.length} 张，超出的 ${drop.length} 张不会被使用：${drop.map((x) => x.name).join("、")}。`);
    }
    if (ch.refs > 0 && !use.length) {
      msgs.push(`「${ch.label}」至少要 1 张图（图1），本卡现在一张可用图都没有。`);
    }
    if (dead) msgs.push(`有 ${dead} 条参考图已失效（源图被删或还没挂图），会被跳过。`);
    return msgs;
  }

  async function genAnchor(gid, aid) {
    const p = cur();
    const g = (p && (p.anchorGroups || []).find((x) => x.id === gid)) || null;
    const a = g && (g.items || []).find((x) => x.id === aid);
    if (!p || !a) return;
    const prompt = (a.prompt || buildAnchorPrompt(p, a)).trim();
    if (!prompt) {
      toast("先写提示词（或加参考图，让它按图自动拼）");
      return;
    }
    const plan = genPlan(p, a);
    const msgs = genWarn(plan);
    if (msgs.length) {
      if (!confirm(`生成前确认 · ${plan.ch.label}（${plan.ch.price}）\n\n${msgs.join("\n\n")}\n\n确认后照跑，继续？`)) return;
      if (plan.ch.refs > 0 && !plan.use.length) {
        toast("没有可用图，已中止");
        return;
      }
    }
    const tag = `${p.id}:${a.id}`;
    generating.add(tag);
    renderPanel(p);
    try {
      const j = await postJSON("/api/t2i", {
        projectId: p.id,
        channel: plan.ch.id,
        mode: plan.mode,
        prompt,
        ar: "3:4",
        res: "1k",
        name: `${p.id}-${a.id}`,
        refs: plan.use.map((x) => x.rel)
      });
      a.src = j.file;
      a.gen = {
        channel: plan.ch.id,
        mode: plan.mode,
        taskId: j.taskId,
        charged: j.charged,
        runId: j.id,
        files: j.files || [j.file],
        at: today()
      };
      p.updated = today();
      save();
      toast(`生成成功 · 实扣 ${j.charged != null ? j.charged : "?"}（${j.wall}s）· 出 ${(j.files || []).length} 张 → ${j.file}`);
    } catch (err) {
      toast("生成失败：" + (err && err.message ? err.message : err));
    } finally {
      generating.delete(tag);
      renderPanel(cur());
    }
  }

  const anchorFoldKey = (p, a) => `${p.id}:anc:${a.id}`;
  /* 截图与分享用：?open=all 让锚卡一次全展开（只影响渲染，不落库） */
  const OPEN_ALL = (() => {
    try {
      return new URLSearchParams(location.search).get("open") === "all";
    } catch (e) {
      return false;
    }
  })();

  /* 自动拼：本卡图 = 图1，参考图从图2 起；引用里若有风格卡，其关键词/色板自动进「保持」从句 */
  function buildAnchorPrompt(p, a) {
    const list = (a.refs || []).map((r) => refTarget(p, r)).filter(Boolean);
    if (!a.src && !list.length) return "";
    const st = (a.refs || []).map((r) => (r.kind === "style" ? (p.styles || []).find((x) => x.id === r.sid) : null)).find(Boolean);
    const keep = [];
    if (st) {
      const kw = (st.keywords || []).filter(Boolean).slice(0, 3);
      const pal = (st.palette || []).filter((c) => c && (c.name || c.hex)).slice(0, 3).map((c) => c.name || c.hex);
      if (kw.length) keep.push(kw.join("、"));
      if (pal.length) keep.push("主色 " + pal.join("、"));
    }
    const first = a.src ? a.name || a.id : list[0].name;
    const head = `以图1（${first}）为底，保持空间关系与光向${keep.length ? "；" + keep.join("；") : ""}。`;
    const rest = (a.src ? list : list.slice(1)).map((t, i) => `图${i + 2}（${t.name}）作参考。`).join("");
    return head + rest + "在这个空间里重新构图。";
  }

  const refPick = new Set(); // `${projId}:${anchorId}` 正在选参考图

  function refPickHTML(p, g, a) {
    const rows = [];
    (p.anchorGroups || []).forEach((gg) =>
      (gg.items || []).forEach((aa) => {
        if (!aa.src) return;
        if (gg.id === g.id && aa.id === a.id) return;
        rows.push(`<button class="pick" data-action="ref-add" data-kind="anchor" data-sgid="${gg.id}" data-said="${esc(aa.id)}" data-gid="${g.id}" data-aid="${esc(a.id)}" title="引用 ${esc(aa.id)}">
          <span class="pk-img" style="background-image:url('${assetUrl(p.id, aa.src)}')"></span>
          <span class="pk-t"><b>${esc(aa.name || aa.id)}</b><i>${esc(gg.label)} · ${esc(aa.id)}</i></span>
        </button>`);
      })
    );
    (p.styles || []).forEach((s) => {
      if (!s.image || !s.image.file) return;
      rows.push(`<button class="pick" data-action="ref-add" data-kind="style" data-sid="${esc(s.id)}" data-gid="${g.id}" data-aid="${esc(a.id)}" title="引用风格图 ${esc(s.name)}">
        <span class="pk-img" style="background-image:url('${assetUrl(p.id, s.image.file)}')"></span>
        <span class="pk-t"><b>${esc(s.name)}</b><i>风格卡 · ${esc(s.id)}</i></span>
      </button>`);
    });
    const body = rows.length
      ? rows.join("")
      : `<p class="muted small" style="margin:0; grid-column:1/-1">本项目还没有别的图可引：先给风格卡挂图，或给另一张锚图挂图。</p>`;
    return `<div class="refpick">
      ${body}
      <button class="pick local" data-action="ref-local" data-gid="${g.id}" data-aid="${esc(a.id)}">挂本地图，存进本项目 assets/</button>
      <p class="muted small" style="margin:2px 0 0; grid-column:1/-1">引用是活指针：源图换了这里跟着换；顺序即图位（图1 / 图2 …）。</p>
    </div>`;
  }

  function anchorCardHTML(p, g, a, gi, ai) {
    const k = anchorFoldKey(p, a);
    const open = OPEN_ALL || folds.has(k);
    const url = a.src ? assetUrl(p.id, a.src) : "";
    const refs = (a.refs || []).map((r, ri) => ({ ri, t: refTarget(p, r) }));
    const off = a.src ? 2 : 1; // 本卡图占图1，参考图从图2 起
    const refHTML = refs
      .map(({ ri, t }) =>
        t
          ? `<div class="ref" style="background-image:url('${t.url}')" title="${esc(t.tag)}">
              <span class="no mono">${ri + off}</span>
              <button class="x tiny" data-action="ref-del" data-gid="${g.id}" data-aid="${esc(a.id)}" data-ri="${ri}" title="从参考图里移除">×</button>
              <span class="rtag">${esc(t.name)}</span>
            </div>`
          : `<div class="ref dead" title="源图已删或还没挂图，引用失效">
              <span class="no mono">${ri + off}</span>
              <button class="x tiny" data-action="ref-del" data-gid="${g.id}" data-aid="${esc(a.id)}" data-ri="${ri}" title="移除这条失效引用">×</button>
              <span class="rtag">源失效</span>
            </div>`
      )
      .join("");
    const prompt = a.prompt || buildAnchorPrompt(p, a);
    const gen = generating.has(`${p.id}:${a.id}`);
    const ch = genChannel(a);
    const mode = (a.gen || {}).mode || ch.mode;
    const meta = a.gen && a.gen.runId ? `${ch.label} · 实扣 ${a.gen.charged != null ? a.gen.charged : "?"} · ${esc(a.gen.runId)} · ${(a.gen.files || []).length} 张` : "";
    return `<div class="card anchor-card ${open ? "open" : "folded"}" data-aid="${esc(a.id)}">
      <div class="head">
        <span class="aname">${ed(`anchorGroups.${gi}.items.${ai}.name`, a.name || a.id)}</span>
        <span class="head-r">
          <button class="fold-btn" data-action="anchor-fold" data-gid="${g.id}" data-aid="${esc(a.id)}"
            title="${open ? "收起：只留名称与图" : "展开：参考图 / 提示词 / 生成"}"><span class="tri"></span></button>
          <button class="x" data-action="anchor-del" data-gid="${g.id}" data-aid="${esc(a.id)}" title="删除这张锚（${esc(a.id)}）">×</button>
        </span>
      </div>
      <div class="slot tall ${url ? "has-img" : ""}" data-slot="anchors.${g.id}.${a.id}" data-proj="${p.id}"
        ${url ? `style="background-image:url('${url}')"` : ""}>
        ${url ? "" : `<div class="ph"><b>点击挂图</b><span>存进本项目 assets/</span></div>`}
        ${slotPill(p.id, `anchors.${g.id}.${a.id}`, a.src || "")}
        ${gen ? `<div class="gen-mask"><span class="spin"></span>生成中…</div>` : ""}
      </div>
      ${meta ? `<div class="gen-note muted small mono">${meta}</div>` : ""}
      <div class="card-body">
        <div class="sec">
          <h3>参考图 <b class="cnt">${refs.length}</b>
            <button class="btn small" data-action="ref-pick" data-gid="${g.id}" data-aid="${esc(a.id)}">${refPick.has(`${p.id}:${a.id}`) ? "收起" : "＋ 引用"}</button>
          </h3>
          <div class="refs">${refHTML || `<span class="muted small">还没有参考图</span>`}</div>
          ${refPick.has(`${p.id}:${a.id}`) ? refPickHTML(p, g, a) : ""}
        </div>
        <div class="sec promptbox">
          <h3>提示词
            <span class="muted small" style="font-weight:400">${a.prompt ? "自定义" : "自动拼 · 可直接改"}</span>
            ${a.prompt ? `<button class="btn small" data-action="aprompt-reset" data-gid="${g.id}" data-aid="${esc(a.id)}">恢复自动</button>` : ""}
          </h3>
          <textarea data-aprompt="${g.id}|${esc(a.id)}" rows="3" spellcheck="false" placeholder="留空则按参考图自动拼（图1 为底，其余作参考）">${esc(prompt)}</textarea>
        </div>
        <div class="genbar">
          <div class="seg" role="group" aria-label="生成模式">
            <button class="segbtn ${mode === "t2i" ? "active" : ""}" data-action="agen-mode" data-gid="${g.id}" data-aid="${esc(a.id)}" data-mode="t2i" title="文生图：只用提示词">文生图</button>
            <button class="segbtn ${mode === "i2i" ? "active" : ""}" data-action="agen-mode" data-gid="${g.id}" data-aid="${esc(a.id)}" data-mode="i2i" title="图生图：把图1（及参考图）喂给通道">图生图</button>
          </div>
          <select class="chan" data-chan="${g.id}|${esc(a.id)}" title="生成通道（不同通道吃图张数不同）">
            ${GEN_CHANNELS.map((c) => `<option value="${c.id}" ${c.id === ch.id ? "selected" : ""}>${esc(c.label)} · ${esc(c.hint)}</option>`).join("")}
          </select>
          <div class="genrow">
            <span class="gen-cost muted small">${esc(ch.price)} · ${planText(a, p)}</span>
            <button class="btn small primary" data-action="anchor-gen" data-gid="${g.id}" data-aid="${esc(a.id)}" ${gen ? "disabled" : ""}>${gen ? "生成中…" : "生成"}</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* 一行说清「这次会喂几张、丢几张」，省得每次点生成才知道 */
  function planText(a, p) {
    const plan = genPlan(p, a);
    if (plan.ch.refs === 0) return "只按提示词出图";
    const s = `喂 ${plan.use.length} 张`;
    return plan.drop.length ? `${s} · 丢 ${plan.drop.length} 张` : s;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function blankStyle(p) {
    const n = (p.styles || []).length + 1;
    return {
      id: "S" + Date.now().toString(36),
      name: "未命名风格 " + n,
      keywords: [],
      palette: [],
      rules: [],
      prompt: "",
      image: null
    };
  }

  async function genStyle(i) {
    const hit = curStyle(i);
    if (!hit) return;
    const { p, s } = hit;
    const prompt = (s.prompt || buildPrompt(s)).trim();
    if (!prompt) {
      toast("先写关键词或提示词");
      return;
    }
    const tag = `${p.id}:${s.id}`;
    generating.add(tag);
    renderPanel(p);
    try {
      const r = await fetch("/api/t2i", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ar: "3:4", res: "1k", name: `${p.id}-${s.id}`, projectId: p.id })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "通道返回失败");
      s.image = { kind: "t2i", file: j.file, taskId: j.taskId, charged: j.charged, runId: j.id };
      s.prompt = prompt;
      p.updated = today();
      save();
      toast(`生成成功 · 实扣 ${j.charged != null ? j.charged : "?"}（${j.wall}s）→ ${p.id}/${j.file}`);
    } catch (err) {
      toast("生成失败：" + (err && err.message ? err.message : err));
    } finally {
      generating.delete(tag);
      renderPanel(cur());
    }
  }


  const PANELS = {
    /* 1. 剧本 */
    script(p) {
      const s = p.script || { beats: [] };
      const rows = (s.beats || [])
        .map(
          (b, i) => `<tr>
            <td class="num">${b.no || i + 1}</td>
            <td>${ed(`script.beats.${i}.name`, b.name)}</td>
            <td><span class="tag">${esc(b.role)}</span></td>
            <td>${ed(`script.beats.${i}.hook`, b.hook)}</td>
          </tr>`
        )
        .join("");
      return `
      <div class="grid two">
        <div class="card">
          <h3>一句话</h3>
          ${ed("script.logline", s.logline, "logline")}
          <p class="muted small" style="margin:12px 0 0">来源：<span class="mono">${esc(s.source || "-")}</span></p>
        </div>
        <div class="card">
          <h3>说明</h3>
          ${ed("script.notes", s.notes || "", "small")}
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>因果链 / 镜卡摘要（${(s.beats || []).length} 条）</h3>
        <table><thead><tr><th>#</th><th>名字</th><th>功能</th><th>戏眼</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">还没有镜</td></tr>`}</tbody></table>
      </div>`;
    },

    /* 2. 风格：多张风格卡，只能锁定一张当风格锚 */
    style(p) {
      const list = p.styles || [];
      const locked = list.find((s) => s.id === p.styleLockedId) || null;
      const cards = list.map((s, i) => styleCardHTML(p, s, i, s.id === p.styleLockedId)).join("");
      return `
      <div class="card style-top">
        <div>
          <h3>风格锚</h3>
          <p class="muted small" style="margin:0">一个项目可存多张风格卡，但<b>只能锁定一张</b>当风格锚。锚 = 全片画风基准；换锚等于下游全重走（技能铁律）。</p>
        </div>
        <div class="st-right">
          <div class="chips">
            <span class="chip ${locked ? "" : "over"}">当前锚 <b>${locked ? esc(locked.name) : "未锁"}</b></span>
            <span class="chip">风格卡 <b>${list.length}</b></span>
          </div>
          <button class="btn small primary" data-action="style-new">＋ 新建风格卡</button>
        </div>
      </div>
      <div class="grid styles">
        ${cards || `<div class="empty" style="grid-column:1/-1">还没有风格卡，点右上「＋ 新建风格卡」</div>`}
      </div>`;
    },

    /* 3. 锚图（左抽屉 + 右网格） */
    anchors(p) {
      const groups = p.anchorGroups || [];
      const g = activeDrawer(p);
      const total = groups.reduce((n, x) => n + (x.items || []).length, 0);
      const nav = groups
        .map(
          (x, i) => `<button class="drawer ${g && x.id === g.id ? "active" : ""}" data-action="group" data-gid="${x.id}">
            <span class="no">${i + 1}</span><span class="lb">${esc(x.label)}</span><span class="cnt">${(x.items || []).length}</span>
          </button>`
        )
        .join("");
      const gi = groups.indexOf(g);
      const cards = g
        ? (g.items || []).map((a, ai) => anchorCardHTML(p, g, a, gi, ai)).join("")
        : "";
      return `
        <div class="card" style="margin-bottom:14px">
          <h3>锚图（${total}）</h3>
          <p class="muted small" style="margin:0">一张锚 = 名称 + 图 + 参考图 + 提示词。锚与锚之间、锚与风格卡之间是<b>互相引用</b>的关系（引用活指针，源图换了跟着换）。点图挂本地文件，文件存进本项目目录的 <span class="mono">assets/</span>。</p>
        </div>
        <div class="subshell">
          <nav class="drawers">
            <div class="drawers-head">抽屉</div>
            ${nav}
            <button class="drawer-add" data-action="group-add">＋ 新抽屉</button>
          </nav>
          <section class="drawer-body">
            ${g
              ? `<div class="drawer-head">
                  <span class="dh-title">${esc(g.label)}<b>${(g.items || []).length}</b></span>
                  <span class="dh-hint">${esc(g.hint || "")}</span>
                  <button class="btn small" data-action="anchor-add" data-gid="${g.id}">＋ 新增锚</button>
                </div>
                <div class="grid anchors">${cards || `<div class="empty" style="grid-column:1/-1">这个抽屉还空着</div>`}</div>`
              : `<div class="empty">还没有抽屉，点左侧「＋ 新抽屉」</div>`}
          </section>
        </div>`;
    },

    /* 4. 分镜 */
    shots(p) {
      const rows = (p.shots || [])
        .map((s, i) => {
          const cls = /未开始/.test(s.status) ? "" : /候选|半过/.test(s.status) ? "warn" : "ok";
          return `<tr>
            <td class="num">${s.no || i + 1}</td>
            <td><b>${esc(s.title)}</b><div class="muted small mono">${esc(s.time)}</div></td>
            <td class="small">${esc(s.size)}<div class="muted">${esc(s.move)}</div></td>
            <td>${ed(`shots.${i}.action`, s.action, "small")}</td>
            <td>${ed(`shots.${i}.firstFrame`, s.firstFrame, "small muted")}</td>
            <td style="width:150px">${slot(p.id, `shots.${s.no}`, "首帧", "", false, s.src || "")}</td>
            <td><span class="tag ${cls}">${esc(s.status)}</span></td>
          </tr>`;
        })
        .join("");
      return `<div class="card">
        <h3>镜头表（${(p.shots || []).length} 镜）</h3>
        <table><thead><tr><th>#</th><th>镜 / 时间</th><th>景别 / 机位</th><th>动作</th><th>首帧卡</th><th>首帧</th><th>状态</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">还没有镜头</td></tr>`}</tbody></table>
      </div>`;
    },

    /* 5. 合成 */
    compose(p) {
      const c = p.compose || { checks: [] };
      const b = p.budget || { total: 1, spent: 0 };
      const pct = Math.min(100, Math.round((b.spent / Math.max(1, b.total)) * 100));
      const over = b.spent > b.total;
      const checks = (c.checks || [])
        .map(
          (k, i) => `<label class="check"><input type="checkbox" data-check="${i}" ${k.done ? "checked" : ""}>
            <span>${esc(k.label)}</span></label>`
        )
        .join("");
      const done = (c.checks || []).filter((k) => k.done).length;
      return `
      <div class="grid two">
        <div class="card">
          <h3>成片参数</h3>
          <table>
            <tr><th>总长</th><td>${ed("compose.duration", c.duration)}</td></tr>
            <tr><th>画面</th><td>${ed("compose.res", c.res)}</td></tr>
            <tr><th>音轨</th><td>${ed("compose.audio", c.audio)}</td></tr>
          </table>
          <div style="margin-top:14px">
            <div class="chips"><span class="chip">预算 <b>${b.spent} / ${b.total}</b></span>
            <span class="chip ${over ? "over" : ""}">${over ? "已超 " + (b.spent - b.total).toFixed(2) : "余 " + (b.total - b.spent).toFixed(2)}</span></div>
            <div class="bar ${over ? "over" : ""}"><i style="width:${pct}%"></i></div>
          </div>
        </div>
        <div class="card">
          <h3>合成前检查（${done}/${(c.checks || []).length}）</h3>
          ${checks || `<p class="muted">未定义检查项</p>`}
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>备注</h3>
        ${ed("compose.notes", c.notes || "", "small")}
      </div>
      <div class="card" style="margin-top:14px">
        <h3>合成</h3>
        <p class="muted small" style="margin:0 0 10px">原型阶段未接入 ffmpeg；这里先占位，讨论后再定接口。</p>
        <button class="btn small" disabled>拼接成片（未接入）</button>
      </div>`;
    }
  };

  /* ---------- 全量渲染 ---------- */
  function render() {
    const p = cur();
    renderSidebar();
    if (!p) {
      document.getElementById("head").innerHTML = "";
      document.getElementById("tabs").innerHTML = "";
      document.getElementById("panel").innerHTML = `<div class="empty">左侧新建一个项目开始</div>`;
      return;
    }
    if (!TABS.some((t) => t.id === state.tab)) state.tab = "script";
    renderHead(p);
    renderTabs();
    renderPanel(p);
  }

  /* ---------- 事件 ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.dataset.action;
    if (act === "open") {
      state.activeId = el.dataset.id;
      state.tab = "script";
      save();
      render();
    } else if (act === "tab") {
      state.tab = el.dataset.tab;
      save();
      render();
    } else if (act === "group") {
      const p = cur();
      if (!p) return;
      drawerSel.set(p.id, el.dataset.gid);
      renderPanel(p);
    } else if (act === "group-add") {
      const p = cur();
      if (!p) return;
      const name = (prompt("新抽屉名（例：道具 / 文字 / 参考片）") || "").trim();
      if (!name) return;
      const id = "g" + Date.now().toString(36);
      p.anchorGroups = p.anchorGroups || [];
      p.anchorGroups.push({ id, label: name, hint: "", items: [] });
      drawerSel.set(p.id, id);
      save();
      renderPanel(p);
      toast("已加抽屉 " + name);
    } else if (act === "anchor-add") {
      const p = cur();
      const g = (p && (p.anchorGroups || []).find((x) => x.id === el.dataset.gid)) || null;
      if (!g) return;
      const name = (prompt("锚名称（例：A1 酒坊内角 / K4 首帧）") || "").trim();
      if (!name) return;
      const id = "a" + Date.now().toString(36);
      g.items.push({ id, name, refs: [], prompt: "", src: null, note: "", kind: "未标注", status: "todo" });
      save();
      renderPanel(p);
      toast("已加锚 " + name);
    } else if (act === "anchor-del") {
      const p = cur();
      const g = (p && (p.anchorGroups || []).find((x) => x.id === el.dataset.gid)) || null;
      if (!g) return;
      const aid = el.dataset.aid;
      const i = (g.items || []).findIndex((a) => a.id === aid);
      if (i < 0) return;
      const a = g.items[i];
      const usedBy = (p.anchorGroups || []).reduce(
        (n, gg) => n + (gg.items || []).filter((x) => x.id !== aid && (x.refs || []).some((r) => r.kind === "anchor" && r.gid === g.id && r.aid === aid)).length,
        0
      );
      const warn = usedBy ? `\n\n注意：有 ${usedBy} 张锚图引用着它，删掉后那些引用会变成「源失效」。` : "";
      if (!confirm(`删除锚「${a.name || aid}」？${warn}`)) return;
      g.items.splice(i, 1);
      save();
      renderPanel(p);
      toast("已删 " + (a.name || aid));
    } else if (act === "anchor-fold") {
      const p = cur();
      const g = (p && (p.anchorGroups || []).find((x) => x.id === el.dataset.gid)) || null;
      const a = g && (g.items || []).find((x) => x.id === el.dataset.aid);
      if (!a) return;
      const k = anchorFoldKey(p, a);
      setFold(k, !folds.has(k));
      renderPanel(p);
    } else if (act === "ref-pick") {
      const p = cur();
      const key = `${p.id}:${el.dataset.aid}`;
      if (refPick.has(key)) refPick.delete(key);
      else refPick.add(key);
      renderPanel(p);
    } else if (act === "ref-add") {
      const p = cur();
      const g = (p.anchorGroups || []).find((x) => x.id === el.dataset.gid);
      const a = g && (g.items || []).find((x) => x.id === el.dataset.aid);
      if (!a) return;
      a.refs = a.refs || [];
      const kind = el.dataset.kind;
      const r =
        kind === "anchor"
          ? { kind, gid: el.dataset.sgid, aid: el.dataset.said }
          : { kind, sid: el.dataset.sid };
      const dup = a.refs.some((x) => (kind === "anchor" ? x.kind === "anchor" && x.gid === r.gid && x.aid === r.aid : x.kind === "style" && x.sid === r.sid));
      if (dup) {
        toast("这张图已经在参考图里了");
        return;
      }
      a.refs.push(r);
      refPick.delete(`${p.id}:${a.id}`);
      save();
      renderPanel(p);
      toast(`已引用为图${a.refs.length + (a.src ? 1 : 0)}`);
    } else if (act === "ref-del") {
      const p = cur();
      const g = (p.anchorGroups || []).find((x) => x.id === el.dataset.gid);
      const a = g && (g.items || []).find((x) => x.id === el.dataset.aid);
      if (!a) return;
      a.refs = a.refs || [];
      a.refs.splice(Number(el.dataset.ri), 1);
      save();
      renderPanel(p);
    } else if (act === "ref-local") {
      const p = cur();
      if (!p) return;
      pickFile(p.id, `anchors.${el.dataset.gid}.${el.dataset.aid}.refs`);
    } else if (act === "agen-mode") {
      const p = cur();
      const g = (p.anchorGroups || []).find((x) => x.id === el.dataset.gid);
      const a = g && (g.items || []).find((x) => x.id === el.dataset.aid);
      if (!a) return;
      const mode = el.dataset.mode;
      const pick = GEN_CHANNELS.find((c) => c.mode === mode) || genChannel(a);
      a.gen = Object.assign({}, a.gen || {}, { mode, channel: pick.id });
      save();
      renderPanel(p);
    } else if (act === "anchor-gen") {
      genAnchor(el.dataset.gid, el.dataset.aid);
    } else if (act === "aprompt-reset") {
      const p = cur();
      const g = (p.anchorGroups || []).find((x) => x.id === el.dataset.gid);
      const a = g && (g.items || []).find((x) => x.id === el.dataset.aid);
      if (!a) return;
      a.prompt = "";
      save();
      renderPanel(p);
      toast("已恢复按参考图自动拼");
    } else if (act === "style-new") {
      const p = cur();
      if (!p) return;
      p.styles = p.styles || [];
      const s = blankStyle(p);
      p.styles.push(s);
      save();
      renderPanel(p);
      toast("新建风格卡 " + s.name);
    } else if (act === "style-del") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      if (!confirm(`删除风格卡「${s.name}」？`)) return;
      p.styles = p.styles.filter((x) => x.id !== s.id);
      if (p.styleLockedId === s.id) p.styleLockedId = null;
      save();
      renderPanel(p);
      toast("已删风格卡");
    } else if (act === "style-lock") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      const prev = (p.styles || []).find((x) => x.id === p.styleLockedId);
      if (prev && prev.id !== s.id) {
        if (!confirm(`当前锚是「${prev.name}」。换成「${s.name}」= 换风格锚，按铁律下游（关键帧 / 分镜）全部重走。继续？`)) return;
      }
      p.styleLockedId = s.id;
      p.updated = today();
      save();
      renderPanel(p);
      toast("已锁定风格锚：" + s.name);
    } else if (act === "style-unlock") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      if (!confirm(`解除「${s.name}」的风格锚锁定？`)) return;
      p.styleLockedId = null;
      save();
      renderPanel(p);
      toast("已解锁，当前无风格锚");
    } else if (act === "style-gen") {
      genStyle(el.dataset.si);
    } else if (act === "style-fold") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      const k = foldKey(p, s);
      setFold(k, !folds.has(k));
      renderPanel(p);
    } else if (act === "prompt-reset") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      s.prompt = "";
      save();
      renderPanel(p);
      toast("已恢复为自动拼（关键词 + 色板 + 规则）");
    } else if (act === "swatch-add") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      s.palette = s.palette || [];
      s.palette.push({ hex: NEW_COLORS[s.palette.length % NEW_COLORS.length], name: "" });
      save();
      renderPanel(p);
    } else if (act === "swatch-del") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      s.palette.splice(Number(el.dataset.pj), 1);
      save();
      renderPanel(p);
    } else if (act === "kw-del") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      s.keywords.splice(Number(el.dataset.kw), 1);
      save();
      renderPanel(p);
    } else if (act === "rule-add") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      s.rules = s.rules || [];
      s.rules.push("");
      save();
      renderPanel(p);
    } else if (act === "rule-del") {
      const hit = curStyle(el.dataset.si);
      if (!hit) return;
      const { p, s } = hit;
      s.rules.splice(Number(el.dataset.rj), 1);
      save();
      renderPanel(p);
    } else if (act === "slot-pick") {
      pickFile(el.dataset.proj, el.dataset.slot);
    } else if (act === "img-lock") {
      toggleImgLock(el.dataset.proj, el.dataset.slot, true);
    } else if (act === "img-unlock") {
      toggleImgLock(el.dataset.proj, el.dataset.slot, false);
    } else if (act === "cycle-status") {
      const p = cur();
      if (!p) return;
      const i = STATUS_CYCLE.indexOf(p.status);
      p.status = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
      p.updated = today();
      save();
      render();
    } else if (act === "proj-dir") {
      moveProjectDir();
    } else if (act === "new") {
      createProject();
    }
  });

  /* 文本编辑 */
  document.addEventListener("focusout", (e) => {
    const el = e.target.closest(".editable");
    if (!el) return;
    const p = cur();
    if (!p) return;
    const next = el.innerText.replace(/\u00a0/g, " ").trim();
    const prev = getPath(p, el.dataset.path);
    if (next === prev) return;
    setPath(p, el.dataset.path, next);
    save();
    toast("已改 " + el.dataset.path);
  });

  /* 复选框 / 取色器 */
  document.addEventListener("change", (e) => {
    const chSel = e.target.closest("[data-chan]");
    if (chSel) {
      const p = cur();
      const [gid, aid] = String(chSel.dataset.chan).split("|");
      const g = (p && (p.anchorGroups || []).find((x) => x.id === gid)) || null;
      const a = g && (g.items || []).find((x) => x.id === aid);
      if (!a) return;
      const c = GEN_CHANNELS.find((x) => x.id === chSel.value) || GEN_CHANNELS[0];
      a.gen = Object.assign({}, a.gen || {}, { channel: c.id, mode: c.mode });
      save();
      renderPanel(p);
      return;
    }
    const col = e.target.closest("[data-color]");
    if (col) {
      const hit = curStyle(col.dataset.si);
      if (!hit) return;
      const cell = (hit.s.palette || [])[Number(col.dataset.pj)];
      if (!cell) return;
      cell.hex = col.value;
      save();
      renderPanel(hit.p);
      return;
    }
    const cb = e.target.closest("[data-check]");
    if (!cb) return;
    const p = cur();
    p.compose.checks[Number(cb.dataset.check)].done = cb.checked;
    save();
    renderPanel(p);
  });

  /* 提示词文本域：边改边存（去抖） */
  document.addEventListener("input", (e) => {
    const ap = e.target.closest("[data-aprompt]");
    if (ap) {
      const p = cur();
      if (!p) return;
      const [gid, aid] = String(ap.dataset.aprompt).split("|");
      const g = (p.anchorGroups || []).find((x) => x.id === gid);
      const a = g && (g.items || []).find((x) => x.id === aid);
      if (!a) return;
      a.prompt = ap.value;
      autosizePrompt(ap);
      save(600);
      return;
    }
    const ta = e.target.closest("[data-prompt]");
    if (!ta) return;
    const hit = curStyle(ta.dataset.prompt);
    if (!hit) return;
    hit.s.prompt = ta.value;
    autosizePrompt(ta);
    save(600);
  });

  /* 图片槽：选完即上传到本项目目录 assets/，把相对路径写回 project.json */
  let fileInput = null;

  function setSlotFile(p, key, rel) {
    const parts = String(key).split(".");
    if (parts[0] === "styles" && parts[2] === "img") {
      const s = (p.styles || []).find((x) => x.id === parts[1]);
      if (s) s.image = Object.assign({}, s.image || {}, { file: rel });
      return !!s;
    }
    if (parts[0] === "anchors") {
      const gid = parts[1];
      /* 参考图里挂本地图：不是主图，追加到 refs 末尾 */
      if (parts[3] === "refs") {
        const g = (p.anchorGroups || []).find((x) => x.id === gid);
        const a = g && (g.items || []).find((x) => x.id === parts[2]);
        if (!a) return false;
        a.refs = a.refs || [];
        a.refs.push({ kind: "file", rel });
        return true;
      }
      const aid = parts.slice(2).join(".");
      const g = (p.anchorGroups || []).find((x) => x.id === gid);
      const a = g && (g.items || []).find((x) => x.id === aid);
      if (a) a.src = rel;
      return !!a;
    }
    if (parts[0] === "shots") {
      const no = Number(parts[1]);
      const s = (p.shots || []).find((x) => Number(x.no) === no);
      if (s) s.src = rel;
      return !!s;
    }
    return false;
  }

  /* 由图片槽 key 反查当前相对路径（锁定/解锁要拿它当源） */
  function slotRel(p, key) {
    const parts = String(key).split(".");
    if (parts[0] === "styles" && parts[2] === "img") {
      const s = (p.styles || []).find((x) => x.id === parts[1]);
      return (s && s.image && s.image.file) || "";
    }
    if (parts[0] === "anchors") {
      const g = (p.anchorGroups || []).find((x) => x.id === parts[1]);
      const a = g && (g.items || []).find((x) => x.id === parts.slice(2).join("."));
      return (a && a.src) || "";
    }
    if (parts[0] === "shots") {
      const s = (p.shots || []).find((x) => Number(x.no) === Number(parts[1]));
      return (s && s.src) || "";
    }
    return "";
  }

  /* 锁定 = 复制进 assets/ 根；解锁 = 已定稿的图移到 assets/uplock/ */
  async function toggleImgLock(projId, slotKey, doLock) {
    const p = state.projects.find((x) => x.id === projId);
    if (!p) return;
    const rel = slotRel(p, slotKey);
    if (!rel) return;
    const verb = doLock ? "锁定" : "解锁";
    toast(`${verb}中…`);
    try {
      const r = await fetch(`/api/project/${encodeURIComponent(projId)}/${doLock ? "lock" : "unlock"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: slotKey, rel })
      });
      const j = await r.json().catch(() => ({ ok: false, error: "返回不是 JSON" }));
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setSlotFile(p, slotKey, j.file);
      p.updated = today();
      save();
      render();
      toast(j.moved === false ? `${verb}完成（${j.note || "无需移动文件"}）` : `${verb}完成：${j.file}`);
    } catch (err) {
      toast(`${verb}失败：` + (err && err.message ? err.message : err));
    }
  }

  function pickFile(projId, slotKey) {
    const p = state.projects.find((x) => x.id === projId);
    if (!p) return;
    toast("已打开系统选择框（从项目目录开始）…");
    fetch(`/api/project/${encodeURIComponent(projId)}/pickfile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: slotKey })
    })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (j && j.ok && j.cancelled) {
          toast("已取消");
          return;
        }
        if (j && j.ok && j.file) {
          const q = state.projects.find((x) => x.id === projId) || p;
          setSlotFile(q, slotKey, j.file);
          q.updated = today();
          save();
          render();
          const from = j.from ? `（来自 ${j.from}）` : "";
          toast(`已存 ${projId}/${j.file}（${Math.round((j.bytes || 0) / 1024)} KB）${from}`);
          return;
        }
        pickFileBrowser(projId, slotKey); // 系统框不可用 → 退回浏览器上传
      })
      .catch(() => pickFileBrowser(projId, slotKey));
  }

  function pickFileBrowser(projId, slotKey) {
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*,video/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
    }
    fileInput.onchange = async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!f) return;
      const p = state.projects.find((x) => x.id === projId);
      if (!p) return;
      toast("上传中… " + f.name);
      try {
        const qs = `?slot=${encodeURIComponent(slotKey)}&name=${encodeURIComponent(f.name)}`;
        const r = await fetch(`/api/project/${encodeURIComponent(projId)}/asset${qs}`, {
          method: "POST",
          headers: { "Content-Type": f.type || "application/octet-stream" },
          body: f
        });
        const j = await r.json().catch(() => ({ ok: false, error: "返回不是 JSON" }));
        if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
        setSlotFile(p, slotKey, j.file);
        p.updated = today();
        save();
        render();
        toast(`已存 ${projId}/${j.file}（${Math.round((j.bytes || 0) / 1024)} KB）`);
      } catch (err) {
        toast("上传失败：" + (err && err.message ? err.message : err));
      }
    };
    fileInput.click();
  }

  document.addEventListener("click", (e) => {
    const s = e.target.closest(".slot");
    if (!s) return;
    if (e.target.closest("[data-action]")) return; // 锁钉 / 挂图按钮有自己的动作，别再弹一次选图
    pickFile(s.dataset.proj, s.dataset.slot);
  });

  /* 新建项目模板：一个项目 = 一个目录 */
  function blankProject() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const id = `p-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return {
      id,
      name: "未命名项目",
      circle: 0,
      status: "active",
      updated: today(),
      budget: { total: 300, spent: 0 },
      script: { logline: "写下这一条的一句话。", source: "", beats: [], notes: "" },
      styles: [],
      styleLockedId: null,
      anchorGroups: ANCHOR_DRAWERS.map((g) => ({ id: g.id, label: g.label, hint: g.hint, items: [] })),
      shots: [],
      compose: { duration: "0s", res: "1056×608 · 24fps", audio: "", checks: [], notes: "" }
    };
  }

  async function createProject() {
    const p = blankProject();
    const dir = prompt(
      `新项目放哪个目录？可直接填绝对路径（如 D:/片子/封坛、\\\\NAS\\share\\片）。` +
        `\n留空则用默认 Workspace/Projects/${p.id}/`,
      ""
    );
    if (dir === null) return; // 点了取消
    if (dir.trim()) p.dir = dir.trim();
    try {
      const j = await postJSON("/api/project", p);
      state.projects = await fetchProjects();
      state.activeId = j.id;
      state.tab = "script";
      writeUI();
      render();
      toast("已建目录 " + (j.rel || j.dir));
    } catch (err) {
      toast("新建失败：" + (err && err.message ? err.message : err));
    }
  }

  async function moveProjectDir() {
    const p = cur();
    if (!p) return;
    const now = p._dir || "";
    const next = prompt(
      `项目目录（绝对路径或相对名都行；改到别的盘会整体搬过去）\n现在：${now}`,
      now
    );
    if (next === null) return;
    const v = next.trim();
    if (!v) return;
    clearTimeout(saveTimer); // 别让排队中的 PUT 用旧目录把文件又写回原地
    try {
      const j = await postJSON(`/api/project/${encodeURIComponent(p.id)}/move`, { dir: v });
      state.projects = await fetchProjects();
      state.activeId = j.id;
      writeUI();
      render();
      toast(`已移到 ${j.rel || j.dir}`);
    } catch (err) {
      toast("改目录失败：" + (err && err.message ? err.message : err));
    }
  }

  document.getElementById("btn-new").addEventListener("click", createProject);

  document.getElementById("btn-reset").addEventListener("click", async () => {
    if (!confirm("从磁盘重载？未保存的改动会丢（每次改动其实都已自动存盘）。")) return;
    try {
      state.projects = await fetchProjects();
      if (!state.projects.some((p) => p.id === state.activeId)) state.activeId = state.projects[0] && state.projects[0].id;
      render();
      toast("已从项目目录重载 " + state.projects.length + " 个项目");
    } catch (err) {
      toast("重载失败：" + (err && err.message ? err.message : err));
    }
  });

  /* 键盘：1-5 切 tab；关键词输入框里回车即添加 */
  document.addEventListener("keydown", (e) => {
    const kw = e.target.closest ? e.target.closest("[data-kwadd]") : null;
    if (kw && e.key === "Enter") {
      e.preventDefault();
      const hit = curStyle(kw.dataset.kwadd);
      if (!hit) return;
      const raw = (kw.value || "").trim();
      if (!raw) return;
      hit.s.keywords = hit.s.keywords || [];
      raw.split(/[,，;；\s]+/).filter(Boolean).forEach((k) => {
        if (!hit.s.keywords.includes(k)) hit.s.keywords.push(k);
      });
      save();
      renderPanel(hit.p);
      toast("已加关键词");
      return;
    }
    if (e.target.isContentEditable) return;
    const tag = (e.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key >= "1" && e.key <= "5") {
      state.tab = TABS[Number(e.key) - 1].id;
      save();
      render();
    }
  });

  /* 允许用 #style / #anchors 直达某个 tab（截图与分享都靠它） */
  boot();
})();
