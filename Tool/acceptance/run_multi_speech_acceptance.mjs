#!/usr/bin/env node
/**
 * run_multi_speech_acceptance.mjs — 小循环 4 验收：**多个英文样本**批量跑「英译中字幕」全链路
 *
 * 与小循环 3 的区别：不只一条素材，而是一批（真实影视片段 + 多口音 TTS 样本），
 * 逐样本跑同一条链路，产出可横向对比的指标表：
 *   识别（词数/置信度，两种预处理对照）→ 剪辑（语音保护）→ 翻译 → 重映射 → 烧入 → 验收/质检
 *
 * 用法：
 *   node Tool\acceptance\run_multi_speech_acceptance.mjs                     # 跑全部
 *   node Tool\acceptance\run_multi_speech_acceptance.mjs --only sintel_trailer,en-GB-Sonia
 *   node Tool\acceptance\run_multi_speech_acceptance.mjs --no-render         # 不烧片（只出指标）
 *
 * 样本来源（先跑 Tool\setup\fetch_more_speech.mjs 与 make_speech4_tts.mjs）：
 *   Workspace/assets/speech4/<id>/<id>.mp4     真实影视（Sintel/BBB/ToS，CC-BY 3.0，无讲稿真值）
 *   Workspace/assets/speech4tts/<id>/source.mp4 多口音 TTS（带逐句真值 → 可算 WER）
 *
 * 判定：
 *   - 有真值样本：WER ≤ 25%、语音覆盖 ≥ 95%、句界误差、译文覆盖 100%
 *   - 无真值样本：reference-free（译文覆盖 / 可读性 / 重映射自检 / 识别置信度）
 *   - 成片质检 PASS（"仅残留黑场告警"视为已知取舍，不算失败）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffprobeJson, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ONLY = (getOpt('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const NO_RENDER = args.includes('--no-render');
const MT = getOpt('--mt', 'mymemory');
const NODE = process.execPath;
const AF_BANDPASS = 'afftdn=nf=-25,highpass=f=300,lowpass=f=3400';

const L4 = path.join(ROOT, 'History', 'loops', 'loop04');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
const PROTO = path.join(ROOT, 'Prototype', 'loop4_multi_samples');
fs.mkdirSync(L4, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

// 并发保护：被 kill 的 job 可能留下孤儿子进程继续跑，两个 driver 同时写 metrics.json 会互相覆盖
// （实测踩过：一个孤儿把 9 样本的结果盖到了 7 样本的结果上）。用 pid 锁挡住。
const LOCK = path.join(L4, '.run.lock');
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
if (fs.existsSync(LOCK)) {
  const old = Number(fs.readFileSync(LOCK, 'utf8').trim());
  if (old && old !== process.pid && pidAlive(old)) {
    console.error(`已有另一个 driver 在跑（pid ${old}）。若确认它已死，删掉 ${path.relative(ROOT, LOCK)} 再跑。`);
    process.exit(2);
  }
  console.log(`[lock] 清理陈旧锁（pid ${old} 已不存在）`);
}
fs.writeFileSync(LOCK, String(process.pid));
const releaseLock = () => { try { if (Number(fs.readFileSync(LOCK, 'utf8').trim()) === process.pid) fs.rmSync(LOCK, { force: true }); } catch { /* ignore */ } };
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(130); });

function runNode(rel, scriptArgs, logName) {
  const log = path.join(LOGS, `${logName}.log`);
  const fd = fs.openSync(log, 'w');
  let r;
  try {
    r = spawnSync(NODE, [path.join(ROOT, 'Tool', rel), ...scriptArgs], { stdio: ['ignore', fd, fd], cwd: ROOT });
  } finally { fs.closeSync(fd); }
  return { status: r.status, text: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}
function stepErr(res, rel) {
  const tail = res.text.trim().split('\n').slice(-4).join(' | ');
  throw new Error(`${rel} 失败（exit ${res.status}）: ${tail}`);
}

// ---------------------------------------------------------------- 找样本
const samples = [];
// 已知无对白的素材：当"阴性对照"用 —— 期望它识别不出词、也不该凭空造字幕
const CONTROL_IDS = new Set(['bbb_trailer', 'tv_jellyfish_10s']);
// 整片与"时间码测试片"默认不进批量（太贵/无对白），需要时用 --only 显式指定
const EXCLUDE_DEFAULT = new Set(['bbb_movie_full', 'toS_movie300']);
const realRoot = path.join(ROOT, 'Workspace', 'assets', 'speech4');
if (fs.existsSync(realRoot)) {
  for (const dir of fs.readdirSync(realRoot)) {
    const clip = path.join(realRoot, dir, `${dir}.mp4`);
    if (!fs.existsSync(clip)) continue;                 // 整片（bbb_movie_full）不直接当样本，用截取版
    if (EXCLUDE_DEFAULT.has(dir) && !ONLY.includes(dir)) continue;
    const control = CONTROL_IDS.has(dir);
    samples.push({ id: dir, kind: control ? 'control' : 'real', clip, gt: null, control,
      note: control ? '阴性对照：无对白素材（不应产出字幕）' : '真实影视素材（无讲稿真值）' });
  }
}
const ttsRoot = path.join(ROOT, 'Workspace', 'assets', 'speech4tts');
if (fs.existsSync(ttsRoot)) {
  for (const dir of fs.readdirSync(ttsRoot)) {
    const clip = path.join(ttsRoot, dir, 'source.mp4');
    const gt = path.join(ttsRoot, dir, 'ground_truth.json');
    if (!fs.existsSync(clip)) continue;
    samples.push({ id: `tts_${dir}`, kind: 'tts', clip, gt: fs.existsSync(gt) ? gt : null, note: '多口音 TTS（带逐句真值）' });
  }
}
// 截取片段（对白密度高的窗口，由 select_speech4_excerpts.mjs / make_tos_excerpt.mjs 生成）
const excerptManifest = path.join(L4, 'excerpts.json');
if (fs.existsSync(excerptManifest)) {
  for (const e of JSON.parse(fs.readFileSync(excerptManifest, 'utf8')).excerpts || []) {
    const clip = path.resolve(ROOT, e.clip);
    if (!fs.existsSync(clip)) continue;
    samples.push({ id: e.id, kind: 'real', clip, gt: e.gt ? path.resolve(ROOT, e.gt) : null, note: e.note || '真实素材截取片段' });
  }
}

const list = ONLY.length ? samples.filter((s) => ONLY.includes(s.id)) : samples;
if (!list.length) { console.error('没有可用样本：先跑 node Tool\\setup\\fetch_more_speech.mjs 与 make_speech4_tts.mjs'); process.exit(2); }
console.log(`样本 ${list.length} 个：${list.map((s) => s.id).join(', ')}\n`);

// ---------------------------------------------------------------- 逐样本跑链路
const rows = [];
const tAll = Date.now();

for (const s of list) {
  const t0 = Date.now();
  const RUN = path.join(ROOT, 'History', 'runs', 'multi', s.id);
  const SUBS = path.join(ROOT, 'History', 'subs', 'multi', s.id);
  const REMAP = path.join(SUBS, 'remapped');
  const ASR = path.join(ROOT, 'History', 'asr', 'multi', `${s.id}.json`);
  fs.mkdirSync(RUN, { recursive: true });
  fs.mkdirSync(SUBS, { recursive: true });

  console.log(`\n=== ${s.id}（${s.kind}）${s.note}`);
  const row = { id: s.id, kind: s.kind, clip: path.relative(ROOT, s.clip), gt: s.gt ? path.relative(ROOT, s.gt) : null, ok: false };
  try {
    const pr = ffprobeJson(['-show_format', '-show_streams', s.clip], path.join(RUN, '_probe.log'));
    const dur = Number(pr.format?.duration || 0);
    const v = (pr.streams || []).find((x) => x.codec_type === 'video');
    const a = (pr.streams || []).find((x) => x.codec_type === 'audio');
    row.duration_s = Number(dur.toFixed(2));
    row.resolution = v ? `${v.width}x${v.height}` : '-';
    row.audio = a ? `${a.sample_rate}Hz ${a.channels}ch` : '无';
    if (!a) throw new Error('素材无音轨，跳过');
    console.log(`  时长 ${dur.toFixed(1)}s ${row.resolution} 音频 ${row.audio}`);

    // 1) 识别：两种预处理对照（检验"带通降噪更优"这条结论能否迁移到别的素材）
    const variants = [];
    for (const [vname, af] of [['baseline', ''], ['bandpass', AF_BANDPASS]]) {
      const out = path.join(ROOT, 'History', 'asr', 'multi', `${s.id}.${vname}.json`);
      const r = runNode('subtitle/asr_vosk.mjs', [s.clip, '--out', out, ...(af ? ['--af', af] : [])], `m4_${s.id}_asr_${vname}`);
      if (r.status !== 0) { variants.push({ name: vname, error: '识别失败' }); continue; }
      const t = JSON.parse(fs.readFileSync(out, 'utf8'));
      variants.push({ name: vname, file: out, words: t.words.length, conf: t.stats.avg_conf, text: t.text });
      console.log(`  [asr] ${vname.padEnd(9)} words=${String(t.words.length).padStart(4)} conf=${t.stats.avg_conf}`);
    }
    const usable = variants.filter((v) => !v.error);
    if (!usable.length) throw new Error('两种预处理的识别都失败');
    // 选择规则：词数不少于最优者的一半时比置信度；否则取词数多的（宁可多识别，也不接受"只认出几个词但很自信"）
    const maxWords = Math.max(...usable.map((v) => v.words));
    const cands = usable.filter((v) => v.words >= maxWords * 0.5);
    const best = cands.sort((a, b) => b.conf - a.conf)[0];
    fs.copyFileSync(best.file, ASR);
    row.asr_variants = variants.map((v) => ({ name: v.name, words: v.words, conf: v.conf, error: v.error || null }));
    row.asr_chosen = best.name;
    row.words = best.words;
    row.conf = best.conf;
    row.asr_text = best.text.slice(0, 400);
    console.log(`  [asr] 采用 ${best.name}（${best.words} 词，置信度 ${best.conf}）`);
    if (best.words < 8 && s.control) {
      // 阴性对照：本来就没对白 → "几乎识别不出词"才是正确行为，不产出字幕也算通过
      row.ok = true;
      row.verify_verdict = `N/A（阴性对照：仅 ${best.words} 个噪声词）`;
      row.sec = Number(((Date.now() - t0) / 1000).toFixed(1));
      console.log(`  [control] 仅 ${best.words} 个词 → 符合预期（不应凭空造字幕），${row.sec}s`);
      rows.push(row);
      continue;
    }

    // 2) 剪辑（带语音保护）
    fs.rmSync(RUN, { recursive: true, force: true });
    fs.mkdirSync(RUN, { recursive: true });
    const rc = runNode('edit/vfactory.mjs', [s.clip, '--out', RUN, '--title', `${s.id} · 中文字幕`, '--protect', ASR], `m4_${s.id}_cut`);
    if (rc.status !== 0) stepErr(rc, 'edit/vfactory.mjs');
    const edl = JSON.parse(fs.readFileSync(path.join(RUN, 'edits.json'), 'utf8'));
    row.cut_s = Number(edl.cut.reduce((a, c) => a + (c.end - c.start), 0).toFixed(2));
    row.kept_s = Number(edl.kept.reduce((a, k) => a + (k.end - k.start), 0).toFixed(2));
    row.protected_spans = (edl.decision?.protected_spans || []).length;
    console.log(`  [cut] 保留 ${row.kept_s}s / 切除 ${row.cut_s}s / 语音保护 ${row.protected_spans} 段`);

    // 3) 字幕（句子级翻译 → 显示行）
    const rs = runNode('subtitle/make_subs.mjs', [ASR, '--out', SUBS, '--mt', MT,
      '--glossary', path.join(ROOT, 'Tool', 'subtitle', 'glossary_zh.json')], `m4_${s.id}_subs`);
    if (rs.status !== 0) stepErr(rs, 'subtitle/make_subs.mjs');
    const cues = JSON.parse(fs.readFileSync(path.join(SUBS, 'cues.json'), 'utf8'));
    row.cues = cues.sentences?.length || cues.cues?.length || 0;

    // 4) 重映射（字幕跟随剪辑）
    const rm = runNode('subtitle/remap_subs.mjs', [path.join(SUBS, 'cues.json'), path.join(RUN, 'edits.json'),
      '--out', REMAP, '--style', 'bilingual'], `m4_${s.id}_remap`);
    if (rm.status !== 0) stepErr(rm, 'subtitle/remap_subs.mjs');

    // 5) 烧入成片（可选）
    let final = null;
    if (!NO_RENDER) {
      const rr = runNode('edit/vfactory.mjs', [s.clip, '--out', RUN, '--title', `${s.id} · 中文字幕`, '--protect', ASR,
        '--srt', path.join(REMAP, 'out_bilingual.srt')], `m4_${s.id}_render`);
      if (rr.status !== 0) stepErr(rr, 'edit/vfactory.mjs(render)');
      final = path.join(RUN, 'final.mp4');
      row.final_mb = Number((fs.statSync(final).size / 1048576).toFixed(1));
    }

    // 6) 验收 + 质检
    const verArgs = [ASR, s.gt || path.join(RUN, '_gt_stub.json'), '--cues', path.join(SUBS, 'cues.json'),
      '--remap', path.join(REMAP, 'remap.json'), '--json', path.join(RUN, 'verify_subs.json')];
    if (!s.gt) {
      // reference-free：写一份"无真值"占位，让 verify_subs 走自洽性判定
      fs.writeFileSync(path.join(RUN, '_gt_stub.json'), JSON.stringify({
        reference_free: true, note: '真实素材无讲稿真值，只做自洽性验收', clip: row.clip, duration_s: row.duration_s,
      }, null, 2));
    }
    const rv = runNode('subtitle/verify_subs.mjs', verArgs, `m4_${s.id}_verify`);
    const verify = JSON.parse(fs.readFileSync(path.join(RUN, 'verify_subs.json'), 'utf8'));
    row.verify_verdict = verify.verdict;
    // verify_subs 的字段：mode / wer.rate / timing.coverage_ratio / translate / readability / remap / pass
    row.has_reference = /with-reference/.test(String(verify.mode || ''));
    row.wer = verify.wer?.rate ?? null;
    row.coverage = verify.timing?.coverage_ratio ?? null;
    row.bound_mean = verify.timing?.mean_boundary_err_s ?? null;
    row.translated = verify.translate?.translated ?? null;
    row.cues_out = verify.translate?.cues ?? null;
    row.max_zh_cps = verify.readability?.max_zh_cps ?? null;
    row.remap = verify.remap ? { cues_out: verify.remap.cues_out, overflow: verify.remap.overflow, overlaps: verify.remap.overlaps, min_dur: verify.remap.min_dur } : null;

    let qa = null;
    if (final) {
      const rq = runNode('acceptance/qa_report.mjs', [final, '--json', path.join(RUN, 'qa.json')], `m4_${s.id}_qa`);
      qa = JSON.parse(fs.readFileSync(path.join(RUN, 'qa.json'), 'utf8'));
      row.qa_verdict = qa.verdict;
      row.lufs = qa.loudness?.integrated_lufs ?? null;
      const failed = Object.entries(qa.checks || {}).filter(([, v]) => v === false).map(([k]) => k);
      row.qa_failed = failed;
      row.qa_black_only = qa.verdict !== 'FAIL' && failed.length === 1 && failed[0] === 'no_residual_black';
    }

    // 字幕句子（用于报告里的译文抽检）
    row.sentences = (cues.sentences || []).slice(0, 40).map((c) => ({ start: c.start, end: c.end, en: c.en, zh: c.zh }));

    // 有真值时，进一步定位"漏在哪"：按真值句长分桶看覆盖率，并列出被完全漏掉的句子
    if (s.gt) {
      try {
        const gt = JSON.parse(fs.readFileSync(s.gt, 'utf8'));
        const cov = verify.timing?.sentences || [];
        row.gt_lines = (gt.sentences || []).map((g, i) => ({
          words: String(g.text).split(/\s+/).filter(Boolean).length,
          text: g.text,
          start: g.start,
          covered: cov[i]?.covered_ratio ?? null,
          boundary_err: cov[i] ? Math.max(cov[i].start_err ?? 0, cov[i].end_err ?? 0) : null,
        }));
        const bucket = (lo, hi) => {
          const arr = row.gt_lines.filter((g) => g.words >= lo && g.words <= hi && g.covered != null);
          if (!arr.length) return null;
          return { n: arr.length, cov: Number((arr.reduce((a, g) => a + g.covered, 0) / arr.length).toFixed(3)), missed: arr.filter((g) => g.covered < 0.2).length };
        };
        row.coverage_buckets = { short: bucket(1, 3), mid: bucket(4, 8), long: bucket(9, 999) };
        row.missed_lines = row.gt_lines.filter((g) => g.covered != null && g.covered < 0.2).map((g) => g.text);
      } catch { /* 分析失败不影响主判定 */ }
    }

    const qaOk = !final || row.qa_verdict !== 'FAIL';
    row.ok = row.verify_verdict === 'PASS' && qaOk;
    row.sec = Number(((Date.now() - t0) / 1000).toFixed(1));
    console.log(`  [verify] ${row.verify_verdict}${row.has_reference ? ` / WER ${(row.wer * 100).toFixed(1)}% / 覆盖 ${(row.coverage * 100).toFixed(1)}%` : ' / reference-free'}` +
      `${final ? ` / QA ${row.qa_verdict}${row.qa_black_only ? '(仅残留黑场告警)' : ''}` : ''} / ${row.sec}s`);
  } catch (e) {
    row.error = String(e.message).slice(0, 220);
    row.sec = Number(((Date.now() - t0) / 1000).toFixed(1));
    console.log(`  [fail] ${row.error}`);
  }
  rows.push(row);
}

// ---------------------------------------------------------------- 汇总
const okCount = rows.filter((r) => r.ok).length;
const L = [];
L.push('# 小循环 4 验收记录：多样本英文 → 中文（真实影视 + 多口音 TTS）', '');
L.push(`生成时间：${new Date().toISOString()}　样本数：${rows.length}　通过：${okCount}/${rows.length}　总耗时：${Math.round((Date.now() - tAll) / 1000)}s`, '');
L.push('## 横向对比总表', '');
L.push('| 样本 | 类型 | 时长 | 识别(词/置信度) | 预处理胜出 | 剪辑(保留/切除) | 字幕句数 | 译文覆盖 | 可读性峰值 | WER | 成片 | 结论 |');
L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  const asrCell = r.words != null ? `${r.words} / ${r.conf}` : '-';
  const cutCell = r.kept_s != null ? `${r.kept_s}s / ${r.cut_s}s` : '-';
  const trCell = r.cues_out != null ? `${r.translated}/${r.cues_out}` : '-';
  const cps = r.max_zh_cps != null ? `${r.max_zh_cps} 字/秒` : '-';
  const wer = r.has_reference && r.wer != null ? `${(r.wer * 100).toFixed(1)}%` : (r.has_reference ? '-' : '无真值');
  const qa = r.qa_verdict ? `${r.qa_verdict}${r.qa_black_only ? '（黑场告警）' : ''}` : '-';
  const verdict = r.error ? `❌ ${r.error.slice(0, 40)}` : (r.ok ? '✅ PASS' : '⚠️ 未通过');
  L.push(`| ${r.id} | ${r.kind} | ${r.duration_s ?? '-'}s | ${asrCell} | ${r.asr_chosen || '-'} | ${cutCell} | ${r.cues ?? '-'} | ${trCell} | ${cps} | ${wer} | ${qa} | ${verdict} |`);
}
L.push('');

// 预处理选择的迁移性
L.push('## 关键问题 1：小循环 3 的"带通降噪更优"能迁移到别的素材吗？', '');
L.push('| 样本 | baseline 词数/置信度 | bandpass 词数/置信度 | 采用 |');
L.push('| --- | --- | --- | --- |');
for (const r of rows) {
  if (!r.asr_variants) continue;
  const g = (n) => {
    const v = r.asr_variants.find((x) => x.name === n);
    return v && !v.error ? `${v.words} / ${v.conf}` : (v?.error || '-');
  };
  L.push(`| ${r.id} | ${g('baseline')} | ${g('bandpass')} | ${r.asr_chosen || '-'} |`);
}
L.push('');

// 识别质量与素材的关系
L.push('## 关键问题 2：什么素材最容易崩？', '');
const sorted = [...rows].filter((r) => r.words).sort((a, b) => (a.conf || 0) - (b.conf || 0));
if (sorted.length) {
  L.push('按识别置信度升序（越低越难）：', '');
  L.push('| 样本 | 音频 | 置信度 | 识别文本（前 140 字符） |');
  L.push('| --- | --- | --- | --- |');
  for (const r of sorted) L.push(`| ${r.id} | ${r.audio || '-'} | ${r.conf} | ${(r.asr_text || '').slice(0, 140).replace(/\|/g, '/')} |`);
  L.push('');
}

// 漏在什么地方（仅对有真值的样本）
const withGt = rows.filter((r) => r.coverage_buckets);
if (withGt.length) {
  L.push('## 关键问题 3：字幕"漏"在什么地方？（有真值样本，按真值句长分桶）', '');
  L.push('| 样本 | 短句(1–3 词) 覆盖/句数/漏掉 | 中句(4–8 词) | 长句(≥9 词) | 被整句漏掉的句子 |');
  L.push('| --- | --- | --- | --- | --- |');
  const cell = (b) => (b ? `${(b.cov * 100).toFixed(0)}% / ${b.n} / ${b.missed}` : '-');
  for (const r of withGt) {
    const b = r.coverage_buckets;
    L.push(`| ${r.id} | ${cell(b.short)} | ${cell(b.mid)} | ${cell(b.long)} | ${(r.missed_lines || []).slice(0, 8).join(' / ').replace(/\|/g, '/') || '无'} |`);
  }
  L.push('');
  L.push('> 读法：短句（感叹、呼叫、单字应答）在影视混音里最容易被吞掉 —— 这直接决定了"译文缺句"而不是"译文错译"。');
  L.push('');
}

// 逐样本译文抽检
L.push('## 译文抽检（每样本前 6 句）', '');
for (const r of rows) {
  if (!r.sentences?.length) continue;
  L.push(`### ${r.id}`, '');
  L.push('| 时间 | 英文（识别） | 中文（机翻） |');
  L.push('| --- | --- | --- |');
  for (const c of r.sentences.slice(0, 6)) L.push(`| ${Number(c.start).toFixed(2)}–${Number(c.end).toFixed(2)} | ${String(c.en).replace(/\|/g, '/')} | ${String(c.zh || '').replace(/\|/g, '/')} |`);
  L.push('');
}

L.push('## 产物位置', '');
L.push('- 逐样本产物：`History/runs/multi/<样本id>/`（final.mp4、edits.json、qa.json、verify_subs.json）');
L.push('- 逐样本字幕：`History/subs/multi/<样本id>/remapped/out_bilingual.srt`');
L.push('- 识别稿：`History/asr/multi/<样本id>.json`（另有 `.baseline.json` / `.bandpass.json` 对照）');
L.push('- 机器可读指标：`History/loops/loop04/metrics.json`');
L.push('- 交付快照：`Prototype/loop4_multi_samples/`');

fs.writeFileSync(path.join(L4, 'report.md'), L.join('\n'));
fs.writeFileSync(path.join(L4, 'metrics.json'), JSON.stringify({ generated_at: new Date().toISOString(), ok: okCount, total: rows.length, rows }, null, 2));
console.log(`\n[multi] ${okCount}/${rows.length} 通过 → ${path.relative(ROOT, path.join(L4, 'report.md'))}`);
process.exit(okCount === rows.length ? 0 : 1);
