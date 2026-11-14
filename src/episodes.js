// 작전(에피소드) 데이터. 엔진은 main.js의 "작전 진행" 부분.
// 단계 type: sweep(적 무리를 차례로 소탕) / reach(지점 도달) / hold(구역에서 버티기) / plant(여러 지점에 폭약 설치)
// 이벤트: { say: [말하는 이, 문장] } { join: 팀원, at } { leave: 팀원, to } { hold: 팀원, at } { follow: 팀원 } { overwatch: 지점 | 'tower' | false }
// on.start / on.end: 단계 시작·끝, on.t: [[초, [이벤트...]]...], on.planted: { 설치 개수: [이벤트...] }

// 분대원. dmg·rof·burst·acc·range: 사격 성능, mat: 군복 색
export const SQUAD = {
  han: { id: 'han', name: '한 중사', short: '한', hp: 220, dmg: [15, 21], rof: 0.11, burst: [3, 5], acc: 1, range: 55, snd: 'shotAR', rate: 0.96, mat: 'ally' },
  seo: { id: 'seo', name: '서 하사', short: '서', hp: 200, dmg: [13, 19], rof: 0.1, burst: [4, 6], acc: 0.9, range: 45, snd: 'shotAR', rate: 1.05, mat: 'ally2' },
  oh: { id: 'oh', name: '오 상병', short: '오', hp: 170, dmg: [85, 120], rof: 1.7, burst: [1, 1], acc: 1.25, range: 95, snd: 'shotDMR', rate: 0.94, mat: 'ally' },
};

export const EPISODES = [
  {
    id: 'ep1', title: '침투', map: 'yard', env: 'dawn', level: 1, loadout: ['ar', 'pistol'], squad: '단독',
    brief: '새벽, 혼자 야드에 들어가 창고 2층을 확보한다. 끝날 무렵 브라보 팀이 도착한다.',
    stages: [
      { type: 'sweep', text: '야드의 정찰조 제거', groups: [['rifle', 'rifle', 'rifle'], ['rifle', 'rifle', 'rusher', 'rusher']], supply: true,
        on: { start: [{ say: ['본부', '야드 안에 적 정찰조가 있다. 정리하고 동쪽 창고로 가라.'] }], end: [{ say: ['본부', '정찰조 제거 확인. 보급을 받고 이동하라.'] }] } },
      { type: 'reach', text: '창고 2층 관측 지점으로 이동', at: { x: 45.5, z: 0, r: 3.4, y: 3.5 }, guards: [[50, -3, 'rifle'], [57, 6, 'rifle'], [56, -11, 'rusher']],
        on: { start: [{ say: ['본부', '창고 2층 창에서 야드 전체가 보인다. 양쪽 끝 계단으로 올라가라.'] }] } },
      { type: 'hold', text: '증원이 올 때까지 2층 사수', at: { x: 45.5, z: 0, r: 14, y: 3.5 }, time: 60, keep: 4, every: 2.2, types: ['rifle', 'rifle', 'rusher', 'rifle', 'heavy'],
        from: [{ x: 18, z: 0, r: 14 }, { x: 30, z: -19, r: 8 }, { x: 28, z: 19, r: 8 }],
        on: { start: [{ say: ['본부', '적이 창고로 몰려온다. 브라보 팀이 오고 있다. 버텨라.'] }],
          t: [[22, [{ say: ['본부', '브라보가 정문을 통과했다. 조금만 더.'] }]], [44, [{ join: 'han', at: { x: 0, z: 28 } }, { join: 'seo', at: { x: 2.5, z: 28.5 } }, { say: ['han', '브라보 원, 야드 진입. 창고 앞으로 붙는다.'] }]]],
          end: [{ say: ['han', '합류 완료. 다음 작전부터는 같이 움직인다.'] }] } },
    ],
  },
  {
    id: 'ep2', title: '부두', map: 'dock', env: 'overcast', level: 2, loadout: ['ar', 'shotgun', 'pistol'], squad: '한 중사 · 서 하사',
    brief: '비 오는 부두. 브라보 팀과 함께 보급 컨테이너를 폭파한다. 도중에 팀이 갈라진다.',
    stages: [
      { type: 'reach', text: '브라보와 함께 중앙 크레인까지 전진', at: { x: 0, z: -15, r: 4.5 }, guards: [[-30, -12, 'rifle'], [-22, -17, 'rifle'], [-12.5, 6.3, 'rusher'], [-5, -8, 'rifle'], [9, -18, 'rifle']],
        on: { start: [{ join: 'han', at: { x: -57, z: 23 } }, { join: 'seo', at: { x: -52.5, z: 23.5 } }, { say: ['han', '부두다. 크레인 다리와 방호벽을 엄폐물로 써라.'] }] } },
      { type: 'plant', text: '보급 컨테이너 3곳에 폭약 설치', sites: [{ x: -27, z: 6.3 }, { x: 6, z: 12.8 }, { x: 33, z: 6.3 }], supply: true,
        from: [{ x: 44, z: 21, r: 8 }, { x: -40, z: -12, r: 8 }, { x: 52, z: -14, r: 6 }], trickle: { keep: 2, every: 4, types: ['rifle', 'rusher'] },
        groups: [['rifle', 'rifle', 'rusher'], ['heavy', 'rifle', 'rusher'], []],
        on: { start: [{ say: ['seo', '컨테이너 통로 세 곳에 표시해 뒀다. 가까이 서 있으면 설치된다.'] }],
          planted: { 2: [{ say: ['seo', '윽, 다리에 맞았다!'] }, { leave: 'seo', to: { x: -56, z: 17 } }, { say: ['han', '서 하사는 초소로 빠져라. 마지막 하나는 우리가 맡는다.'] }] } } },
      { type: 'hold', text: '폭파까지 크레인 아래에서 엄호', at: { x: 0, z: -15, r: 13 }, time: 40, keep: 4, every: 2, types: ['rifle', 'rusher', 'rifle', 'heavy'], boom: 0.6,
        from: [{ x: 44, z: 21, r: 8 }, { x: -40, z: 8, r: 8 }, { x: 52, z: -14, r: 6 }],
        on: { start: [{ say: ['han', '타이머 사십 초. 중앙 크레인 아래에서 버틴다.'] }], end: [{ say: ['han', '폭파!'] }] } },
      { type: 'reach', text: '동쪽 게이트로 이탈', at: { x: 58.5, z: 20, r: 3.6 }, guards: [[44, 21, 'rifle'], [50, 12.8, 'rusher'], [54, -12, 'sniper']], trickle: { keep: 3, every: 3, types: ['rifle', 'rusher'] },
        on: { start: [{ say: ['han', '나는 서 하사를 데리고 서쪽으로 빠진다. 너는 동쪽 게이트로 가라.'] }, { leave: 'han', to: { x: -56, z: 17 } }], end: [{ say: ['본부', '수고했다. 차량기지에서 다시 집결한다.'] }] } },
    ],
  },
  {
    id: 'ep3', title: '차량기지', map: 'depot', env: 'night', level: 3, loadout: ['ar', 'dmr', 'pistol'], squad: '오 상병(감시탑) · 한 중사',
    brief: '밤의 차량기지. 오 상병이 감시탑에서 엄호하고, 한 중사가 뒤늦게 합류한다. 유류 탱크를 폭파하고 빠져나온다.',
    stages: [
      { type: 'reach', text: '정비고까지 이동', at: { x: -33.5, z: 23.5, r: 3.6 }, guards: [[-14, 25, 'rifle'], [-25, 8, 'rifle'], [-29, 12, 'rusher']],
        on: { start: [{ say: ['본부', '오 상병이 감시탑으로 올라가는 중이다. 남서쪽 정비고에서 기다려라.'] }] } },
      { type: 'sweep', text: '기지 경비 병력 제거', groups: [['rifle', 'rifle', 'rusher'], ['rifle', 'heavy', 'rusher'], ['rifle', 'rifle', 'sniper']], supply: true,
        on: { start: [{ overwatch: 'tower' }, { say: ['oh', '감시탑 확보. 위에서 엄호한다.'] }],
          t: [[24, [{ join: 'han', at: { x: 0, z: 32 } }, { say: ['han', '늦었다. 정문으로 들어간다.'] }]]] } },
      { type: 'plant', text: '유류 탱크 2곳에 폭약 설치', sites: [{ x: 30, z: -10 }, { x: 37, z: -10 }], groups: [['rusher', 'rusher', 'rifle'], []], trickle: { keep: 3, every: 3, types: ['rifle', 'rusher', 'rifle', 'heavy'] },
        on: { start: [{ say: ['han', '북동쪽 유류 탱크다. 내가 뒤를 본다.'] }] } },
      { type: 'reach', text: '폭파 전에 정문으로 탈출', at: { x: 0, z: 32, r: 4 }, fuse: 28, trickle: { keep: 3, every: 2.5, types: ['rifle', 'rusher', 'heavy'] },
        on: { start: [{ overwatch: false }, { say: ['oh', '탄이 떨어졌다. 탑에서 내려간다. 정문에서 보자.'] }, { say: ['han', '삼십 초 뒤 폭파다. 뛰어!'] }], end: [{ say: ['han', '전원 이탈. 잘했다.'] }] } },
    ],
  },
  {
    id: 'ep4', title: '야드 탈환', map: 'yard', env: 'night', level: 4, loadout: ['ar', 'shotgun', 'dmr', 'pistol'], squad: '한 중사 · 서 하사 · 오 상병(크레인)',
    brief: '밤의 야드로 돌아간다. 캐노피에서 버티다 팀이 차례로 합류하고, 창고 2층에서 마지막 공세를 막는다.',
    start: { x: -30, z: 26.5, yaw: -2.2 },
    stages: [
      { type: 'hold', text: '브라보가 올 때까지 캐노피에서 버티기', at: { x: -30, z: 24.7, r: 9 }, time: 45, keep: 4, every: 2.4, types: ['rifle', 'rusher', 'rifle', 'rusher', 'heavy'],
        on: { start: [{ say: ['본부', '야드를 되찾는다. 브라보가 올 때까지 캐노피 아래에서 버텨라.'] }] } },
      { type: 'sweep', text: '브라보와 함께 야드 소탕', groups: [['rifle', 'rifle', 'rusher', 'rusher'], ['heavy', 'rifle', 'rifle', 'sniper'], ['heavy', 'heavy', 'rusher', 'rusher']], supply: true,
        on: { start: [{ join: 'han', at: { x: 0, z: 28 } }, { join: 'seo', at: { x: 2.5, z: 28.5 } }, { say: ['seo', '서 하사 복귀. 다리는 멀쩡하다.'] }, { say: ['han', '세 명이면 충분하다. 밀어낸다.'] }] } },
      { type: 'reach', text: '창고로 들어가 2층 확보', at: { x: 45.5, z: 0, r: 3.4, y: 3.5 }, guards: [[52, 0, 'rifle'], [60, -8, 'rusher'], [57, 9, 'heavy']],
        on: { start: [{ say: ['han', '서 하사는 출입구를 지켜라. 나는 따라간다.'] }, { hold: 'seo', at: { x: 39.5, z: -8 } }] } },
      { type: 'hold', text: '2층에서 마지막 공세 막기', at: { x: 45.5, z: 0, r: 14, y: 3.5 }, time: 75, keep: 5, every: 1.9, types: ['rifle', 'rusher', 'heavy', 'rifle', 'sniper', 'rusher'],
        from: [{ x: 18, z: 0, r: 14 }, { x: 30, z: -19, r: 8 }, { x: 28, z: 19, r: 8 }],
        on: { start: [{ overwatch: { x: 22, y: 13.95, z: 3 } }, { say: ['oh', '크레인 위다. 야드 쪽을 엄호한다.'] }],
          t: [[50, [{ say: ['본부', '적 주력이 무너지고 있다. 조금만 더.'] }]]],
          end: [{ follow: 'seo' }, { say: ['seo', '출입구 이상 무.'] }, { say: ['본부', '야드 탈환 완료. 전원 수고했다.'] }] } },
    ],
  },
];

// 협동 임무(네트워크 전용, 1~4명). 엔진은 main.js의 "협동 임무" 부분. 방장의 폰이 진행을 계산한다.
// 단계 type:
//   reach  살아 있는 전원이 지점에 모인다 (fuse: 그 초 뒤에 앞 단계의 폭약이 터진다)
//   plant  지점마다 가까이 서 있으면 진행된다. 여러 명이 서로 다른 지점을 동시에 할 수 있다 (secs: 걸리는 초, label: 진행 중 문구, minSites: 지점 수를 사람 수 + 1로 줄이되 이 값 이상)
//   guard  앞 단계에서 설치한 폭약을 time초 동안 지킨다. 적이 폭약 곁(3.2m)에 붙어 있고 6m 안에 아무도 없는 시간이 8초 쌓이면 해제된다. 해제된 폭약은 다시 설치해야 시간이 줄어든다
//   carry  items의 물건(kind: crate 화물 / pilot 조종사)에 차례로 다가가 집고 to까지 옮긴다. 옮기는 사람은 달릴 수 없고 느려진다. 쓰러지면 그 자리에 놓인다
//   hold   구역에 한 명이라도 있으면 시간이 줄어든다
// 공통: guards [[x, z, 종류]...] 시작할 때 서 있는 적, groups [종류...] 시작할 때 몰려오는 적, trickle 계속 채워지는 적, from 적이 나오는 곳, supply 끝나면 보급 선택, say 무전
export const MISSIONS = [
  {
    id: 'm1', title: '폭파조', map: 'yard', env: 'dawn', level: 2, loadout: ['ar', 'shotgun', 'pistol'],
    brief: '야드 곳곳에 폭약을 설치하고, 터질 때까지 적이 해제하지 못하게 지킨 뒤 정문으로 빠져나온다. 폭약이 서로 멀어 흩어져야 한다.',
    stages: [
      { type: 'plant', text: '표시된 지점에 폭약 설치', sites: [{ x: 14, z: -22 }, { x: 36, z: 16 }, { x: -30, z: 14 }], minSites: 2, supply: true,
        guards: [[-26, 8, 'rifle'], [10, -16, 'rifle'], [18, -24, 'rusher'], [32, 10, 'rifle'], [40, 20, 'rusher']], trickle: { keep: 2, every: 4, types: ['rifle', 'rusher'] },
        say: { start: '표시한 곳에 폭약을 설치하라. 가까이 서 있으면 설치된다. 나눠서 하면 빠르다.', end: '모두 설치됐다. 보급을 받고 폭약을 지켜라.' } },
      { type: 'guard', text: '폭파까지 폭약 지키기', time: 40, keep: 3, every: 2.4, types: ['rifle', 'rusher', 'rifle', 'heavy', 'rusher'], boom: 30,
        say: { start: '적이 폭약을 해제하러 온다. 폭약에 붙은 적을 놔두면 팔 초 만에 해제된다. 사십 초만 버텨라.', end: '시한장치가 돌기 시작했다. 삼십 초 뒤 폭파다. 정문으로 나와라.' } },
      { type: 'reach', text: '폭파 전에 정문으로 이탈', at: { x: 0, z: 27, r: 6 }, trickle: { keep: 3, every: 2.5, types: ['rifle', 'rusher', 'heavy'] },
        say: { end: '전원 이탈 확인. 수고했다.' } },
    ],
  },
  {
    id: 'm2', title: '화물 회수', map: 'dock', env: 'overcast', level: 3, loadout: ['ar', 'dmr', 'pistol'],
    brief: '비 오는 부두에서 화물 상자 두 개를 서쪽 초소까지 옮긴다. 상자를 든 사람은 느려지니 나머지가 길을 열고 엄호해야 한다.',
    stages: [
      { type: 'reach', text: '중앙 크레인 아래에 집결', at: { x: 0, z: -15, r: 6 }, guards: [[-30, -12, 'rifle'], [-22, -17, 'rifle'], [-12.5, 6.3, 'rusher'], [-5, -8, 'rifle'], [9, -18, 'rifle']], supply: true,
        say: { start: '부두다. 중앙 크레인 아래에 모여라. 화물은 동쪽 컨테이너 통로에 있다.', end: '집결 확인. 보급을 받고 화물을 찾아라.' } },
      { type: 'carry', kind: 'crate', text: '화물 상자 2개를 서쪽 초소로', items: [{ x: 33, z: 6.3 }, { x: 6, z: 12.8 }], to: { x: -54, z: 20, r: 5 },
        guards: [[30, 12, 'rifle'], [38, 0, 'rusher'], [44, -14, 'sniper']], trickle: { keep: 3, every: 3.2, types: ['rifle', 'rusher', 'rifle', 'heavy'] },
        from: [{ x: 44, z: 21, r: 8 }, { x: -40, z: -12, r: 8 }, { x: 52, z: -14, r: 6 }],
        say: { start: '상자는 한 명이 든다. 든 사람은 뛰지 못한다. 나머지는 앞뒤를 맡아라.', end: '상자 두 개 모두 확보했다. 회수정이 올 때까지 초소를 지켜라.' } },
      { type: 'hold', text: '회수정이 올 때까지 초소 사수', at: { x: -54, z: 20, r: 11 }, time: 35, keep: 4, every: 2, types: ['rifle', 'rusher', 'rifle', 'heavy'],
        say: { end: '회수정 도착. 화물 인계 완료.' } },
    ],
  },
  {
    id: 'm3', title: '구출', map: 'depot', env: 'night', level: 3, loadout: ['ar', 'shotgun', 'dmr', 'pistol'],
    brief: '밤의 차량기지 정비고에 붙잡힌 조종사를 풀어 주고, 북쪽 하역장까지 부축해 데려간 뒤 차량이 올 때까지 버틴다.',
    stages: [
      { type: 'reach', text: '남서쪽 정비고로 이동', at: { x: -33.5, z: 23.5, r: 6 }, guards: [[-14, 25, 'rifle'], [-25, 8, 'rifle'], [-29, 12, 'rusher'], [-36, 16, 'rifle']],
        say: { start: '조종사는 남서쪽 정비고에 갇혀 있다. 조용히 접근할 수는 없다. 뚫고 들어가라.' } },
      { type: 'plant', text: '정비고 문 잠금 해제', sites: [{ x: -33.5, z: 23.5 }], secs: 6, label: '잠금 해제 중', groups: ['rifle', 'rusher', 'rusher'], trickle: { keep: 3, every: 3, types: ['rifle', 'rusher'] }, supply: true,
        say: { start: '문 앞에 서 있으면 잠금이 풀린다. 그동안 나머지는 막아라.', end: '문이 열렸다. 조종사는 다리를 다쳤다. 누군가 부축해야 한다.' } },
      { type: 'carry', kind: 'pilot', text: '조종사를 북쪽 하역장까지 부축', items: [{ x: -33.5, z: 23.5 }], to: { x: 0, z: -22, r: 5 }, trickle: { keep: 3, every: 2.8, types: ['rifle', 'rusher', 'rifle', 'heavy', 'sniper'] },
        say: { start: '부축하는 사람은 뛰지 못한다. 북쪽 하역장까지 데려가라.', end: '하역장 도착. 차량이 가는 중이다. 버텨라.' } },
      { type: 'hold', text: '차량이 올 때까지 하역장 사수', at: { x: 0, z: -22, r: 11 }, time: 40, keep: 5, every: 1.9, types: ['rifle', 'rusher', 'heavy', 'rifle', 'rusher'],
        say: { end: '차량 도착. 조종사 인계 완료. 잘했다.' } },
    ],
  },
];
