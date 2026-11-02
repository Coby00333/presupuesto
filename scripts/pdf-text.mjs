import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
const buf = readFileSync(process.argv[2]);
let out = '';
let i = 0;
while ((i = buf.indexOf('stream', i)) !== -1) {
  const end = buf.indexOf('endstream', i);
  if (end === -1) break;
  let s = i + 6;
  if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
  const raw = buf.subarray(s, end);
  let dec = null;
  try { dec = zlib.inflateSync(raw); } catch (e) { dec = raw; }
  out += dec.toString('latin1') + '\n';
  i = end + 9;
}
const keys = process.argv.slice(3);
keys.forEach(k => console.log(out.includes(k) ? `OK     "${k}"` : `FALTA  "${k}"`));
