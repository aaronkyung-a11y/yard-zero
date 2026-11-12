# YARD ZERO

모바일용 3D FPS. 항만 일대(컨테이너 야드, 부두, 차량기지)에서 팀원과 함께 단계별 작전을 수행하거나, 생존 모드에서 웨이브를 막는 게임이다.
three.js 0.170.0 번들, 병사 모델, 효과음, 애니메이션을 모두 넣은 단일 HTML 파일로 동작한다.

- 최신 릴리스: `index.html` (현재 v0.6.1, 설치형 PWA)
- 버전별 스냅샷: `versions/yard-zero-v0.x.html`
- 변경 기록과 검증 내용: `CHANGELOG.md`

## 실행

GitHub Pages를 켜면 `https://aaronkyung-a11y.github.io/yard-zero/` 에서 열린다. 터치(가로 화면 권장)와 키보드·마우스를 모두 지원한다.

앱으로 설치:
- Android Chrome: 메뉴의 "앱으로 설치" 버튼 또는 브라우저 메뉴의 "앱 설치"
- iOS Safari: 공유 버튼 → "홈 화면에 추가"

한 번 열면 서비스 워커가 캐시해 오프라인에서도 실행된다. 파일로 직접 열 때는 `versions/`의 스냅샷을 쓴다.
지금 실행 중인 버전은 메뉴 맨 위, 게임 중 점수 아래, 일시정지 화면에 표시된다. 열려 있는 화면보다 새 판이 받아지면 메뉴에 "새 버전 적용" 버튼이 나타난다.

## 빌드

```
npm install
node build.mjs v0.x    # index.html(PWA) + sw.js, dist/index.html, versions/yard-zero-v0.x.html
```

## 구조

- `src/` 게임 코드 (`main.js` 게임 루프·무기·적과 팀원 AI·작전 진행, `episodes.js` 작전과 분대 데이터, `world.js` 맵 3종·충돌·내비게이션, `mocap.js`·`retarget.js` 병사 애니메이션, `audio.js` 효과음, `viewmodel.js` 1인칭 총기, `textures.js` 절차적 텍스처)
- `assets/` 병사 모델, 애니메이션 클립, 효과음 샘플
- `pwa/` PWA 머리말 태그와 서비스 워커 원본, `manifest.webmanifest`, `icons/`
- `tools/` 에셋 가공 스크립트 (모델 경량화, 클립 추출, 효과음 자르기)
- `test/` 헤드리스 Chrome 테스트 스크립트 (Playwright 경로는 작업 환경 기준)

## 에셋 출처

- 병사 모델: three.js 저장소의 `examples/models/gltf/Soldier.glb` (r170)를 경량화
- 애니메이션 클립: Quaternius Universal Animation Library 1·2 (CC0)
- 효과음: opengameart.org의 CC0 녹음. 목록은 `CHANGELOG.md`의 v0.4 "에셋 출처" 참고
- three.js: MIT
