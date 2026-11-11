// GLB 애니메이션 이름·길이와 관절 이름 목록
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
console.log('joints', json.skins?.[0].joints.length, ':', json.skins?.[0].joints.map((j) => json.nodes[j].name).join(' '));
const an = json.animations.map((a) => { const t = a.samplers.map((s) => json.accessors[s.input]); return a.name + '(' + Math.max(...t.map((x) => x.max[0])).toFixed(2) + ')'; });
console.log('animations', an.length); console.log(an.join('  '));
