// 애니메이션 팩에서 필요한 클립과 뼈대만 남긴 GLB를 만든다 (메시·재질·텍스처 제거)
// 사용: node tools/make-anims.mjs <입력.glb> <출력.glb> <클립 이름...>
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { statSync } from 'node:fs';
const [inPath, outPath, ...keep] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(inPath);
const root = doc.getRoot();
for (const a of root.listAnimations()) {
  const drop = !keep.includes(a.getName());
  for (const ch of a.listChannels()) {
    const path = ch.getTargetPath(), node = ch.getTargetNode(), nm = node ? node.getName() : '';
    if (drop || path === 'scale' || (path === 'translation' && !/hips|pelvis|^root$/i.test(nm))) { const s = ch.getSampler(); ch.dispose(); if (s && !s.listParents().some((p) => p !== a && p.propertyType === 'AnimationChannel')) s.dispose(); }
  }
  if (drop) a.dispose();
}
for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const m of root.listMeshes()) m.dispose();
for (const s of root.listSkins()) s.dispose();
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();
try { await doc.transform(resample()); } catch (e) { console.log('resample skipped:', e.message); }
await doc.transform(prune({ keepLeaves: true }), dedup());
await io.write(outPath, doc);
console.log(outPath, statSync(outPath).size, 'bytes;', root.listAnimations().map((a) => `${a.getName()}:${a.listChannels().length}ch`).join(' '), '; nodes', root.listNodes().length);
