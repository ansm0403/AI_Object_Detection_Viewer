# F8 화면 확인 스크립트

실제 앱을 브라우저로 조작해 항목마다 `PASS` / `FAIL`을 찍는 스크립트다(Playwright). F8의 단계마다 쓰고, 그 단계의
마지막 빌드에서 다시 돌린 것이다. 세션이 바뀌어도 남도록 저장소에 둔다(F7.5의 `../../F7.5/checks/`와 같은 이유).

**이 스크립트는 그 단계 시점의 화면을 기준으로 한다.** 뒤 단계가 화면을 바꾸면 낡는다. 실패가 나오면 앱 문제인지
스크립트가 낡은 것인지부터 가린다(단계 C에서 `b.js`의 두 항목이 그렇게 낡았고, 고쳐서 다시 돌렸다).

| 파일 | 확인하는 것 | 항목 |
|---|---|---|
| `b.js` | 단계 0(좁은 창의 맨 위 줄)과 단계 B(편집 화면에 들어가고 나오기, 집중 보기 / 함께 보기, 그려지는 것, 창 크기 넷, 박스 156개 프레임, 등장 움직임) | 142 |
| `c.js` | 단계 C(이동, 변, 모서리, 회전, 숫자 입력, 끄는 동안 3D 화면과 사진이 따라오는지, 저장, Undo / Redo / Revert, 평가와 검색이 그대로인지, 점이 늦거나 없을 때) | 77 |
| `d.js` | 단계 D("수정됨" 표시가 생기고 사라지는 곳, Evaluate / Explore에는 없는지, 화살표 5cm / Shift 50cm, 이어 누른 화살표가 실행 취소 한 단계인지, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, 한글 입력 상태, 숫자 칸 안에서는 키가 박스로 가지 않는지, 맨 위 줄이 창 폭 18가지에서 한 줄인지, 저장이 거부될 때) | 85 |
| `e.js` | 단계 E(내려받은 `review@3` 파일: 줄, 판정 없는 수정, 화면의 말과 같은 숫자인지, 원본이 nuScenes 파일의 주석과 같은지, CSV의 열, Reset reviews가 수정을 남기는지. 연습 모드: 글자가 "practice label"인지, 답을 보기 전에는 가까움 표가 없는지, 표의 숫자가 데이터에서 계산한 값과 같은지, 표가 좁은 패널에 들어가는지, 맨 위 줄이 창 폭 19가지에서 한 줄인지) | 68 |
| `perf-c2.js` | 끄는 동안의 프레임 시간(통과/실패가 아니라 측정). 화면이 그려질 때마다 포인터를 한 번 움직인다 | |

## 돌리는 방법

1. 배포용 빌드를 **3100번 포트**에 띄운다(3000번은 개발 서버 자리다).

   ```bash
   cd apps/ai_detection_viewer_client
   npx next build --webpack
   npx next start -p 3100
   ```

   빌드가 `next-env.d.ts`를 바꾸면 되돌린다(`git checkout -- next-env.d.ts`).

2. 저장소 루트에서 돌린다. 첫 인자는 저장소 루트(`playwright`를 그 `node_modules`에서 찾는다), 둘째 인자는 캡처와 결과를
   쓸 폴더다(저장소 밖을 준다).

   ```bash
   node docs/plan-feature/assets/F8/checks/b.js "$(pwd)" /tmp/f8-checks
   node docs/plan-feature/assets/F8/checks/c.js "$(pwd)" /tmp/f8-checks
   node docs/plan-feature/assets/F8/checks/d.js "$(pwd)" /tmp/f8-checks
   node docs/plan-feature/assets/F8/checks/e.js "$(pwd)" /tmp/f8-checks
   ```

   마지막 줄이 `c: 77 / 77 passed` 모양이면 통과다.

3. 측정은 렌더링 방식, 장면, 프레임 번호를 준다.

   ```bash
   node docs/plan-feature/assets/F8/checks/perf-c2.js "$(pwd)" gpu scene-0061 20          # 박스 156개, 실제 GPU
   node docs/plan-feature/assets/F8/checks/perf-c2.js "$(pwd)" swiftshader scene-0916 9   # 박스 72개, 소프트웨어 렌더링
   ```

4. 끝나면 3100번 서버를 끈다.

## 알아 둘 것

- 확인 스크립트는 GPU 없이 소프트웨어로 그린다(`--use-angle=swiftshader`). 같은 화면을 두 번 찍으면 같은 그림이 나오는 대신
  느리다. 시간에 관한 숫자는 `perf-c2.js`를 `gpu`로 돌려 본다.
- 스크립트마다 새 브라우저를 띄우므로 사용자의 브라우저에 저장된 판정과 수정은 건드리지 않는다.
- 스크립트는 "움직임 줄이기"를 켠 채로 돈다(등장 움직임을 기다리지 않게). 움직임 자체는 `b.js`의 마지막 부분이 켜고 확인한다.
- 스크립트가 통과해도 캡처를 눈으로 본다.
