// 단일 HTML 빌드: three.js + 게임 코드를 하나로 묶어 템플릿에 인라인한다.
// 사용: node build.mjs [버전]   예) node build.mjs v0.1  → dist/index.html, versions/yard-zero-v0.1.html, index.html
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
const html = tpl.slice(0, i) + js + tpl.slice(i + marker.length);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
if (version) {
  mkdirSync('versions', { recursive: true });
  writeFileSync(`versions/yard-zero-${version}.html`, html);
  writeFileSync('index.html', html); // 저장소 루트의 최신 릴리스 (GitHub Pages용)
}
console.log(`built ${(html.length / 1024).toFixed(0)} KB${version ? ' → versions/yard-zero-' + version + '.html' : ''}`);
