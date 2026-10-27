// 调试 Vosk koffi 绑定：检查 WAV 数据偏移、accept_waveform 返回值、result JSON
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../../Tool/lib/ff.mjs';

const ASRDIR = path.join(ROOT, 'Workspace', 'asr');
const require = createRequire(path.join(ASRDIR, 'index.cjs'));
const koffi = require('koffi');
const lib = koffi.load(path.join(ASRDIR, 'node_modules', 'vosk', 'lib', 'win-x86_64', 'libvosk.dll'));

const model = lib.func('void *vosk_model_new(const char *model_path)');
const rec_new = lib.func('void *vosk_recognizer_new(void *model, float sample_rate)');
const accept = lib.func('int vosk_recognizer_accept_waveform(void *rec, const void *data, int len)');
const result = lib.func('const char *vosk_recognizer_result(void *rec)');
const final = lib.func('const char *vosk_recognizer_final_result(void *rec)');
const set_words = lib.func('void vosk_recognizer_set_words(void *rec, int words)');

const wav = path.join(ROOT, 'History', 'asr', '.asr_work', 'asr_16k.wav');
const buf = fs.readFileSync(wav);
// 解析 WAV：找 'data' chunk 起点
const riff = buf.toString('ascii', 0, 4);
const fmt = buf.toString('ascii', 12, 16);
let off = 12, dataOff = -1, dataLen = 0;
while (off + 8 <= buf.length) {
  const id = buf.toString('ascii', off, off + 4);
  const sz = buf.readUInt32LE(off + 4);
  if (id === 'data') { dataOff = off + 8; dataLen = sz; break; }
  off += 8 + sz + (sz % 2);
}
console.log('riff', riff, 'fmt', fmt, 'fileSize', buf.length, 'dataOff', dataOff, 'dataLen', dataLen, 'bytesPerSample', buf.readUInt16LE(34), 'channels', buf.readUInt16LE(22), 'rate', buf.readUInt32LE(24));

const MODEL = path.join(ROOT, 'Workspace', 'asr', 'models', 'vosk-model-small-en-us-0.15');
const m = model(MODEL);
console.log('model handle:', m, koffi.address(m));
const rec = rec_new(m, 16000.0);
console.log('rec handle:', rec, koffi.address(rec));
set_words(rec, 1);

const data = buf.subarray(dataOff, dataOff + dataLen);
console.log('pcm bytes:', data.length, 'expected sec:', data.length / (16000 * 2));
const CHUNK = 16000 * 2;
let n = 0;
for (let o = 0; o < data.length; o += CHUNK) {
  const seg = data.subarray(o, Math.min(o + CHUNK, data.length));
  const r = accept(rec, seg, seg.length);
  if (n < 3) console.log(`accept[${n}] ->`, r, 'resultLen', String(result(rec)).length);
  n++;
}
const fr = String(final(rec));
console.log('final len:', fr.length, fr.slice(0, 400));
