// 병사 모델 경량화: 텍스처 분리(런타임에 data URL로 직접 로드), 불필요한 UV·애니메이션 채널 제거
// 사용: node tools/optimize-soldier.mjs <입력.glb> <출력 폴더>
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { writeFileSync, statSync } from 'node:fs';
import sharp from '/opt/npm-tools/node_modules/sharp/dist/index.mjs';

const [inPath, outDir] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(inPath);
const root = doc.getRoot();
for (const tex of root.listTextures()) {
  const name = /diffuse/.test(tex.getName()) ? 'soldier_diff' : 'soldier_nrm';
  const meta = await sharp(tex.getImage()).metadata();
  await sharp(tex.getImage()).resize(512, 512).jpeg({ quality: name === 'soldier_diff' ? 84 : 80 }).toFile(`${outDir}/${name}.jpg`);
  console.log(tex.getName(), meta.width + 'x' + meta.height, '→', name, statSync(`${outDir}/${name}.jpg`).size, 'bytes');
}
for (const m of root.listMaterials()) { m.setBaseColorTexture(null); m.setNormalTexture(null); }
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) for (const s of p.listSemantics()) if (/^TEXCOORD_[1-9]/.test(s)) p.setAttribute(s, null);
for (const a of root.listAnimations()) {
  if (a.getName() === 'TPose') { for (const ch of a.listChannels()) ch.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); continue; }
  for (const ch of a.listChannels()) {
    const path = ch.getTargetPath(), node = ch.getTargetNode();
    if (path === 'scale' || (path === 'translation' && !/Hips/.test(node.getName()))) { const s = ch.getSampler(); ch.dispose(); if (s) s.dispose(); }
  }
}
try { await doc.transform(resample()); } catch (e) { console.log('resample skipped:', e.message); }
await doc.transform(prune({ keepAttributes: true }), dedup());
await io.write(`${outDir}/soldier.glb`, doc);
console.log('soldier.glb', statSync(`${outDir}/soldier.glb`).size, 'bytes');
console.log('animations', root.listAnimations().map((a) => `${a.getName()}:${a.listChannels().length}ch`).join(' '));
// 본 길이(cm) 출력
const len = (n) => Math.hypot(...root.listNodes().find((x) => x.getName() === n).getTranslation()).toFixed(2);
for (const n of ['mixamorig:LeftForeArm', 'mixamorig:LeftHand', 'mixamorig:RightForeArm', 'mixamorig:RightHand', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:Spine2', 'mixamorig:LeftArm', 'mixamorig:LeftShoulder'])
  console.log(n, 'offset from parent', root.listNodes().find((x) => x.getName() === n).getTranslation().map((v) => +v.toFixed(2)), 'len', len(n));
