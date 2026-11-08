#!/usr/bin/env node
/**
 * publish_bilibili.mjs — 成片投稿到 B 站（登录 / 上传 / 填表 / 封面 / 投稿 / 回执）
 *
 * 为什么走浏览器而不是接口：投稿接口要 wbi 签名 + 风控，公开接口只够做侦查（recon_bilibili.mjs）；
 * 网页端是唯一稳定可达的路径。用系统自带 Edge（channel=msedge），不下载浏览器。
 *
 * 命令：
 *   node Tool/ops/publish_bilibili.mjs status
 *   node Tool/ops/publish_bilibili.mjs login  [--wait 300] [--headless 1]
 *   node Tool/ops/publish_bilibili.mjs publish --video <mp4> --cover <jpg> --title "..." \
 *        [--desc-file <txt>] [--tags "a,b,c"] [--zone 知识] [--decl "含AI生成内容"] \
 *        [--dry-run] [--headless 1] [--receipt <json>]
 *   node Tool/ops/publish_bilibili.mjs verify --bvid BV1xxxxxxxxx
 *
 * 边界（与 AGENTS.md 一致）：
 *   - 登录必须账号主本人扫码，脚本不填密码、不碰短信验证码；
 *   - `--dry-run` 走完上传+填表+封面就停，**不点投稿**；默认就要显式 --dry-run 之外才算真发；
 *   - 不刷互动、不发评论、不编数据；回执里只写页面实际读到的值。
 *
 * 实战踩过的坑（改之前先读，别重新踩一遍）：
 *   1) 简介是 quill 富文本（.ql-editor），不是 textarea → 只能写 innerHTML 再派发 input 事件；
 *   2) 受控 input 必须用 execCommand('insertText')，原生 value setter 不触发 Vue 的 v-model；
 *   3) 标签必须用真实键盘事件（locator.click → keyboard.type → keyboard.press('Enter')）；
 *      合成 KeyboardEvent 在草稿恢复/组件未就绪时会静默失败（实测合成事件 0 个标签，真按键全中）；
 *      而 execCommand('insertText') 只能解决'把字填进去'，Enter 那步骗不过去；
 *   4) B 站会自动补 3 个推荐标签（如 生活记录/校园/记录），提交前必须核对并删掉不属于自己的；
 *   5) 上次没发完会留草稿，进投稿页先弹「继续编辑 / 不用了」——要先点「不用了」，否则表单是上次的；
 *   6) 分区 .drop-list-v2-item 是单级（新版无二级），点击必须派发真实 MouseEvent；
 *   7) 封面的"完成"是 div.button.submit 不是 button；4:3 裁完还会弹 16:9 同步确认；
 *   8) "立即投稿"第一次点击可能被残留遮罩吃掉 → 用 bbox 中心发真实鼠标点击，再校验结果文案。
 *   9) **创作声明是必填项（2026-11 实测）**：不传 --decl 时表单可填完、dry-run 也过（dry-run 不点投稿），
 *      但真投稿会被「请添加创作声明」拦下，ok=false 且文案埋在页面 toast 文本里，只看 errors=[] 会误判。
 *      常用值「内容无需标注」（无 AI 生成/无商业推广/无虚构演绎时选它），下拉选项按 .bcc-option 文本精确匹配。
 *  10) **`delete` 命令已失效（2026-11 实测）**：`POST member.bilibili.com/x/web/archives/del` 返回 404 HTML
 *      （接口改版）。且稿件管理页的 ⋮（.more-btn）click handler 在无头下无响应（DOM 零变化）。
 *      可行路径：从行元素向上找 `__vue__`，调组件方法 `openDeleteBox()`（内部先 getArchiveDelRisk 再弹框）；
 *      但确认环节触发**极验滑块**——不绕过验证码，改用 `Workspace/run/delete_bv_headful.mjs`
 *      开有头窗口由人工拖滑块，脚本轮询列表检测删除完成。
 *  11) **换号 = 换 profile 目录**（脚本硬编码 Workspace/run/bili_profile，无 --profile 参数）：
 *      先把现有目录改名存档（如 bili_profile_B_326452892），再把目标号的 profile 复制/移动成 bili_profile；
 *      换完先跑 `status` 核对 UID 再投稿。已知两个号：草履虫爱剪辑 3747573749779036 / 为做真实的自己许诺 326452892。
 *
 * 产物：History/publish/bilibili/runs/<时间戳>_<命令>/（截图 + 日志 + 回执），进 History 留痕；
 *       登录态（Playwright profile）留在 Workspace/run/bili_profile（临时、不入库）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { launchProfile, loginState, sleep } from '../lib/pw.mjs';

const UPLOAD_URL = 'https://member.bilibili.com/platform/upload/video/frame';
const LOGIN_URL = 'https://passport.bilibili.com/login';
const RUNS = path.join(ROOT, 'History', 'publish', 'bilibili', 'runs');

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const CMD = argv[0] || 'help';
const getOpt = (k, d = '') => (argv.includes(k) ? argv[argv.indexOf(k) + 1] ?? d : d);
const has = (k) => argv.includes(k);
const bool = (k, d = false) => (has(k) ? getOpt(k) !== '0' && getOpt(k) !== 'false' : d);

// ---------- 运行目录 / 日志 ----------
function newRun(tag) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(RUNS, `${stamp}_${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const RUN = newRun(CMD);
const LOGFILE = path.join(RUN, 'run.log');
function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOGFILE, line + '\n');
}

async function shot(page, name) {
  const f = path.join(RUN, `${name}.png`);
  await page.screenshot({ path: f }).catch(() => {});
  return f;
}

const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

// 全局持住浏览器句柄：任何异常路径都要能关掉，否则 node 进程会因为浏览器还活着而挂住
let LIVE_CTX = null;
async function open(opts) {
  const h = await launchProfile(opts);
  LIVE_CTX = h.ctx;
  return h;
}
async function closeBrowser() {
  if (!LIVE_CTX) return;
  const c = LIVE_CTX;
  LIVE_CTX = null;
  await c.close().catch(() => {});
}

// ---------- 通用 DOM 动作 ----------
const CLICK_EVENTS = ['mousedown', 'mouseup', 'click'];

/** 在页面里按文本点一个元素（叶子优先，取最后一个可见匹配） */
async function clickByText(page, text, { index = -1, selector = '*' } = {}) {
  return page.evaluate(
    ({ text, index, events }) => {
      const els = [...document.querySelectorAll('*')].filter(
        (e) => e.offsetParent && (e.innerText || '').trim() === text
      );
      if (!els.length) return false;
      const leaf = els.filter((e) => !e.children.length);
      const pool = leaf.length ? leaf : els;
      const el = index < 0 ? pool[pool.length - 1] : pool[index];
      if (!el) return false;
      const holder = el.closest('button, [class*="btn"], [class*="button"], a') || el;
      for (const t of events) holder.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
      if (holder !== el) for (const t of events) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
      return true;
    },
    { text, index, events: CLICK_EVENTS }
  );
}

/** 用真实鼠标点元素中心（应对遮挡层） */
async function realClick(page, text) {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('*')].filter((e) => e.offsetParent && (e.innerText || '').trim() === t);
    const el = els[els.length - 1];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    return true;
  }, text);
  if (!ok) return false;
  await sleep(500);
  const box = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('*')].filter((e) => e.offsetParent && (e.innerText || '').trim() === t);
    const el = els[els.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

// ---------- 登录 ----------
async function qrBox(page) {
  return page.evaluate(() => {
    const cand = [...document.querySelectorAll('img, canvas, div')].filter((e) => {
      if (!e.offsetParent) return false;
      const cls = (e.className || '').toString().toLowerCase();
      const r = e.getBoundingClientRect();
      const square = r.width > 80 && Math.abs(r.width - r.height) < 12;
      return square && (/qr/.test(cls) || e.tagName === 'CANVAS' || (e.tagName === 'IMG' && r.width < 400));
    });
    const el = cand.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
}

function qrExpired(text) {
  return /失效|已过期|点击刷新|重新获取/.test(text);
}

async function snapshotQr(page, dir) {
  let box = await qrBox(page);
  if (!box) box = { x: 382, y: 258, width: 165, height: 165 }; // 1440x900 实测兜底
  const out = path.join(dir, 'login_qr.png');
  await page.screenshot({ path: out, clip: box }).catch(() => {});
  // 稳定路径：外部（对话/脚本）可以直接读这一张，不用记时间戳目录
  fs.mkdirSync(RUNS, { recursive: true });
  try {
    fs.copyFileSync(out, path.join(RUNS, 'latest_qr.png'));
  } catch {
    /* 截图失败时没有可复制的文件，忽略 */
  }
  return out;
}

async function cmdLogin() {
  const waitS = Number(getOpt('--wait', '300')) || 300;
  const headless = bool('--headless', true);
  const { ctx, page, info } = await open({ headless });
  log(`浏览器 ${info.channel} / ${info.exe} / profile=${info.profile}`);
  const pre = await loginState(ctx);
  if (pre.loggedIn) {
    log(`已是登录态 UID=${pre.uid}，无需扫码（要换号先删 ${info.profile}）`);
    await closeBrowser();
    return 'already';
  }

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);

  const statusFile = path.join(RUN, 'login_status.json');
  const t0 = Date.now();
  let qr = await snapshotQr(page, RUN);
  log(`二维码已导出：${qr}`);
  fs.writeFileSync(statusFile, JSON.stringify({ state: 'waiting_scan', at: new Date().toISOString(), qr }, null, 2));

  let last = 0;
  let state = 'timeout';
  while (Date.now() - t0 < waitS * 1000) {
    const st = await loginState(ctx);
    if (st.loggedIn) {
      state = 'logged_in';
      log(`登录成功 UID=${st.uid}`);
      fs.writeFileSync(statusFile, JSON.stringify({ state, at: new Date().toISOString(), uid: st.uid }, null, 2));
      break;
    }
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 800)).catch(() => '');
    if (qrExpired(txt)) {
      const clicked = await page.evaluate(() => {
        const m = [...document.querySelectorAll('div,span,p,a')].find(
          (e) => e.offsetParent && /点击刷新|重新获取|二维码失效/.test(e.textContent || '')
        );
        if (!m) return false;
        const r = m.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (clicked && typeof clicked === 'object') {
        await page.mouse.click(clicked.x, clicked.y).catch(() => {});
        await sleep(2500);
        qr = await snapshotQr(page, RUN);
        log('二维码已刷新');
      }
    }
    if (Date.now() - last > 15000) {
      await snapshotQr(page, RUN);
      last = Date.now();
    }
    await sleep(2000);
  }

  await shot(page, 'final');
  await closeBrowser();
  log(`退出：${state}｜二维码 ${qr}｜状态 ${statusFile}`);
  if (state !== 'logged_in') process.exitCode = 2;
  return state;
}

// ---------- 上传 ----------
async function uploadVideo(page, video, timeoutMin = 15) {
  await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[type=file]', { timeout: 60000 });
  await sleep(3000);
  // 上次没发完会留下草稿，进来先弹「继续编辑 / 不用了」；本工具一律从头来
  // 注意弹窗不是立刻出现，要轮询等它（固定 sleep 会漏，实测 3s 时还没渲染）
  let dismissed = false;
  for (let i = 0; i < 20 && !dismissed; i++) {
    const asked = await page.evaluate(() => /不用了/.test(document.body.innerText)).catch(() => false);
    if (asked) {
      await clickByText(page, '不用了');
      await sleep(2000);
      dismissed = true;
      log('草稿恢复弹窗 → 选「不用了」（从空表单开始，避免串上次的标题/标签/多P）');
    } else {
      await sleep(500);
    }
  }
  if (!dismissed) log('未见草稿恢复弹窗（干净进入）');

  const n = await page.locator('input[type=file]').count();
  log(`投稿页 file input × ${n}`);
  await page.locator('input[type=file]').first().setInputFiles(video);
  log(`已挂载 ${path.basename(video)}（${(fs.statSync(video).size / 1048576).toFixed(1)}MB），等转码/表单`);

  const t0 = Date.now();
  let lastPct = -1;
  while (Date.now() - t0 < timeoutMin * 60000) {
    const st = await page
      .evaluate(() => {
        const t = document.body.innerText;
        return {
          ready: /添加封面|稿件标题/.test(t),
          // 上传仍在进行：进度条带「上传中」或「剩余时间」字样（大文件上传时表单早已就绪，
          // 2026-11-01 实测 238MB 片 93% 时表单已可填，直接提交会卡死在 99.7%——必须等上传完成）
          uploading: /上传中|剩余时间|已上传\s+\d/.test(t) && !/上传完成|100%/.test(t),
          pct: (t.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1] || null,
          speed: (t.match(/([\d.]+)\s*MB\/s/) || [])[1] || null,
        };
      })
      .catch(() => ({ ready: false, uploading: true, pct: null, speed: null }));
    if (st.ready && !st.uploading) {
      // 0 秒就绪通常是「秒传」（同文件已上传过）或恢复了上次的草稿，记一笔便于判断
      const hint = await page
        .evaluate(() => (/继续编辑|不用了/.test(document.body.innerText) ? '（有草稿恢复弹窗）' : ''))
        .catch(() => '');
      log(`表单就绪（${Math.round((Date.now() - t0) / 1000)}s）${hint}`);
      return true;
    }
    if (st.pct && Number(st.pct) !== lastPct) {
      lastPct = Number(st.pct);
      log(`上传 ${st.pct}%  ${st.speed || '?'}MB/s`);
    }
    await sleep(3000);
  }
  throw new Error(`上传超时（${timeoutMin} 分钟）`);
}

// ---------- 填表 ----------
async function setTitle(page, title) {
  const el = page.locator('input[placeholder*="稿件标题"]').first();
  await el.waitFor({ state: 'visible', timeout: 20000 });
  await el.fill(title);
  const v = await el.inputValue();
  if (v !== title) throw new Error(`标题写入不一致：${v}`);
  log(`标题 OK（${title.length} 字）`);
}

async function setDesc(page, desc) {
  const ok = await page.evaluate((text) => {
    const el = document.querySelector('.ql-editor, div[contenteditable="true"]');
    if (!el) return null;
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.focus();
    el.innerHTML = text
      .split('\n')
      .map((l) => `<p>${l ? esc(l) : '<br>'}</p>`)
      .join('');
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return el.innerText.replace(/\s+/g, ' ').slice(0, 40);
  }, desc);
  if (!ok) throw new Error('找不到简介编辑器（.ql-editor）');
  log(`简介 OK：${ok}…`);
}

const READ_TAGS = () =>
  [...document.querySelectorAll('svg.close.icon-sprite-off')]
    .map((e) => {
      const p = e.closest('span') || e.parentElement;
      return (p?.textContent || '').replace('×', '').trim();
    })
    .filter((t) => t && t.length <= 20);

async function readTags(page) {
  return page.evaluate(READ_TAGS);
}

async function removeTag(page, text) {
  return page.evaluate(
    ({ text, events }) => {
      let hit = false;
      document.querySelectorAll('svg.close.icon-sprite-off').forEach((e) => {
        const p = e.closest('span') || e.parentElement;
        const t = (p?.textContent || '').replace('×', '').trim();
        if (t === text) {
          for (const ev of events) e.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
          hit = true;
        }
      });
      return hit;
    },
    { text, events: CLICK_EVENTS }
  );
}

async function addTag(page, word) {
  // 用 CDP 真按键（click → 输入 → Enter）。两个实测坑：
  //   a) 逐字符 keyboard.type 会被组件的重渲染吞字（只留最后一个字，如「程」）；
  //      → 优先 keyboard.insertText 一次性插入（单事件，无竞态），失败再退回 type。
  //   b) 绝对不能 Control+A：焦点在标签容器时它选中上一个 chip，Backspace 会把它删掉。
  for (let attempt = 1; attempt <= 3; attempt++) {
    const input = page.locator('input[placeholder*="回车"]').first();
    await input.click();
    await sleep(250); // 点击会让标签区重渲染，立刻打字会被吞（首个标签必失败，实测）

    const residual = await page.evaluate(() => document.querySelector('input[placeholder*="回车"]')?.value || '');
    if (residual) {
      await page.keyboard.press('End');
      for (let i = 0; i < residual.length; i++) await page.keyboard.press('Backspace');
    }

    if (attempt === 2) await page.keyboard.insertText(word);
    else await page.keyboard.type(word, { delay: 60 * attempt });
    await sleep(200);

    const typed = await page.evaluate(() => document.querySelector('input[placeholder*="回车"]')?.value || '');
    // 关键：值不对就绝不能按回车——按了会生成「期」「程」这类垃圾标签，还得回头删
    if (typed !== word) {
      log(`标签「${word}」第 ${attempt} 次输入被吞（框内=${JSON.stringify(typed)}），清空重来`);
      await page.keyboard.press('End');
      for (let i = 0; i < typed.length; i++) await page.keyboard.press('Backspace');
      await sleep(400);
      continue;
    }

    await page.keyboard.press('Enter');
    await sleep(700);
    const tags = await readTags(page);
    if (tags.includes(word)) return tags;
    log(`标签「${word}」第 ${attempt} 次回车未生效（现有=${tags.join(',')}）`);
    await sleep(400);
  }
  throw new Error(`标签「${word}」三次都没写进去`);
}

async function enforceTags(page, wanted) {
  for (let pass = 1; pass <= 3; pass++) {
    const cur = await readTags(page);
    const missing = wanted.filter((w) => !cur.includes(w));
    const extra = cur.filter((t) => !wanted.includes(t));
    if (!missing.length && !extra.length) {
      log(`标签 OK（${cur.length}）：${cur.join(' / ')}`);
      return cur;
    }
    log(`标签第 ${pass} 轮：多余 [${extra.join(',')}] 缺 [${missing.join(',')}]`);
    for (const t of extra) {
      await removeTag(page, t);
      await sleep(350);
    }
    for (const w of missing) await addTag(page, w);
    await sleep(700);
  }
  const fin = await readTags(page);
  log(`标签收尾（${fin.length}）：${fin.join(' / ')}`);
  return fin;
}

async function setZone(page, zone) {
  const cur = await page.evaluate(() => document.querySelector('.select-controller')?.innerText.trim() || '');
  if (cur === zone) {
    log(`分区已是「${zone}」`);
    return cur;
  }
  const opened = await page.evaluate((events) => {
    const c = document.querySelector('.select-controller');
    if (!c) return false;
    for (const t of events) c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    return true;
  }, CLICK_EVENTS);
  if (!opened) throw new Error('找不到分区选择器 .select-controller');
  await sleep(1000);
  const picked = await page.evaluate(
    ({ zone, events }) => {
      const item = [...document.querySelectorAll('.drop-list-v2-item')].find(
        (e) => e.offsetParent && (e.innerText || '').trim() === zone
      );
      if (!item) return false;
      for (const t of events) item.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
      return true;
    },
    { zone, events: CLICK_EVENTS }
  );
  await sleep(900);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(300);
  const now = await page.evaluate(() => document.querySelector('.select-controller')?.innerText.trim() || '');
  if (!picked) {
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('.drop-list-v2-item')].map((e) => (e.innerText || '').trim()).filter(Boolean)
    );
    throw new Error(`分区列表里没有「${zone}」（实际项：${names.join('、') || '空'}）`);
  }
  log(`分区 ${cur || '?'} → ${now}`);
  return now;
}

async function setDeclaration(page, decl) {
  if (!decl) return null;
  const opened = await page.evaluate((events) => {
    const s = document.querySelector('.bcc-select-input-wrap, .bcc-select');
    if (!s) return false;
    for (const t of events) s.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    return true;
  }, CLICK_EVENTS);
  if (!opened) {
    log('⚠ 没找到创作声明下拉，跳过（B 站改版时需更新选择器）');
    return null;
  }
  await sleep(900);
  const picked = await page.evaluate(
    ({ decl, events }) => {
      const opt = [...document.querySelectorAll('.bcc-option')].find((e) => (e.innerText || '').trim() === decl);
      if (!opt) return false;
      for (const t of events) opt.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
      return true;
    },
    { decl, events: CLICK_EVENTS }
  );
  await sleep(700);
  if (!picked) throw new Error(`创作声明里没有「${decl}」`);
  const v = await page.evaluate(() => document.querySelector('.bcc-select-input-inner')?.value || '');
  log(`创作声明 = ${v || decl}`);
  return v || decl;
}

/** 封面：开弹窗 → 传图 → 4:3 完成 → 16:9 同步 → 完成 */
async function setCover(page, coverPath) {
  const opened = await page.evaluate((events) => {
    const els = [...document.querySelectorAll('*')].filter(
      (e) => !e.children.length && (e.innerText || '').trim() === '添加封面'
    );
    const btn = els[els.length - 1];
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    const holder = btn.closest('[class*="cover"]') || btn.parentElement;
    for (const t of events) holder.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    for (const t of events) btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    return true;
  }, CLICK_EVENTS);
  if (!opened) throw new Error('找不到「添加封面」');
  await sleep(2000);

  // 传图：优先原生 setInputFiles，失败再走 DataTransfer 注入
  let injected = false;
  const inputs = page.locator('input[type=file][accept*="image"]');
  const cnt = await inputs.count();
  if (cnt) {
    try {
      await inputs.last().setInputFiles(coverPath);
      injected = true;
    } catch (e) {
      log('setInputFiles 失败，改 DataTransfer：' + String(e.message).split('\n')[0]);
    }
  }
  if (!injected) {
    const b64 = fs.readFileSync(coverPath).toString('base64');
    const name = path.basename(coverPath);
    const r = await page.evaluate(
      ({ b64, name }) => {
        const input = document.querySelector('input[type=file][accept*="image"]');
        if (!input) return 'NO_INPUT';
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name, { type: 'image/jpeg' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'OK';
      },
      { b64, name }
    );
    if (r !== 'OK') throw new Error('封面注入失败：' + r);
  }
  log('封面已传入，等裁剪界面');
  await sleep(3500);

  // 弹窗内收尾：可能 2-3 步（完成 → 确认同步 → 完成）
  for (let round = 1; round <= 4; round++) {
    const state = await page.evaluate(() => {
      const dlg = [...document.querySelectorAll('.bcc-dialog')].find((e) => e.offsetParent);
      if (!dlg) return { open: false, texts: [] };
      const btn = [...dlg.querySelectorAll('.button.submit, button')].filter((e) => e.offsetParent);
      return { open: true, texts: btn.map((e) => (e.innerText || '').trim()).filter(Boolean) };
    });
    if (!state.open) break;
    if (state.texts.includes('确认同步')) {
      await clickByText(page, '确认同步');
      log('已确认 16:9 同步');
    } else if (state.texts.includes('完成')) {
      await page.evaluate(() => {
        const dlg = [...document.querySelectorAll('.bcc-dialog')].find((e) => e.offsetParent);
        const done = [...dlg.querySelectorAll('.button.submit, button')].find(
          (e) => e.offsetParent && (e.innerText || '').trim() === '完成'
        );
        if (!done) return false;
        for (const t of ['mousedown', 'mouseup', 'click']) done.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
        return true;
      });
      log(`封面第 ${round} 步：完成`);
    } else {
      log(`封面弹窗停住，可见按钮：[${state.texts.join(',')}]`);
      break;
    }
    await sleep(2800);
  }
  await shot(page, 'cover_done');
  const stillOpen = await page.evaluate(() => [...document.querySelectorAll('.bcc-dialog')].some((e) => e.offsetParent));
  if (stillOpen) throw new Error('封面弹窗没关（截图 cover_done.png）');
  log('封面完成');
  return true;
}

// ---------- 投稿 ----------
async function submit(page) {
  // 提交前硬门槛：上传必须真正完成（实测 93% 时表单可填但投稿会卡死）
  for (let i = 0; i < 100; i++) {
    const t = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (!/上传中|剩余时间/.test(t)) break;
    if (i === 0) log('上传未完成，等它跑完再点投稿…');
    await sleep(5000);
  }
  // 用 bbox 中心的真实鼠标点击：合成 click 会被残留遮罩吃掉（实测第一次点没反应）
  const clicked = await realClick(page, '立即投稿');
  if (!clicked) throw new Error('找不到「立即投稿」');
  log('已点投稿');
  await sleep(5000);

  const txt = await bodyText(page);
  const ok = /恭喜|投稿成功|稿件投递成功|查看进度|成为UP主/.test(txt);
  const errors = await page.evaluate(() =>
    [...document.querySelectorAll('[class*="toast"], [class*="error"], [class*="warn"]')]
      .filter((e) => e.offsetParent)
      .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );
  if (!ok) {
    // 失败诊断：hook 是否拦到提交请求、响应码是多少
    const diag = await page.evaluate(() => {
      const t = window.__tidRewrite || null;
      const perf = performance.getEntriesByType('resource')
        .filter((e) => /add|submit|archive/.test(e.name))
        .map((e) => ({ url: e.name.slice(0, 130), status: e.responseStatus ?? null, dur: Math.round(e.duration) }));
      return { tidRewrite: t, addReqs: perf.slice(-10) };
    }).catch(() => null);
    if (diag) {
      log(`诊断 tidRewrite: ${JSON.stringify({ seen: diag.tidRewrite?.seen, rewritten: diag.tidRewrite?.rewritten })}`);
      log(`诊断 reqs: ${JSON.stringify((diag.tidRewrite?.reqs || []).slice(0, 12))}`);
      const resp = (diag.tidRewrite?.reqs || []).filter((r) => r.resp).slice(-5);
      if (resp.length) log(`诊断 提交类响应: ${JSON.stringify(resp)}`);
      log(`诊断 add 相关请求: ${JSON.stringify(diag.addReqs)}`);
    }
  }
  await shot(page, 'submit');
  return { ok, errors, tail: txt.slice(-200) };
}

/** 抓 BV 号：先看当前链接，再点「查看进度」，最后在稿件页里翻 */
async function grabBvid(page) {
  const re = /BV[0-9A-Za-z]{10}/;
  for (let i = 0; i < 12; i++) {
    const direct = await page.evaluate((src) => {
      const r = new RegExp(src);
      const m = location.href.match(r);
      if (m) return m[0];
      const a = [...document.querySelectorAll('a')].map((e) => e.href || '').find((h) => r.test(h));
      if (a) return a.match(r)[0];
      return null;
    }, re.source);
    if (direct) return direct;

    const clicked = await clickByText(page, '查看进度');
    if (!clicked) await clickByText(page, '稿件管理');
    await sleep(4000);
    const after = await page.evaluate((src) => {
      const r = new RegExp(src);
      const m = location.href.match(r);
      if (m) return m[0];
      const m2 = (document.body.innerHTML || '').match(r);
      return m2 ? m2[0] : null;
    }, re.source);
    if (after) return after;
  }
  return null;
}

// ---------- 命令 ----------
async function cmdStatus() {
  const { ctx, info } = await open({ headless: true });
  const st = await loginState(ctx);
  log(`浏览器 ${info.channel}｜playwright 来自 ${info.modulesFrom}`);
  log(`登录态：${st.loggedIn ? `已登录 UID=${st.uid}` : '未登录'}｜cookie ${st.cookieCount} 条`);
  await closeBrowser();
  if (!st.loggedIn) process.exitCode = 1;
}

/** 在表单页（goto 之后）安装提交请求 tid 抓取/改写 hook。
 *  实证：投稿 UI 显示的分区与落库 tid 会脱钩（UI「知识」实测落库 tid=231 科技），
 *  UI 文本不可信；--tid N 时把提交请求体里的 tid 强制改写为 N，并在回执留痕。 */
async function installTidHook(page, tid, htype) {
  await page.evaluate(({ tid, htype }) => {
    window.__tidRewrite = { forced: tid, htype: htype || null, seen: [], rewritten: [], reqs: [] };
    const ts = String(tid);
    const th = htype == null ? null : String(htype);
    const patch = (b) => {
      try {
        if (b == null) return b;
        const note = (v) => window.__tidRewrite.reqs.push({ tid: String(v) });
        if (typeof b === 'string') {
          if (b.trimStart().startsWith('{')) {
            try {
              const j = JSON.parse(b);
              if ('tid' in j) {
                note(j.tid);
                if (ts !== String(j.tid)) {
                  window.__tidRewrite.rewritten.push({ orig: String(j.tid), to: ts });
                  j.tid = Number(tid);
                  // 新分类 id 必须与 tid 配对改写，否则后端 21001 参数错误（human_type2 与 tid 映射不一致）
                  if (th != null && 'human_type2' in j && String(j.human_type2) !== th) {
                    window.__tidRewrite.rewritten.push({ orig: 'htype:' + j.human_type2, to: 'htype:' + th });
                    j.human_type2 = Number(th);
                  }
                  return JSON.stringify(j);
                }
              }
            } catch {}
            return b;
          }
          const m = b.match(/(^|&)tid=(\d+)/);
          if (m) {
            note(m[2]);
            if (ts !== m[2]) { window.__tidRewrite.rewritten.push({ orig: m[2], to: ts }); return b.replace(/(^|&)tid=\d+/, '$1tid=' + ts); }
          }
          return b;
        }
        if (typeof FormData !== 'undefined' && b instanceof FormData) {
          if (b.has('tid')) {
            note(b.get('tid'));
            if (ts !== String(b.get('tid'))) { window.__tidRewrite.rewritten.push({ orig: String(b.get('tid')), to: ts }); b.set('tid', ts); }
          }
          return b;
        }
        if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) {
          if (b.has('tid')) {
            note(b.get('tid'));
            if (ts !== b.get('tid')) { window.__tidRewrite.rewritten.push({ orig: b.get('tid'), to: ts }); b.set('tid', ts); }
          }
          return b;
        }
      } catch {}
      return b;
    };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return oo.apply(this, arguments); };
    const os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (b) {
      try { if (b) window.__tidRewrite.reqs.push({ via: 'xhr', url: String(this.__u || '').slice(0, 120), bodyType: (b.constructor && b.constructor.name) || typeof b }); } catch {}
      const xhr = this;
      xhr.addEventListener('load', () => {
        try {
          const u = String(xhr.__u || '');
          if (/add|submit|archive\/(v\d|web)/.test(u) || /member\.bilibili\.com\/x\/vu/.test(u)) {
            window.__tidRewrite.reqs.push({ resp: u.slice(0, 140), status: xhr.status, body: String(xhr.responseText || '').slice(0, 500) });
          }
        } catch {}
      });
      return os.call(this, patch(b));
    };
    const of = window.fetch;
    window.fetch = function (u, o) {
      try { if (o && o.body) window.__tidRewrite.reqs.push({ via: 'fetch', url: String(u).slice(0, 120), bodyType: (o.body.constructor && o.body.constructor.name) || typeof o.body }); } catch {}
      if (o && o.body) o = { ...o, body: patch(o.body) };
      return of.call(this, u, o);
    };
  }, { tid, htype });
  log(`已布防 tid 改写（全格式）：提交请求体里的 tid → ${tid}（UI 显示仅作参考，落库以回读校验为准）`);
}

async function cmdPublish() {
  const video = path.resolve(getOpt('--video', ''));
  const cover = getOpt('--cover', '');
  const title = getOpt('--title', '');
  const descFile = getOpt('--desc-file', '');
  const descInline = getOpt('--desc', '');
  const tags = (getOpt('--tags', '') || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const zone = getOpt('--zone', '知识');
  const decl = getOpt('--decl', '');
  const tidForce = getOpt('--tid', '');
  const htypeForce = getOpt('--htype', '');
  const dryRun = has('--dry-run');
  const headless = bool('--headless', true);
  const receiptPath = getOpt('--receipt', path.join(RUN, 'receipt.json'));

  if (!video || !fs.existsSync(video)) throw new Error('缺 --video（文件不存在）');
  if (!title) throw new Error('缺 --title');
  const desc = descFile ? fs.readFileSync(descFile, 'utf8') : descInline;
  if (!desc) throw new Error('缺简介：--desc 或 --desc-file');
  if (title.length > 80) log(`⚠ 标题 ${title.length} 字，B 站上限 80`);

  const { ctx, page, info } = await open({ headless });
  log(`浏览器 ${info.channel}｜profile=${info.profile}`);
  const st = await loginState(ctx);
  if (!st.loggedIn) throw new Error('未登录，先跑：node Tool/ops/publish_bilibili.mjs login');
  log(`已登录 UID=${st.uid}`);

  await uploadVideo(page, video);
  await setTitle(page, title);
  // tid hook 必须在 goto 之后安装：goto 会换文档、evaluate 装的 hook 会随文档销毁
  if (tidForce) await installTidHook(page, tidForce, htypeForce || null);
  await setDesc(page, desc);
  const finalTags = tags.length ? await enforceTags(page, tags) : [];
  const finalZone = await setZone(page, zone);
  const finalDecl = await setDeclaration(page, decl);
  let coverOk = false;
  if (cover) {
    if (!fs.existsSync(cover)) throw new Error(`封面不存在：${cover}`);
    coverOk = await setCover(page, path.resolve(cover));
  } else {
    log('⚠ 未传 --cover，B 站会自动截帧做封面');
  }

  // Playwright 原生网络监听：投稿接口的请求体与响应（比页面内 hook 可靠，跨 frame 也能抓）
  page.on('request', (r) => {
    if (/x\/vu\/web\/add|archive\/add/.test(r.url())) {
      log(`[net] add 请求 ${r.method()} ${r.url().slice(0, 110)}`);
      log(`[net] add 请求体: ${(r.postData() || '').slice(0, 800)}`);
    }
  });
  page.on('response', async (r) => {
    if (/x\/vu\/web\/add|archive\/add/.test(r.url())) {
      const body = await r.text().catch(() => '<取响应失败>');
      log(`[net] add 响应 ${r.status()}: ${body.slice(0, 600)}`);
    }
  });

  // 提交前全表单回读
  const snapshot = await page.evaluate(() => ({
    title: document.querySelector('input[placeholder*="稿件标题"]')?.value || null,
    zone: document.querySelector('.select-controller')?.innerText.trim() || null,
    decl: document.querySelector('.bcc-select-input-inner')?.value || null,
    descLen: document.querySelector('.ql-editor')?.innerText.length || 0,
    // 不能用 body 全文判「添加封面」：悬停提示/竖屏槽位也会带这四个字（实测误报）
    coverSet: ![...document.querySelectorAll('*')].some(
      (e) => !e.children.length && (e.innerText || '').trim() === '添加封面'
    ),
  }));
  await shot(page, 'before_submit');
  log(`表单回读 ${JSON.stringify(snapshot)}`);

  const base = {
    at: new Date().toISOString(),
    video: path.relative(ROOT, video),
    videoSizeMB: +(fs.statSync(video).size / 1048576).toFixed(2),
    title,
    tags: finalTags,
    zone: finalZone,
    declaration: finalDecl,
    cover: cover ? path.relative(ROOT, cover) : null,
    coverUploaded: coverOk,
    dryRun,
    runDir: path.relative(ROOT, RUN),
  };

  if (dryRun) {
    log('--dry-run：已停在投稿前，未提交');
    fs.writeFileSync(receiptPath, JSON.stringify({ ...base, published: false, bvid: null }, null, 2));
    await closeBrowser();
    log(`回执 ${receiptPath}`);
    return;
  }

  const res = await submit(page);
  log(`投稿返回 ok=${res.ok} errors=[${res.errors.join(' | ')}]`);
  if (!res.ok) {
    fs.writeFileSync(receiptPath, JSON.stringify({ ...base, published: false, error: res.errors, tail: res.tail }, null, 2));
    await closeBrowser();
    throw new Error('投稿未成功，见截图/回执：' + (res.errors[0] || res.tail));
  }

  const bvid = await grabBvid(page);
  const url = bvid ? `https://www.bilibili.com/video/${bvid}/` : null;
  // 提交请求里实际带出去的 tid（含改写留痕）——UI 会撒谎，请求体不会
  let tidTrace = null;
  try {
    tidTrace = await page.evaluate(() => JSON.parse(JSON.stringify(window.__tidRewrite || null)));
    if (tidTrace) {
      log(`提交 tid 留痕：seen=[${[...new Set(tidTrace.seen)].join(',')}] rewritten=${JSON.stringify(tidTrace.rewritten)}`);
      const allTids = [...new Set([...(tidTrace.seen || []), ...(tidTrace.reqs || []).filter((r) => r.tid).map((r) => String(r.tid))])];
      const bodyReqs = (tidTrace.reqs || []).filter((r) => r.bodyType || r.resp).slice(0, 15);
      if (bodyReqs.length) log(`带体请求：${JSON.stringify(bodyReqs)}`);
      if (tidForce && !tidTrace.rewritten.length && !allTids.includes(tidForce)) {
        log(`⚠ 期望 tid=${tidForce} 但提交请求里既没见到它也没发生改写——落库分区大概率不对，发布后必须回读校验`);
      } else if (tidForce && allTids.includes(tidForce)) {
        log(`✓ 提交请求确认带 tid=${tidForce}（原生或改写），仍以发布后回读为准`);
      }
    }
  } catch {}
  log(bvid ? `已上线 ${url}` : '⚠ 未抓到 BV 号（可能还在审核），去创作中心稿件管理页看');
  await shot(page, 'after_submit');
  fs.writeFileSync(receiptPath, JSON.stringify({ ...base, tidExpected: tidForce || null, tidTrace, published: true, bvid, url }, null, 2));
  await closeBrowser();
  log(`回执 ${receiptPath}`);
}

async function cmdVerify() {
  const bvid = getOpt('--bvid', '') || (argv[1] && /^BV/.test(argv[1]) ? argv[1] : '');
  if (!bvid) throw new Error('缺 --bvid');
  const url = `https://www.bilibili.com/video/${bvid}/`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/' } });
  const html = await res.text();
  // 属性顺序不固定（线上是 <meta data-vue-meta="true" name="..." content="..."），别把顺序写死
  const meta = (name) => {
    const m = html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`));
    return m ? m[1] : null;
  };
  const strip = (s) => (s ? s.replace(/\\u002F/g, '/') : null);
  const out = {
    url,
    httpStatus: res.status,
    httpTitle: (html.match(/<title[^>]*>(.*?)<\/title>/) || [])[1] || null,
    author: meta('author'),
    keywords: (meta('keywords') || '').split(',').filter(Boolean),
    descHead: (meta('description') || '').split(', 视频播放量')[0] || null,
    cover: strip((html.match(/"pic":"(.*?)"/) || [])[1]),
    tid: (html.match(/"tid":(\d+)/) || [])[1] || null,
    publishedAt: (html.match(/"pubdate":(\d+)/) || [])[1] || null,
    durationS: (html.match(/"duration":(\d+)/) || [])[1] || null,
  };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(RUN, 'verify.json'), JSON.stringify(out, null, 2));
}

async function cmdDelete() {
  const bvid = getOpt('--bvid', '') || (argv[1] && /^BV/.test(argv[1]) ? argv[1] : '');
  if (!bvid) throw new Error('缺 --bvid');
  const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', referer: 'https://www.bilibili.com/' };
  const v = await (await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: UA })).json();
  if (v.code !== 0) throw new Error(`查不到稿件（${v.code} ${v.message}），可能已删除`);
  const aid = v.data.aid;
  log(`目标：${bvid} aid=${aid}「${v.data.title.slice(0, 30)}」tid=${v.data.tid}`);

  const { ctx } = await open({ headless: true });
  const page = await ctx.newPage();
  await page.goto('https://member.bilibili.com/platform/upload-manager/article', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  const csrf = await page.evaluate(() => document.cookie.match(/bili_jct=([^;]+)/)?.[1] || null);
  if (!csrf) throw new Error('拿不到 csrf（bili_jct cookie 缺失）');
  const res = await page.evaluate(
    async ({ aid, csrf }) => {
      const r = await fetch('https://member.bilibili.com/x/web/archives/del', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `aid=${aid}&csrf=${csrf}`,
      });
      return await r.json();
    },
    { aid, csrf }
  );
  log(`删除返回 code=${res.code} ${res.message || ''}`);
  await closeBrowser();
  if (res.code !== 0) throw new Error('删除失败：' + JSON.stringify(res).slice(0, 200));
  log(`已删除 ${bvid}`);
}

function usage() {
  console.log(`publish_bilibili — B 站投稿自动化

  status                                   看登录态
  login  [--wait 300] [--headless 1]       扫码登录（导出二维码，自动刷新失效码）
  publish --video <mp4> --cover <jpg> --title "..." --desc-file <txt>
          [--tags "a,b,c"] [--zone 知识] [--tid 122] [--decl "含AI生成内容"]
          [--dry-run] [--headless 1] [--receipt out.json]
          # --tid N：强制把提交请求体里的 tid 改写为 N（UI 分区会与落库脱钩，务必用 --tid 钉死）
  verify --bvid BV1xxxxxxxxx               线上页校验（标题/简介/封面/时长/tid）
  delete --bvid BV1xxxxxxxxx               删除稿件（不可逆！分区错误重投时用）

产物目录：History/publish/bilibili/runs/<时间戳>_<命令>/（截图 + run.log + 回执）
`);
}

// ---------- 入口 ----------
try {
  if (CMD === 'status') await cmdStatus();
  else if (CMD === 'login') await cmdLogin();
  else if (CMD === 'publish') await cmdPublish();
  else if (CMD === 'verify') await cmdVerify();
  else if (CMD === 'delete') await cmdDelete();
  else usage();
} catch (e) {
  log('FATAL ' + (e.message || e));
  if (process.env.PUBLISH_DEBUG) console.error(e);
  process.exitCode = 1;
} finally {
  await closeBrowser(); // 不关就会挂着浏览器，node 进程永不退出（踩过）
}
