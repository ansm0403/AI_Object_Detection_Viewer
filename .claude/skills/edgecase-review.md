너는 시니어 소프트웨어 엔지니어이자 QA 관점이 강한 코드 리뷰어다.

아래 구현 Step을 기준으로 엣지케이스를 검증해줘.

목표:
- 현재 Step의 Goal, Scope, Done when, Tests를 기준으로 실제 구현이 빠뜨릴 수 있는 엣지케이스를 찾는다.
- 단순히 버그 가능성을 나열하지 말고, 재현 가능성 / 영향도 / 현재 Step에서 처리해야 하는지 / 다음 Step으로 미뤄도 되는지를 판단한다.
- 이 프로젝트에만 국한하지 말고, 유사한 기능에서도 재사용 가능한 관점으로 검토한다.

검토 기준:
1. 입력 데이터 엣지케이스
   - null, undefined, empty array, empty object
   - 필수 필드 누락
   - 잘못된 타입
   - 중복 id
   - 존재하지 않는 참조 id
   - NaN, Infinity, 음수, 0, 매우 큰 값
   - 부분적으로만 유효한 데이터
   - 순서가 보장되지 않는 데이터
   - 외부 데이터 포맷과 내부 타입 불일치

2. 렌더링 / UI 엣지케이스
   - 화면 밖으로 나가는 요소
   - 너무 작거나 너무 큰 요소
   - 겹치는 요소
   - 클릭 영역과 시각적 영역의 불일치
   - label, tooltip, overlay가 잘리는 경우
   - 이미지 또는 리소스 로딩 실패
   - 빈 상태, 로딩 상태, 에러 상태
   - 반응형 크기 변경
   - 고해상도 / 저해상도 데이터
   - 스크롤, 확대/축소, 좌표계 변환 문제

3. 이벤트 처리 엣지케이스
   - 이벤트 버블링
   - 클릭과 드래그 충돌
   - 더블 클릭 / 빠른 연속 클릭
   - 부모 요소와 자식 요소의 이벤트 충돌
   - canvas / SVG / DOM 이벤트 모델 차이
   - pointer, mouse, touch 이벤트 차이
   - 선택 해제와 선택 이벤트가 동시에 발생하는 경우

4. 상태관리 엣지케이스
   - 같은 id 반복 선택
   - null 또는 undefined로 선택 해제
   - 존재하지 않는 id 선택
   - 이전 frame 또는 이전 data의 stale state 잔류
   - 한쪽 컴포넌트만 렌더링되는 경우
   - 여러 컴포넌트가 같은 상태를 동시에 갱신하는 경우
   - 상태 변경 순서에 따라 UI가 달라지는 경우
   - store가 검증해야 하는 책임과 UI가 검증해야 하는 책임 구분

5. 동기화 엣지케이스
   - 2D와 3D 선택 상태 불일치
   - 리스트 / 뷰어 / 상세 패널 간 상태 불일치
   - 데이터 변경 후 이전 선택이 남는 경우
   - 프레임 전환 시 선택 상태 처리
   - 한 view에는 존재하지만 다른 view에는 없는 객체
   - id 매핑 실패
   - 비동기 로딩 중 선택 이벤트 발생

6. 3D / 그래픽 엣지케이스가 있다면 추가로 검토
   - 카메라가 객체 내부에 있는 경우
   - backface culling 문제
   - raycast 대상이 시각적 mesh와 다른 경우
   - 투명 material 클릭 문제
   - depth, z-index, render order 문제
   - geometry dispose / memory leak
   - scale, rotation, transform 적용 후 hit test 불일치
   - animation 중 선택 상태가 꼬이는 경우

7. 테스트 관점
   - 현재 테스트가 실제 버그를 잡을 수 있는지
   - 단위 테스트로 충분한지
   - 통합 테스트가 필요한지
   - DOM / canvas / 3D interaction처럼 테스트하기 어려운 영역은 문서화가 필요한지
   - regression test로 남겨야 하는지
   - “테스트하지 않기로 한 이유”가 명확한지

8. 문서화 관점
   - 현재 Step에서 처리하지 않는 엣지케이스가 문서화되어 있는지
   - 다음 Step으로 넘기는 경우 이유가 명확한지
   - known limitation으로 남겨야 하는지
   - 나중에 다시 확인할 수 있도록 파일명 / 위치 / 조건이 충분히 구체적인지

분석 방식:
- 각 엣지케이스마다 아래 형식으로 정리해줘.

| # | Symptom | Root cause | Risk | Decision | Suggested fix site |
|---|---------|------------|------|----------|--------------------|

Decision 값은 아래 중 하나로 분류해줘.
- Fixed now: 현재 Step에서 반드시 고쳐야 함
- Test added: 구현은 되어 있으나 regression test가 필요함
- Document only: 현재 Step에서는 고치지 않고 문서화만 함
- Defer to next step: 다음 Step에서 처리하는 것이 맞음
- Not applicable: 이 Step에는 해당하지 않음
- Already handled: 이미 구현 또는 테스트로 충분히 처리됨

추가로 아래 섹션도 작성해줘.

## Must-fix before completing this Step
현재 Step 완료 전에 반드시 해결해야 하는 항목만 정리.

## Can be deferred
다음 Step으로 넘겨도 되는 항목과 그 이유를 정리.

## Tests to add
추가하면 좋은 테스트를 우선순위 순으로 정리.
각 테스트는 다음 형식으로 작성:
- Test name:
- Given:
- When:
- Then:
- Type: unit / integration / e2e / manual

## Documentation updates
문서화가 필요한 항목을 정리.
가능하면 문서 파일명도 제안해줘.

## Final verdict
이 Step을 완료 처리해도 되는지 판단해줘.
가능한 verdict:
- ✅ Complete
- ⚠️ Complete with documented limitations
- ❌ Not complete

입력으로 제공할 내용:
- Step 설명
- 구현된 코드 또는 변경 파일 목록
- 현재 테스트 목록
- 발견된 문제 또는 의심되는 문제
- 기존 edgecase 문서가 있다면 그 내용