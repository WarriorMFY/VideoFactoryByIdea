/* 导演编辑工具 · 快速原型
   状态全在前端：localStorage 存数据，图片用 objectURL 临时挂载（刷新即失效）。 */
(() => {
  const LS_KEY = "director-editor/v1";
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

  const sessionImages = new Map(); // `${projId}:${slotKey}` -> objectURL
  const drawerSel = new Map(); // projId -> 当前抽屉 id（不落库）
  let state = load();

  /* ---------- 存取 ---------- */
  function seed() {
    return {
      projects: JSON.parse(JSON.stringify(window.SEED_PROJECTS)),
      activeId: window.SEED_PROJECTS[0].id,
      tab: "script"
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return seed();
      const s = JSON.parse(raw);
      if (!s.projects || !s.projects.length) return seed();
      return migrate(s);
    } catch (e) {
      return seed();
    }
  }

  /* 旧版（扁平 anchors 数组）→ 新版（anchorGroups 抽屉），按 id 前缀猜归属 */
  function migrate(s) {
    s.projects.forEach((p) => {
      if (Array.isArray(p.anchorGroups)) return;
      const old = Array.isArray(p.anchors) ? p.anchors : [];
      const groups = ANCHOR_DRAWERS.map((g) => ({ id: g.id, label: g.label, hint: g.hint, items: [] }));
      old.forEach((a) => {
        let g = groups.find((x) => x.id === guessDrawer(a.id));
        if (!g) {
          g = groups.find((x) => x.id === "uncat");
          if (!g) groups.push((g = { id: "uncat", label: "未分类", hint: "从旧版扁平锚图迁入", items: [] }));
        }
        g.items.push(a);
      });
      p.anchorGroups = groups;
      delete p.anchors;
    });
    return s;
  }

  function guessDrawer(id) {
    const v = String(id || "");
    if (/^A1/i.test(v)) return "character";
    if (/^A2b/i.test(v) || /^A4/i.test(v)) return "camera";
    if (/^A[23]/i.test(v)) return "site";
    if (/^K/i.test(v)) return "key";
    return "uncat";
  }

  let saveTimer = null;
  function save(delay = 0) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      toast("已保存到本地（localStorage）");
    }, delay);
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

  function slot(projId, key, label, sub = "", tall = false) {
    const url = sessionImages.get(`${projId}:${key}`);
    const style = url ? `style="background-image:url('${url}')"` : "";
    return `<div class="slot ${tall ? "tall" : ""} ${url ? "has-img" : ""}" data-slot="${key}" data-proj="${projId}" ${style}>
      ${url ? "" : `<div class="ph"><b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`}
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
  function renderHead(p) {
    const b = p.budget || { total: 0, spent: 0 };
    const over = b.spent > b.total;
    document.getElementById("head").innerHTML = `
      <h1>${ed("name", p.name)}</h1>
      <div class="chips">
        <button class="chip" data-action="cycle-status" title="点击切换状态">
          <i class="dot ${p.status}"></i><b>${STATUS_LABEL[p.status]}</b>
        </button>
        <span class="chip">圈 <b>${p.circle}</b></span>
        <span class="chip">更新 <b>${esc(p.updated || "-")}</b></span>
        <span class="chip ${over ? "over" : ""}">预算 <b>${b.spent} / ${b.total}</b>${over ? " · 超" + (b.spent - b.total).toFixed(2) : ""}</span>
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
  }

  /* 当前项目选中的抽屉；抽屉被删或首次进入则退回第一个 */
  function activeDrawer(p) {
    const gs = p.anchorGroups || [];
    if (!gs.length) return null;
    const want = drawerSel.get(p.id);
    return gs.find((g) => g.id === want) || gs[0];
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

    /* 2. 风格 */
    style(p) {
      const st = p.style || {};
      const sw = (st.palette || [])
        .map(
          (c) => `<div class="swatch"><div class="block" style="background:${c.hex}"></div>
            <div class="nm">${esc(c.name)}</div><div class="hx mono muted">${esc(c.hex)}</div></div>`
        )
        .join("");
      const refs = (st.refs || [])
        .map(
          (r) => `<div class="card"><h3>${esc(r.label)}</h3>
            ${slot(p.id, `style.refs.${r.id}`, r.id, "点击挂本地图")}
            <p class="small muted" style="margin:8px 0 0">${esc(r.note || "")}</p></div>`
        )
        .join("");
      return `
      <div class="grid two">
        <div class="card">
          <h3>风格名</h3>
          ${ed("style.name", st.name)}
          <h3 style="margin-top:16px">色板</h3>
          <div class="palette">${sw || `<span class="muted">未定义</span>`}</div>
          <h3 style="margin-top:16px">关键词</h3>
          <div class="chips">${(st.keywords || []).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>
        </div>
        <div class="card">
          <h3>硬规则</h3>
          <ul class="plain">${(st.rules || []).map((r) => `<li>${esc(r)}</li>`).join("") || `<li class="muted">未定义</li>`}</ul>
        </div>
      </div>
      <div class="grid three" style="margin-top:14px">${refs}</div>`;
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
        ? (g.items || [])
            .map((a, ai) => {
              const st = ANCHOR_STATE[a.status] || ["", ""];
              return `<div class="card anchor-card">
                <div class="head">
                  <span class="id">${esc(a.id)}</span>
                  <span class="head-r">
                    <span class="tag ${st[1]}">${st[0]}</span>
                    <button class="x" title="删除这张锚" data-action="anchor-del" data-gid="${g.id}" data-aid="${esc(a.id)}">×</button>
                  </span>
                </div>
                ${slot(p.id, `anchors.${g.id}.${a.id}`, a.id, "点击挂本地图", true)}
                <div class="note">${ed(`anchorGroups.${gi}.items.${ai}.note`, a.note || "", "small")}</div>
                <div class="note muted">${esc(a.kind)}</div>
              </div>`;
            })
            .join("")
        : "";
      return `
        <div class="card" style="margin-bottom:14px">
          <h3>锚图（${total}）</h3>
          <p class="muted small" style="margin:0">左侧按抽屉归类：场地 / 角色 / 机位 / 关键……抽屉可增、锚可增删。按镜取锚一次最多吃 3 张；点图临时挂本地文件，刷新即失效。</p>
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
            <td style="width:150px">${slot(p.id, `shots.${s.no}`, "首帧", "", false)}</td>
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
      const id = (prompt("锚 id（例：A5-hangar / K4-first）") || "").trim();
      if (!id) return;
      g.items.push({ id, kind: "未标注", status: "todo", note: "", src: null });
      save();
      renderPanel(p);
      toast("已加锚 " + id);
    } else if (act === "anchor-del") {
      const p = cur();
      const g = (p && (p.anchorGroups || []).find((x) => x.id === el.dataset.gid)) || null;
      if (!g) return;
      const aid = el.dataset.aid;
      const i = (g.items || []).findIndex((a) => a.id === aid);
      if (i < 0 || !confirm(`删除锚 ${aid}？`)) return;
      g.items.splice(i, 1);
      save();
      renderPanel(p);
      toast("已删 " + aid);
    } else if (act === "cycle-status") {
      const p = cur();
      const i = STATUS_CYCLE.indexOf(p.status);
      p.status = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
      p.updated = new Date().toISOString().slice(0, 10);
      save();
      render();
    } else if (act === "new") {
      state.projects.unshift(blankProject());
      state.activeId = state.projects[0].id;
      state.tab = "script";
      save();
      render();
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

  /* 复选框 */
  document.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-check]");
    if (!cb) return;
    const p = cur();
    p.compose.checks[Number(cb.dataset.check)].done = cb.checked;
    save();
    renderPanel(p);
  });

  /* 图片槽：本地临时挂载 */
  let fileInput = null;
  document.addEventListener("click", (e) => {
    const s = e.target.closest(".slot");
    if (!s) return;
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*,video/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
    }
    fileInput.onchange = () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!f) return;
      const key = `${s.dataset.proj}:${s.dataset.slot}`;
      const old = sessionImages.get(key);
      if (old) URL.revokeObjectURL(old);
      sessionImages.set(key, URL.createObjectURL(f));
      render();
      toast(f.name + " 已临时挂载（不落库）");
    };
    fileInput.click();
  });

  /* 新建项目模板 */
  function blankProject() {
    const n = state.projects.length + 1;
    return {
      id: "p" + Date.now().toString(36),
      name: "未命名项目 " + n,
      circle: 0,
      status: "active",
      updated: new Date().toISOString().slice(0, 10),
      budget: { total: 300, spent: 0 },
      script: { logline: "写下这一条的一句话。", source: "", beats: [], notes: "" },
      style: { name: "未命名风格", keywords: [], palette: [], rules: [], refs: [] },
      anchorGroups: ANCHOR_DRAWERS.map((g) => ({ id: g.id, label: g.label, hint: g.hint, items: [] })),
      shots: [],
      compose: { duration: "0s", res: "1056×608 · 24fps", audio: "", checks: [], notes: "" }
    };
  }

  document.getElementById("btn-new").addEventListener("click", () => {
    state.projects.unshift(blankProject());
    state.activeId = state.projects[0].id;
    state.tab = "script";
    save();
    render();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("清掉本地改动，恢复成种子数据？")) return;
    localStorage.removeItem(LS_KEY);
    state = seed();
    render();
    toast("已恢复种子数据");
  });

  /* 键盘：1-5 切 tab */
  document.addEventListener("keydown", (e) => {
    if (e.target.isContentEditable) return;
    if (e.key >= "1" && e.key <= "5") {
      state.tab = TABS[Number(e.key) - 1].id;
      save();
      render();
    }
  });

  render();
})();
