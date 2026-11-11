// 단일 HTML 빌드: three.js + 게임 코드를 하나로 묶어 템플릿에 인라인한다.
// 사용: node build.mjs [버전]   예) node build.mjs v0.1  → dist/index.html, versions/yard-zero-v0.1.html, index.html(PWA), sw.js
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const version = process.argv[2];
const out = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  write: false,
  legalComments: 'none',
  loader: { '.glb': 'base64', '.jpg': 'dataurl', '.mp3': 'base64' },
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync('src/index.template.html', 'utf8');
const marker = '/*__BUNDLE__*/';
const i = tpl.indexOf(marker);
if (i < 0) throw new Error('bundle marker not found');
const full = tpl.slice(0, i) + js + tpl.slice(i + marker.length);
// PWA 태그는 웹에 올리는 루트 index.html에만 넣는다. 아티팩트·스냅샷에는 넣지 않는다(매니페스트·서비스 워커 파일이 없으므로)
const pwaMarker = '<!--__PWA__-->\n';
if (!full.includes(pwaMarker)) throw new Error('pwa marker not found');
const html = full.replace(pwaMarker, () => '');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
if (version) {
  mkdirSync('versions', { recursive: true });
  writeFileSync(`versions/yard-zero-${version}.html`, html);
  // 저장소 루트: GitHub Pages로 서비스되는 설치형(PWA) 판
  writeFileSync('index.html', full.replace(pwaMarker, () => readFileSync('pwa/head.html', 'utf8')));
  writeFileSync('sw.js', readFileSync('pwa/sw.js', 'utf8').replace('__VERSION__', version));
}
console.log(`built ${(html.length / 1024).toFixed(0)} KB${version ? ' → versions/yard-zero-' + version + '.html' : ''}`);
