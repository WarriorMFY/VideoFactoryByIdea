#!/usr/bin/env node
/**
 * plan_next_loop.mjs — 把 B 站真实反馈翻译成「下一轮小循环做什么」
 *
 * 为什么要它：track_feedback 只回答"这版哪里不行"（P0/P1 动作），但不回答
 * "下一轮具体改哪个脚本的哪个参数、改完怎么算过关"。这一步把它补上：
 * 信号 → 提案（目标 / 改哪里 / 验收阈值 / 成本 / 风险），产出可直接执行的任务书。
 *
 * 输入：
 *   History/runs/feedback/latest.json      collect_feedback 的最新快照（评论/弹幕原文 + 指标）
 *   .../feedback_report.json               track_feedback 的诊断（可选，用来对齐 P0/P1）
 * 输出：
 *   History/loops/next/plan.md             当前提案（覆盖写，人看）
 *   History/loops/next/plan.json           同上，机器读
 *   History/loops/next/plan_history.jsonl  每次规划追加一条（留痕，不覆盖）
 *
 * 规矩（与全仓库一致）：
 *   · 不编数据。没有信号就输出「继续观察」，不生造任务。
 *   · 提案只到"任务书"级别，**不自动开跑**——开轮次要人点头（AGENTS 的人环规则）。
 *   · 阈值都写在下面 RULES 附近的常量里，改起来一眼能找到。
 *
 * 用法：node Tool/ops/plan_next_loop.mjs [--snap <json>] [--report <json>] [--out-dir History/loops/next]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);

const SNAP = path.resolve(ROOT, getOpt('--snap', 'History/runs/feedback/latest.json'));
const REPORT = path.resolve(ROOT, getOpt('--report', 'Prototype/loop12_market_loop/case_ep01/feedback_report.json'));
const OUTDIR = path.resolve(ROOT, getOpt('--out-dir', 'History/loops/next'));

// ---------------- 阈值（都在这里，改一行就能换口径） ----------------
// 2026-10-31 用赛道基线校准过一次（证据：History/bench/peers_2026-10-31.md，HOT 113 条 / FRESH 63 条）。
// 校准前这几个数是"凭感觉"定的，代价是：点赞率阈值 2% 一压，几乎每条稿都会被判"进来了但不买账"，
// 而赛道点赞率中位本来就只有 2.17% —— 阈值定在人群中间，等于把正常人全判成病人。
const T = {
  coldStartDays: 2,        // 发布满 2 天才谈"没起来"
  coldStartViews: 200,     // 播放 < 200 视为没进推荐流（依据：FRESH 新稿 P75=224，中位仅 68）
  flowDelta: 100,          // 单次快照播放增量 >= 100 视为"推荐流在推"
  likeLow: 0.010,          // 点赞率 < 1.0% 视为"进来了但不买账"（依据：HOT 中位 2.17%，取不足中位一半）
  favStrong: 0.025,        // 收藏率 >= 2.5% 视为工具型内容（依据：HOT 中位 1.67%，约 P75）
  hitMin: 2,               // 同一类吐槽 >= 2 条才升级为 P0（1 条只记 P2，避免单条带偏）
  dmBurstRatio: 0.3,       // 某 5 秒桶占全部弹幕 >= 30% 视为"某处被集中吐槽"
  dmBurstMin: 5,           // 且弹幕总数 >= 5 条才有统计意义
};

// ---------------- 反馈分类词表 ----------------
const CLS = {
  readability: { label: '字幕可读性', re: /字幕|字号|太小|太大|看不清|看不|挡住|遮住|白字|颜色/ },
  pace: { label: '语速/节奏跟不上', re: /太快|来不及|跟不上|语速|念得|慢了|太慢/ },
  translation: { label: '译文质量', re: /翻译|机翻|译文|中文怪|不通|语句|错字|术语/ },
  hook: { label: '开头留人', re: /开头|前3秒|前三秒|前几秒|无聊|啰嗦|节奏|拖沓|劝退/ },
  series: { label: '续作需求', re: /系列|下一期|多来|求更|接着做|第二期|蹲/ },
  useful: { label: '正向：有用', re: /有用|学到了|实用|干货|收藏了|感谢|省时间/ },
  audio: { label: '声音/配乐', re: /声音|音量|听不清|杂音|bgm|配乐|背景音|回音/i },
  visual: { label: '画面/素材', re: /画面|素材|重复|晃|花屏|黑屏|码率|糊/ },
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);

function loadJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

// ---------------- 上下文 ----------------
// 正向/负向判定：一条"开头不错"不该算进"开头留人失败"。
// 不能用 CLS 的问题正则来判负 —— 那些正则里混着中性话题词（"开头""字幕""语速"），
// 只要提到就算负向，正向句会被吃掉。所以单独维护一张**明确负面**的词表。
const POSITIVE = /不错|很好|好棒|厉害|清晰|喜欢|牛|顶|学到了|有用|感谢|舒服|到位|实用|干货|太强/;
const NEGATIVE = /太小|太大|看不清|看不|挡住|遮住|有点糊|太糊|太快|太慢|来不及|跟不上|无聊|啰嗦|拖沓|劝退|机翻|不通|怪怪|错字|听不清|杂音|回音|花屏|黑屏|重复|晃|有点硬|太硬|一般|没意思|看不懂|没看懂/;
const PROBLEM_KEYS = ['readability', 'pace', 'translation', 'hook', 'audio', 'visual'];

function buildCtx(snap) {
  const st = snap.stat || {};
  // 时间基准取「快照采集时间」而不是 now：重放历史快照（如 --demo）才能算对发布天数
  const baseSec = snap.collected_at ? Date.parse(snap.collected_at) / 1000 : Date.now() / 1000;
  const ageDays = snap.pubdate ? (baseSec - snap.pubdate) / 86400 : null;
  const views = num(st.view) ?? 0;
  const texts = [
    ...(snap.replies || []).map((r) => r.text),
    ...(snap.danmakus || []).map((d) => d.text),
  ].filter(Boolean);
  const hits = {};
  for (const k of Object.keys(CLS)) hits[k] = [];
  for (const t of texts) {
    const txt = String(t);
    const positive = POSITIVE.test(txt) && !NEGATIVE.test(txt);
    for (const [k, def] of Object.entries(CLS)) {
      if (!def.re.test(txt)) continue;
      if (positive && PROBLEM_KEYS.includes(k)) continue;  // 正向句不算吐槽
      hits[k].push(txt);
    }
  }
  // 弹幕时间聚集：5 秒一桶，找最大桶
  let burst = null;
  const dm = (snap.danmakus || []).filter((d) => Number.isFinite(d.t));
  if (dm.length >= T.dmBurstMin) {
    const buckets = new Map();
    for (const d of dm) {
      const b = Math.floor(d.t / 5) * 5;
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const [b, n] = [...buckets.entries()].sort((a, c) => c[1] - a[1])[0];
    if (n / dm.length >= T.dmBurstRatio) burst = { start: b, end: b + 5, n, total: dm.length };
  }
  return {
    ageDays, views,
    viewsDelta: num(snap.views_delta),
    likeRate: views > 0 ? (num(st.like) ?? 0) / views : null,
    favRate: views > 0 ? (num(st.favorite) ?? 0) / views : null,
    commentRate: views > 0 ? (num(st.reply) ?? 0) / views : null,
    shareRate: views > 0 ? (num(st.share) ?? 0) / views : null,
    fansDelta: num(snap.fans_delta),
    danmakuCount: num(st.danmaku) ?? 0,
    commentCount: num(st.reply) ?? 0,
    texts, hits, burst,
    hasSignal: texts.length > 0,
  };
}

// ---------------- 规则：信号 → 提案 ----------------
function propose(ctx, report) {
  const P = [];
  const push = (o) => P.push(o);
  const hitN = (k) => ctx.hits[k].length;
  const sample = (k, n = 3) => ctx.hits[k].slice(0, n).map((t) => `「${t.slice(0, 30)}」`).join('、');

  // R1 内容没人看见（曝光问题，不是内容问题）
  if (ctx.ageDays != null && ctx.ageDays >= T.coldStartDays && ctx.views < T.coldStartViews
      && (ctx.viewsDelta == null || ctx.viewsDelta < T.flowDelta)) {
    push({
      id: 'R1', pri: 'P0',
      title: '先解决"被发现"：封面 + 标题 + 分区做一轮 A/B，不动片子',
      goal: `发布 ${ctx.ageDays.toFixed(1)} 天播放仍 ${ctx.views}（< ${T.coldStartViews}），说明没进推荐流；此时改内容等于白改。`,
      evidence: [`播放 ${ctx.views}，单次增量 ${ctx.viewsDelta ?? '—'}`, `评论 ${ctx.commentCount} 条`],
      changes: [
        { file: 'Tool/ops/make_cover.mjs', what: '同一帧出 3 版封面：A 纯标题大字 / B 左右对比 / C 人脸或结果截图', param: '--title / --sub / --tag 换三套文案' },
        { file: 'Tool/ops/publish_bilibili.mjs', what: '标题 5 版短句（≤ 22 字，结论前置），挑 2 版做先后替换', param: 'publish --title' },
        { file: 'Tool/ops/recon_bilibili.mjs', what: '重跑选题雷达，确认"知识区-剪辑"这个坑位当天是否已被同类占满', param: '--out History/loops/next/recon' },
      ],
      acceptance: [
        '每个版本在线跑满 48h 再换，记录播放日增（feedback.csv 的 views_delta）',
        '至少一个版本日增 ≥ 当前基线的 2 倍，否则判定"选题不行"，转 R8',
      ],
      cost: '中（2 天观察窗，人工看 3 版封面）',
      risk: '频繁改标题会重置推荐，一天最多改一次',
    });
  }

  // R2 进了推荐流但没人买账
  if (ctx.viewsDelta != null && ctx.viewsDelta >= T.flowDelta && ctx.likeRate != null && ctx.likeRate < T.likeLow) {
    push({
      id: 'R2', pri: 'P1',
      title: '推荐流在推但点赞率低：封面承诺和内容前 30 秒对不上',
      goal: `本期增量 ${ctx.viewsDelta}（说明有曝光），点赞率 ${pct(ctx.likeRate)} < ${pct(T.likeLow)}。`,
      evidence: [`views_delta ${ctx.viewsDelta}`, `点赞率 ${pct(ctx.likeRate)}`, `收藏率 ${pct(ctx.favRate)}`],
      changes: [
        { file: 'Tool/ops/make_episode.mjs / 讲稿', what: '把封面主标题的承诺写进第 1 句，前 3 秒出现结果对比', param: '--script 改写前 2 行' },
        { file: 'Tool/edit/make_timeline.mjs', what: '把"最强结论"片段提到 0–5s（EDL 重排）', param: 'edits.json 首段顺序' },
      ],
      acceptance: ['新版点赞率 ≥ 3%', '前 10 秒留存由 A/B 对比确认（无完播数据时用点赞率代理）'],
      cost: '低（重剪开头，不动中间）',
      risk: '开头改动可能伤完播，需两版对照',
    });
  }

  // R3 工具型信号
  if (ctx.favRate != null && ctx.favRate >= T.favStrong) {
    push({
      id: 'R3', pri: 'P1',
      title: '收藏率高 = 工具型内容：做成系列 + 出配套清单',
      goal: `收藏率 ${pct(ctx.favRate)} ≥ ${pct(T.favStrong)}，观众在"存着以后用"。`,
      evidence: [`收藏率 ${pct(ctx.favRate)}`, hitN('useful') ? `正向评论 ${hitN('useful')} 条：${sample('useful', 2)}` : '暂无正向评论'],
      changes: [
        { file: 'Idea/Idea.md', what: '定系列名与 5 期母题（同一批观众复用）', param: '—' },
        { file: 'Tool/ops/make_episode.mjs', what: '每期结尾固定 CTA："清单在置顶评论"', param: '--script 尾部' },
      ],
      acceptance: ['第 2 期发布后 7 天内，关注转化（粉丝增量/千播）≥ 本期 2 倍'],
      cost: '中（要写系列大纲）',
      risk: '系列化会压缩单期选题自由度',
    });
  }

  // R4 字幕可读性 — P0（这是"看着费劲"的直接原因）
  if (hitN('readability') >= T.hitMin) {
    push({
      id: 'R4', pri: 'P0',
      title: `字幕可读性返工（${hitN('readability')} 条反馈）`,
      goal: '观众明确说字幕看不清/太小，这是交付质量问题，必须先修。',
      evidence: [`命中 ${hitN('readability')} 条：${sample('readability')}`],
      changes: [
        { file: 'Tool/subtitle/make_ass.mjs', what: '中文字号 40→46、英文字号 36→40、中文每行 14→12 字', param: '--zh-size 46 --en-size 40 --wrap-zh 12' },
        { file: 'Tool/subtitle/make_ass.mjs', what: '底边距抬高，避开 B 站播放器自带进度条遮挡', param: '--en-margin 26→40' },
        { file: '复用 Tool/acceptance/qa_report.mjs', what: '重烧后确认没有越界/重叠', param: '—' },
      ],
      acceptance: ['同一段 10s 截图对比，字号变化可量化', 'qa_report 仍 PASS（无越界/无重叠）', '重发后同类反馈条数下降'],
      cost: '低（只重烧字幕层，不重跑 ASR/翻译）',
      risk: '字号变大→换行变多→可能压画面，需要 wrap-zh 同步降',
    });
  }

  // R5 语速
  if (hitN('pace') >= T.hitMin) {
    push({
      id: 'R5', pri: 'P1',
      title: `语速偏快（${hitN('pace')} 条反馈）`,
      goal: '观众说跟不上，降低每秒字数上限并拆行。',
      evidence: [`命中 ${hitN('pace')} 条：${sample('pace')}`],
      changes: [
        { file: 'Tool/subtitle/make_subs.mjs', what: 'CPS 20→16，单行中文 18→14 字', param: '--cps 16 --max-zh 14' },
        { file: 'Tool/subtitle/make_ass.mjs', what: '同步 --wrap-zh 14→12，避免长句塞一行', param: '--wrap-zh 12' },
      ],
      acceptance: ['export_review 的 cps_over 条数降为 0', '重发后同类反馈消失'],
      cost: '低（重跑 cues + 重烧）',
      risk: '拆行过多会让画面频繁闪，需看 10s 样例',
    });
  }

  // R6 译文质量
  if (hitN('translation') >= T.hitMin) {
    push({
      id: 'R6', pri: 'P0',
      title: `译文质量返工（${hitN('translation')} 条反馈）`,
      goal: '评论指出翻译生硬/术语错，走人工校对闭环。',
      evidence: [`命中 ${hitN('translation')} 条：${sample('translation')}`],
      changes: [
        { file: 'Tool/subtitle/export_review.mjs', what: '导出校对表，按 flags 优先改 cps_over / term_missing', param: '--cps 16' },
        { file: 'Tool/subtitle/apply_review.mjs', what: '改完回写 cues，再重烧', param: '—' },
        { file: 'Tool/subtitle/term_candidates.mjs', what: '把被译坏的术语补进 glossary_zh.json', param: '—' },
      ],
      acceptance: ['flags 里 term_missing 归零', 'apply_review 后 cues 与校对表逐字节一致', '重发后同类反馈消失'],
      cost: '中（人工过一遍中文）',
      risk: '人工改动可能引入断句错位，必须跑 verify_subs',
    });
  }

  // R7 开头留人
  if (hitN('hook') >= T.hitMin) {
    push({
      id: 'R7', pri: 'P0',
      title: `开头留人失败（${hitN('hook')} 条反馈）`,
      goal: '观众在开头就走了，重剪前 3 秒。',
      evidence: [`命中 ${hitN('hook')} 条：${sample('hook')}`],
      changes: [
        { file: '脚本层', what: '第 1 句改成"结论 + 对比画面"：先说省了多少时间，再给前后对比', param: 'script_en.txt 前 2 行' },
        { file: 'Tool/edit/make_timeline.mjs', what: '把最强对比镜头提到 0–3s，原开头下沉到 1:30 后', param: 'edits.json' },
      ],
      acceptance: ['新版前 3 秒信息密度可数（≥2 个视觉变化点）', '点赞率 / 评论率任一提升 ≥ 30%'],
      cost: '低',
      risk: '开头改动影响全片对齐，需重跑 align_script',
    });
  }

  // R8 弹幕某段集中吐槽
  if (ctx.burst) {
    push({
      id: 'R8', pri: 'P1',
      title: `${ctx.burst.start}s–${ctx.burst.end}s 被集中吐槽（${ctx.burst.n}/${ctx.burst.total} 条弹幕）`,
      goal: '弹幕时间点等于观众的"忍耐点"，这段必须改。',
      evidence: [`该 5 秒窗口 ${ctx.burst.n} 条弹幕，占全部 ${pct(ctx.burst.n / ctx.burst.total)}`],
      changes: [
        { file: 'History/runs/feedback/latest.json', what: `读 danmakus 里 t∈[${ctx.burst.start},${ctx.burst.end}] 的原文，确认是"看不懂"还是"画面糊"`, param: '—' },
        { file: 'Tool/edit/make_timeline.mjs', what: '该段缩短或换成更直观的画面', param: 'edits.json 对应区间' },
      ],
      acceptance: ['新版该区间弹幕情绪转为中性/正向'],
      cost: '低',
      risk: '弹幕少时可能是噪声，注意总数门槛',
    });
  }

  // R9 音频
  if (hitN('audio') >= T.hitMin) {
    push({
      id: 'R9', pri: 'P1',
      title: `声音问题（${hitN('audio')} 条反馈）`,
      goal: '音量/配乐盖住人声。',
      evidence: [`命中 ${hitN('audio')} 条：${sample('audio')}`],
      changes: [
        { file: 'Tool/edit/vfactory.mjs', what: '人声侧链压 BGM，整体统一到 −16 LUFS', param: 'loudnorm I=-16' },
      ],
      acceptance: ['loudnorm 实测 −16 ± 0.5 LUFS', '人声段 EBU R128 短时响度高于 BGM ≥ 8 LU'],
      cost: '低',
      risk: '压过头会失真',
    });
  }

  // R10 有数据但零互动
  if (ctx.ageDays != null && ctx.ageDays >= 3 && ctx.views >= T.coldStartViews
      && ctx.commentCount === 0 && (ctx.likeRate ?? 0) < 0.01) {
    push({
      id: 'R10', pri: 'P0',
      title: '有曝光零互动：换选题，不在这一期上继续投',
      goal: '有播放没人互动，说明内容对该分区观众无价值，边际改进无效。',
      evidence: [`播放 ${ctx.views}，评论 0，点赞率 ${pct(ctx.likeRate)}`],
      changes: [
        { file: 'Tool/ops/recon_bilibili.mjs', what: '重跑雷达，横向比 3 个候选选题的"热度 × 互动 × 交付成本"', param: '--top 60' },
        { file: 'Idea/Idea.md', what: '按得分换题，旧题归档到 History', param: '—' },
      ],
      acceptance: ['新选题首日播放日增 > 旧题峰值'],
      cost: '高（等于开新一期）',
      risk: '换题会中断系列感',
    });
  }

  // 兜底：一条都没触发
  if (!P.length) {
    P.push({
      id: 'R0', pri: '—',
      title: '信号不足，本轮不排新循环',
      goal: ctx.texts.length === 0
        ? `当前无评论/弹幕（播放 ${ctx.views}），样本量不足以判断内容好坏。`
        : `有 ${ctx.texts.length} 条文本反馈，但没有任何一类达到触发阈值（同类 ≥ ${T.hitMin} 条）。`,
      evidence: [
        `播放 ${ctx.views}，评论 ${ctx.commentCount}，弹幕 ${ctx.danmakuCount}`,
        `点赞率 ${pct(ctx.likeRate)}，收藏率 ${pct(ctx.favRate)}`,
        `文本反馈 ${ctx.texts.length} 条`,
      ],
      changes: [{ file: '—', what: '继续按 T+1 / T+3 / T+7 采集；达到阈值后本脚本会自动出提案', param: '—' }],
      acceptance: ['下一次采集若出现 ≥2 条同类反馈，自动生成对应提案'],
      cost: '零',
      risk: '—',
    });
  }

  const order = { P0: 0, P1: 1, P2: 2, '—': 3 };
  P.sort((a, b) => (order[a.pri] ?? 9) - (order[b.pri] ?? 9));
  return P;
}

// ---------------- --demo：内置合成快照，验证规则能不能跑 ----------------
// 只验证"信号→提案"这条链是否连通，产物落在 _demo/，绝不写进正式 plan.md。
const DEMO = args.includes('--demo');
const DEMO_SNAP = {
  collected_at: '2026-11-04T02:00:00.000Z',
  bvid: 'BV_DEMO', title: '（DRY-RUN 合成样本）5 个剪辑提速技巧',
  duration_s: 37, pubdate: 1793431337,
  stat: { view: 3000, like: 24, favorite: 210, reply: 12, danmaku: 8, coin: 8, share: 5 },
  fans_total: 26, fans_delta: 25, views_delta: 800,
  replies: [
    { user: 'a', text: '字幕太小了，手机上根本看不清', like: 9 },
    { user: 'b', text: '字幕能不能大一点，白字有点糊', like: 5 },
    { user: 'c', text: '第三句翻译怪怪的，机翻味很重', like: 3 },
    { user: 'd', text: '翻译有点硬，其他都挺好', like: 2 },
    { user: 'e', text: '求系列！这个太有用了', like: 12 },
  ],
  danmakus: [
    { t: 12.3, text: '这里字幕看不清' }, { t: 12.9, text: '太快了' }, { t: 13.9, text: '字幕挡住画面了' },
    { t: 14.2, text: '没看懂' }, { t: 14.8, text: '太快' }, { t: 2.1, text: '开头不错' }, { t: 30.5, text: '有用' },
  ],
};

// ---------------- 主流程 ----------------
const snap = DEMO ? DEMO_SNAP : loadJson(SNAP);
if (!snap) {
  console.error(`[plan] 找不到快照 ${path.relative(ROOT, SNAP)}，先跑 collect_feedback.mjs`);
  process.exit(1);
}
const outDir = DEMO ? path.resolve(ROOT, 'History/loops/next/_demo') : OUTDIR;
const report = loadJson(REPORT);
const ctx = buildCtx(snap);
const proposals = propose(ctx, report);

const now = new Date();
const fsStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toTimeString().slice(0, 5)}`;

const L = [];
L.push(DEMO ? '# 下一轮小循环 · 提案（DRY-RUN：内置合成样本，不代表真实表现）\n' : '# 下一轮小循环 · 提案\n');
L.push(`> 生成：${fsStamp}　依据快照：\`${DEMO ? '--demo 内置样本' : path.relative(ROOT, SNAP)}\`（采集于 ${snap.collected_at || '—'}）`);
L.push(`> 稿件：${snap.bvid || '—'}　${snap.title || ''}`);
L.push('> **状态：待批准** —— 本文件是任务书，不代表已经开跑。开轮次要人点头。\n');

L.push('## 1. 现在的数据\n');
L.push('| 指标 | 值 |');
L.push('| --- | --- |');
L.push(`| 发布时长 | ${ctx.ageDays == null ? '—' : ctx.ageDays.toFixed(1) + ' 天'} |`);
L.push(`| 播放 / 本次增量 | ${ctx.views} / ${ctx.viewsDelta == null ? '首个快照' : '+' + ctx.viewsDelta} |`);
L.push(`| 点赞率 | ${pct(ctx.likeRate)} |`);
L.push(`| 收藏率 | ${pct(ctx.favRate)} |`);
L.push(`| 评论 / 弹幕 | ${ctx.commentCount} / ${ctx.danmakuCount} |`);
L.push(`| 粉丝增量 | ${ctx.fansDelta == null ? '—' : ctx.fansDelta} |`);
L.push('');

L.push('## 2. 反馈分类（评论 + 弹幕原文命中）\n');
const hitRows = Object.entries(CLS).filter(([k]) => ctx.hits[k].length > 0);
if (!hitRows.length) L.push('没有任何文本反馈，分类为空。\n');
else {
  L.push('| 类别 | 条数 | 示例 |');
  L.push('| --- | --- | --- |');
  for (const [k, def] of hitRows) {
    const ex = ctx.hits[k].slice(0, 2).map((t) => `「${t.slice(0, 26)}」`).join(' ');
    L.push(`| ${def.label} | ${ctx.hits[k].length} | ${ex} |`);
  }
  L.push('');
}

L.push('## 3. 下一轮提案\n');
for (const p of proposals) {
  L.push(`### ${p.pri} · ${p.id}　${p.title}\n`);
  L.push(`**为什么做**：${p.goal}\n`);
  L.push('**证据**：');
  for (const e of p.evidence) L.push(`- ${e}`);
  L.push('\n**改什么**：\n');
  L.push('| 位置 | 动作 | 参数 |');
  L.push('| --- | --- | --- |');
  for (const c of p.changes) L.push(`| \`${c.file}\` | ${c.what} | ${c.param ? '`' + c.param + '`' : '—'} |`);
  L.push('\n**怎么算过关**：');
  for (const a of p.acceptance) L.push(`- ${a}`);
  L.push(`\n**成本**：${p.cost}　**风险**：${p.risk}\n`);
}

if (report && report.actions && report.actions.length) {
  L.push('## 4. 与 track_feedback 诊断的对齐\n');
  L.push('| 优先级 | 动作 | 依据 |');
  L.push('| --- | --- | --- |');
  for (const a of report.actions) L.push(`| ${a.priority} | ${a.action} | ${a.because} |`);
  L.push('');
}

L.push('## 5. 待你决定\n');
L.push('1. 采纳哪条提案（默认取上方第一条 P0）？说一句"按 R4 开跑"即可。');
L.push('2. 是否要我自动执行：`watch_feedback` 只做采集与规划，**不自动开轮次**；要全自动请明确授权。');
L.push('3. 完播率仍然是空的（公开接口没有），需要你把创作中心的「平均播放时长」用 `--avg-watch <秒>` 补一次，规则才能用上最强指标。');
L.push('');
L.push('---');
L.push('');
L.push('> 阈值表在 `Tool/ops/plan_next_loop.mjs` 的 `const T = {...}`，词表在同文件的 `const CLS`。');
L.push('> 想调"几条反馈才算数"改 `hitMin`；想调"多久算冷启动"改 `coldStartDays`。');

const md = L.join('\n') + '\n';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'plan.md'), md, 'utf8');
const json = {
  generated_at: now.toISOString(),
  snapshot: snap.collected_at,
  bvid: snap.bvid,
  context: { ...ctx, hits: Object.fromEntries(Object.entries(ctx.hits).map(([k, v]) => [k, v])) },
  proposals,
};
fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(json, null, 2), 'utf8');

/**
 * plan_history 只记「结论变化」，不记「跑过一次」。
 * 半小时一唤醒后每天会 append 48 行，而绝大多数是同一个提案集重复一遍；
 * 播放量的时序另有 History/runs/feedback/ticks.jsonl 负责（一 tick 一行）。
 * 幂等规则：提案的「优先级+编号」序列与上一条完全相同 → 跳过。
 */
if (!DEMO) {
  const histFile = path.join(outDir, 'plan_history.jsonl');
  const entry = {
    at: now.toISOString(),
    bvid: snap.bvid,
    views: ctx.views,
    proposals: proposals.map((p) => ({ id: p.id, pri: p.pri, title: p.title })),
  };
  const sigOf = (o) => JSON.stringify((o.proposals || []).map((p) => `${p.pri}${p.id}`));
  let prevEntry = null;
  try {
    const lines = fs.readFileSync(histFile, 'utf8').trimEnd().split('\n');
    prevEntry = JSON.parse(lines[lines.length - 1]);
  } catch { /* 首次跑，正常 */ }
  if (!prevEntry || sigOf(prevEntry) !== sigOf(entry)) {
    fs.appendFileSync(histFile, JSON.stringify(entry) + '\n', 'utf8');
  }
}

console.log(`[plan] 播放 ${ctx.views}｜评论 ${ctx.commentCount}｜弹幕 ${ctx.danmakuCount}｜提案 ${proposals.length} 条`);
for (const p of proposals) console.log(`[plan]   ${p.pri} ${p.id} ${p.title}`);
console.log(`[plan] -> ${path.relative(ROOT, path.join(outDir, 'plan.md'))}`);
