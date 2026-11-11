// PWA 아이콘 생성: 컨테이너 더미 위의 조준선 (직접 그린 도형)
// 사용: node tools/make-icons.mjs  → icons/*.png
import sharp from '/opt/npm-tools/node_modules/sharp/dist/index.mjs';
import { mkdirSync } from 'node:fs';
const art = `
  <g>
    <rect x="96" y="318" width="150" height="86" fill="#8c2f1f"/>
    <rect x="266" y="318" width="150" height="86" fill="#1f4e79"/>
    <rect x="181" y="222" width="150" height="86" fill="#b5651d"/>
    <g stroke="#000" stroke-opacity=".22" stroke-width="6">
      ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${116 + i * 22} 318v86M${286 + i * 22} 318v86M${201 + i * 22} 222v86"/>`).join('')}
    </g>
    <rect x="86" y="404" width="340" height="12" fill="#23282b"/>
  </g>
  <g fill="none" stroke="#ffb23a" stroke-width="20" stroke-linecap="butt">
    <circle cx="256" cy="256" r="150"/>
    <path d="M256 66v84M256 362v84M66 256h84M362 256h84"/>
  </g>
  <circle cx="256" cy="256" r="13" fill="#ffb23a"/>`;
const svg = (bg, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg}${inner}</svg>`);
const rounded = svg('<rect width="512" height="512" rx="104" fill="#101416"/>', art);
const square = svg('<rect width="512" height="512" fill="#101416"/>', art);
const maskable = svg('<rect width="512" height="512" fill="#101416"/>', `<g transform="translate(64 64) scale(0.75)">${art}</g>`); // 가운데 80% 안전 영역 안에 그림
mkdirSync('icons', { recursive: true });
await sharp(rounded).resize(192, 192).png().toFile('icons/icon-192.png');
await sharp(rounded).png().toFile('icons/icon-512.png');
await sharp(maskable).png().toFile('icons/icon-maskable-512.png');
await sharp(square).resize(180, 180).flatten({ background: '#101416' }).png().toFile('icons/apple-touch-icon.png');
console.log('icons written');
