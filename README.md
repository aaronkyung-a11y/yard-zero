# YARD ZERO

모바일용 3D FPS. 컨테이너 야드와 창고에서 웨이브로 몰려오는 적을 막는 게임이다.
three.js 0.170.0 번들, 병사 모델, 효과음, 애니메이션을 모두 넣은 단일 HTML 파일로 동작한다.

- 최신 릴리스: `index.html` (현재 v0.4)
- 버전별 스냅샷: `versions/yard-zero-v0.x.html`
- 변경 기록과 검증 내용: `CHANGELOG.md`

## 실행

`index.html`을 브라우저로 연다. 터치(가로 화면 권장)와 키보드·마우스를 모두 지원한다.

## 빌드

```
npm install
node build.mjs v0.x    # dist/index.html, versions/yard-zero-v0.x.html, index.html
```

## 구조

- `src/` 게임 코드 (`main.js` 게임 루프·무기·적 AI, `world.js` 맵·충돌·내비게이션, `mocap.js`·`retarget.js` 병사 애니메이션, `audio.js` 효과음, `viewmodel.js` 1인칭 총기, `textures.js` 절차적 텍스처)
- `assets/` 병사 모델, 애니메이션 클립, 효과음 샘플
- `tools/` 에셋 가공 스크립트 (모델 경량화, 클립 추출, 효과음 자르기)
- `test/` 헤드리스 Chrome 테스트 스크립트 (Playwright 경로는 작업 환경 기준)

## 에셋 출처

- 병사 모델: three.js 저장소의 `examples/models/gltf/Soldier.glb` (r170)를 경량화
- 애니메이션 클립: Quaternius Universal Animation Library 1·2 (CC0)
- 효과음: opengameart.org의 CC0 녹음. 목록은 `CHANGELOG.md`의 v0.4 "에셋 출처" 참고
- three.js: MIT
