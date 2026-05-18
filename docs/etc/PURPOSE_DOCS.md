# 문서 체계 정리 — Documentation System

이 문서는 프로젝트에서 운영 중인 문서들의 **역할·성격·수정 권한·관계**를 한 곳에 모은 메타 문서다.
새로운 문서를 추가할지 판단할 때, 또는 기존 문서를 어디까지 손대도 되는지 헷갈릴 때 참고한다.

작성 계기: Step 6 진행 중 "PROJECT_DESIGN.md를 수정해도 되는가" 논의에서, 문서마다 성격이
다르다는 사실이 명확해진 시점. 이후 같은 혼란을 다시 겪지 않기 위해 정리해 둔다.

## 0. 해당 문서 작성 시 의식한 판단

Section 1 구성

* 9개 문서를 5개 그룹으로 묶음: 정본(4) / 보조(2) / 개인용(1) / 예정(1) / 아카이브(3)
* docs/etc/ 의 PREV/KOREAN 백업 파일들도 발견해서 "아카이브" 항목으로 분리 — 작업 시 읽지 않아도 됨을 명시
* docs/learning/ 는 이미 자체 README가 있어서 운영 규칙은 거기로 위임

Section 2 구성

* 도입 권장 2개만 (POST_MVP.md, CHANGELOG.md) — 둘 다 MVP 완료 후 시점 명시
* 도입하지 말 것을 7개 명시적으로 적음. 막연히 "이런 것도 있다"가 아니라 "왜 이 프로젝트에서는 도입 X인가" 이유를 한 줄씩
* 마지막에 "같은 정보가 두 군데 있게 되면 도입하지 않는다"는 단일 원칙으로 압축

> 부록의 빠른 의사결정 가이드 — 이 메타 문서를 매번 정독하기보다 "어떤 상황에서 어디를 봐야 하는가"만 빠르게 찾을 수 있게 표 한 개로 정리

---

## 1. 현재 사용 중인 문서들

문서는 역할에 따라 네 그룹으로 나뉜다.

```
[항상 로드]    CLAUDE.md
                  │ routes to all
                  ▼
[Spec 삼각형]   PROJECT_DESIGN.md  ─┐
                                    ├─ seeded → architecture.md ─┐
                                    └─ seeded → mvp-checklist.md ─┘
                                                  ▲       ▲
                                                  │       │
[읽기 보조]     domain-glossary.md ───────────────┘       │
                Edge_#N.md ────────────────────────────────┘

[개인용]        docs/learning/
[예정]          README.md (Step 10)
[아카이브]      docs/etc/PREV_*, KOREAN.md 등
```

---

### 1-1. 정본 문서 (Spec)

#### CLAUDE.md

| 항목 | 내용 |
|---|---|
| 목적 | Claude(AI 보조)가 매 세션 자동 로드하여 따라야 할 규칙·정책·진입점 인덱스. 프로젝트 전반의 "헌법" 역할. |
| 성격 | 항상 로드, 지속 갱신 (규칙·정책·라우팅 정보 변경 시) |
| 사용 시점 | 모든 세션 시작 시 자동 로드. Immutable Rule 추가, Workflow Rule 변경, Testing Policy 변경, 새 문서 도입 시 수정. |
| 수정 주체 | **사람이 직접.** 규칙은 사람의 의도를 반영. Claude는 사람 승인 시에만 수정. |
| 문서 관계 | Reference Documents 섹션이 다른 모든 문서로 라우팅. 이 파일이 바뀌면 추가/제거된 reference 대상 문서의 실재성과 일관성을 함께 확인. |

#### docs/PROJECT_DESIGN.md

| 항목 | 내용 |
|---|---|
| 목적 | 프로젝트 시작 시점의 원본 비전·동기·기술 선택 근거·제약 조건을 보존. "왜 이런 모습이어야 하는가"의 영구 기준점. |
| 성격 | **READ-ONLY (historical record).** 한 번 작성된 후 수정 금지. |
| 사용 시점 | (a) 사용자 의도 명확화, (b) 문서 간 충돌 해결, (c) 새 기능이 프로젝트 목적에 맞는지 판단할 때만 읽음. 일상 구현 작업에서는 안 읽음. |
| 수정 주체 | **없음.** 변경이 필요한 정보를 발견했다면 그것은 이 문서를 고치라는 신호가 아니라 architecture.md 또는 mvp-checklist.md에 새 정보를 반영해야 한다는 신호다. |
| 문서 관계 | architecture.md와 mvp-checklist.md의 초기 seed. 두 문서가 변해도 이 문서는 그대로여야 비교 기준이 유지됨. CLAUDE.md "Reference Documents"에서 (a)(b)(c) 조건과 함께 안내됨. |

#### .claude/docs/architecture.md

| 항목 | 내용 |
|---|---|
| 목적 | "현재 무엇이 어떻게 구현되어 있는가"의 구조 spec. 데이터 모델·폴더 구조·데이터 흐름·컴포넌트 계약·validation 규칙·테스트 경계의 정본. |
| 성격 | 지속 갱신 (Step별). "현재 상태"의 단일 진실 공급원. |
| 사용 시점 | 구조 변경 또는 multi-file 작업 시 먼저 읽음. /step-complete 시 갱신. 새 컴포넌트나 새 레이어 추가 시 즉시 반영. |
| 수정 주체 | Claude (구현 결과 반영). 사람도 직접 수정 가능. 둘 다 가능하지만 일관성 깨질 수 있으므로 한 PR/세션에서 한쪽만 권장. |
| 문서 관계 | mvp-checklist의 Step별 결정이 누적되어 이 문서가 됨. Current Status 라인이 mvp-checklist의 ✅ 마킹과 일치해야 함. PROJECT_DESIGN.md의 "왜"와 짝을 이루는 "어떻게". |

#### .claude/docs/mvp-checklist.md

| 항목 | 내용 |
|---|---|
| 목적 | Step별 진행 상태 + Done when 기준 + 테스트 항목 + 구현 결정 로그. "이 Step에서 무엇을 했고 왜 그렇게 했는가"의 history. |
| 성격 | 지속 갱신 (Step별). 한 번 작성된 Step 항목은 원칙적으로 다시 안 건드림 (history 보존). |
| 사용 시점 | 사용자가 "Step N" 언급 시 읽음. Step 시작 전 Done when 확인, Step 완료 시 (/step-complete) 갱신. |
| 수정 주체 | Claude. 사람은 Done when 기준이나 다음 Step 계획 수정 시. |
| 문서 관계 | architecture.md(현재 spec)와 Edge_#N.md(엣지케이스 history) 양쪽으로 cross-reference. 이 문서의 Step별 Implementation notes가 결국 architecture.md로 통합됨. |

---

### 1-2. 보조 문서 (Reading Aids)

#### .claude/docs/domain-glossary.md

| 항목 | 내용 |
|---|---|
| 목적 | AI/3D 도메인 용어 정의 (사용자가 처음 접하는 영역). Object Detection, bounding box, point cloud, raycaster, OrbitControls 등. |
| 성격 | 거의 안 바뀜 (참조용). 새 용어 등장 시에만 추가. |
| 사용 시점 | 도메인 개념을 사용자에게 설명할 때 먼저 읽음. 새 도메인 개념이 코드에 등장하면 보강. |
| 수정 주체 | Claude (새 용어 등장 시 추가). 사람도 정의 정확성 검수 후 수정. |
| 문서 관계 | CLAUDE.md "User Context"의 "New to" 항목과 연결. architecture.md/mvp-checklist에서 사용된 용어를 보조 설명. |

#### docs/edgecases/Edge_#N.md (N = Step 번호)

| 항목 | 내용 |
|---|---|
| 목적 | Step별 엣지케이스 발견 → 근본원인 → 해결 또는 이월 결정의 상세 history. "왜 코드가 지금처럼 짜였는가"의 디테일. |
| 성격 | Step별 신규 생성. 한 번 작성 후 거의 안 바뀜 (history 보존). |
| 사용 시점 | 해당 Step 시작 전 — 특히 이전 Step에서 "defer to Step N"으로 미뤄진 항목 확인. /edgecase-review 후 작성. |
| 수정 주체 | Claude (Step 종료 시점에 작성). |
| 문서 관계 | mvp-checklist.md의 각 Step 항목에서 reference. 일부 결정 근거가 architecture.md로 옮겨갈 수 있음 (예: 카메라 위치 결정). 이월된 항목은 다음 Step의 사전 숙지 대상. |

---

### 1-3. 사용자 개인용

#### docs/learning/ (step-XX-*.md)

| 항목 | 내용 |
|---|---|
| 목적 | 본인을 위한 학습 저널. 3D/AI가 처음이라 "이때 내가 무엇을 이해했는가"를 Step 단위 스냅샷으로 박제. |
| 성격 | 부패 허용(decay-tolerated). 정본이 아님. 한국어 canonical. |
| 사용 시점 | Step 종료 후 그 시점의 자기 이해 기록. 코드가 바뀌어도 옛 Step 파일은 안 건드림. |
| 수정 주체 | 사람(본인). Claude는 작성 보조만. |
| 문서 관계 | 정본(architecture.md, mvp-checklist 등)과 별개. 정본이 바뀌어도 여기는 그대로 둠. 운영 규칙은 [docs/learning/README.md](../learning/README.md)에 명시. |

---

### 1-4. 향후 정본 (예정)

#### README.md (프로젝트 루트)

| 항목 | 내용 |
|---|---|
| 목적 | 포트폴리오 평가자·면접관·일반 방문자가 처음 보는 진입점. 프로젝트 소개, 기술 스택, 실행 방법, 데모 URL, 알려진 제약(특히 3D는 추정값임). |
| 성격 | Step 10에서 작성 예정. 작성 후 안정. 기능 추가 시에만 갱신. |
| 사용 시점 | Step 10 (README & Deployment). 작성 후에는 외부 독자를 위한 단일 진입점. |
| 수정 주체 | 사람(포트폴리오 메시지가 사람의 의도). Claude는 초안 도움. |
| 문서 관계 | PROJECT_DESIGN의 §15 "포트폴리오 어필 포인트"가 기초 재료. architecture.md의 기술 결정 요약을 일부 인용. mvp-checklist는 인용하지 않음 (외부 독자 대상 아님). |

---

### 1-5. 아카이브 (참조 불필요)

`docs/etc/` 의 다음 파일들은 historical backup이며 현재 운영 문서가 아니다. 새 작업에서 읽을 필요 없음.

| 파일 | 성격 |
|---|---|
| `PREV_CLAUDE.md`, `PREV_CLAUDE_MD_KOREAN.md` | 이전 버전 CLAUDE.md 백업 |
| `KOREAN.md` | 영어 canonical 도입 전 한국어 버전 백업 |
| `EDGECASE_REVIEW_KO.md` | edgecase-review skill의 한국어 사본 |

정리 권장: 한 번 git 히스토리에 보존된 이상 working tree에 둘 이유는 적음. 정리 시점은
Step 9 UI Cleanup 또는 Step 10 README 작성 시점이 자연스러움.

---

## 2. 현재 다루지 않지만 도입을 고려할 만한 문서 유형

### 2-1. 진지하게 고려할 만한 후보

#### POST_MVP.md (또는 ROADMAP.md)

- **어떤 문서인지**: MVP 완성 후 확장 계획. KITTI 연동, Nest.js 백엔드, 프레임 자동 재생 등 우선순위별 추가 기능 목록.
- **언제 필요해지는가**: MVP 완료 후 추가 기능을 실제로 검토하기 시작할 때. PROJECT_DESIGN §14에 이미 있지만 PROJECT_DESIGN은 READ-ONLY라 새 결정(우선순위 변경, 항목 추가/제거)을 기록할 수 없음.
- **현재 도입 시점**: **Step 10 완료 직후**. PROJECT_DESIGN §14를 seed로 복사해 와서 living document로 만들면 됨. MVP 완료 전에는 만들지 말 것 (집중력 분산).

#### CHANGELOG.md

- **어떤 문서인지**: 버전별 변경사항 누적 로그. Keep a Changelog 포맷이 표준.
- **언제 필요해지는가**: 릴리스 버전 관리 시작 시점. 또는 사용자/사용처가 여럿이라 "어떤 버전을 쓰고 있나"를 추적해야 할 때.
- **현재 도입 시점**: **MVP 완료 후 v1.0.0 태그를 찍는 시점**. 그 전까지는 git log + mvp-checklist Step history로 충분. 포트폴리오 프로젝트는 의미 있는 v0.1/v0.2 등을 찍지 않으면 CHANGELOG가 빈 껍데기가 됨.

### 2-2. 도입하지 않는 게 더 좋다고 판단되는 유형

| 유형 | 이유 |
|---|---|
| **ADR (Architecture Decision Records)** — 결정마다 별도 파일 | 이미 Edge_#N.md(엣지케이스 결정)와 mvp-checklist Implementation notes(구현 결정)가 ADR의 역할을 분담함. 추가 형식화는 중복 + 유지 부담만 늘림. **도입 X.** |
| **CONTRIBUTING.md** — 외부 기여자 가이드 | 솔로 프로젝트. 외부 기여자 받을 계획 없음. **도입 X.** |
| **ONBOARDING.md** — 새 팀원 온보딩 | 솔로 프로젝트. **도입 X.** |
| **TESTING.md** — 테스트 전략 단일 문서 | CLAUDE.md "Testing Policy" + architecture.md "Testing Boundaries" + PROJECT_DESIGN §17 "테스트 전략" + mvp-checklist Step별 Tests에 이미 분산되어 있음. 통합 문서를 새로 만들면 4중 동기화 부담. **도입 X.** |
| **STYLE_GUIDE.md / CODING_CONVENTIONS.md** | 솔로 프로젝트 + TypeScript/ESLint/Prettier가 기계적으로 강제. CLAUDE.md의 짧은 Commit Convention으로 충분. **도입 X.** |
| **SECURITY.md** | 클라이언트 only 포트폴리오. 백엔드·인증 없음. **도입 X.** (백엔드 확장 시점에 재검토.) |
| **API.md** | 백엔드 없음. **도입 X.** (Nest.js 확장 시점에 재검토.) |
| **Storybook / 컴포넌트 카탈로그** | UI 테스트가 MVP scope 밖이라는 결정과 일관됨. 컴포넌트 수도 적음. **도입 X.** |

### 2-3. 도입 판단 일반 원칙

> **"같은 정보가 두 군데 있게 되면 도입하지 않는다."**

새 문서를 도입할지 망설일 때 기준:

1. 그 정보를 담을 곳이 정말 없는가? (이미 분산되어 있다면 통합 비용 > 유지 비용)
2. 갱신 주체와 시점이 명확한가? (Claude가 매 Step 갱신할지, 사람이 가끔 갱신할지)
3. 이 문서를 만들면 기존 문서 어느 부분을 비워야 하는가? (단순 추가는 중복)
4. 솔로 프로젝트 규모를 넘는 협업 문서인가? (CONTRIBUTING 등은 그렇다)

위 4개 중 하나라도 "아니오"가 나오면 도입 보류.

---

## 부록: 빠른 의사결정 가이드

| 상황 | 어디를 본다 / 어디에 적는다 |
|---|---|
| 새 세션 시작 | CLAUDE.md (자동 로드) |
| "Step N 시작" | mvp-checklist.md → 해당 Step Edge_#(N-1).md의 deferred 항목 → architecture.md |
| 새 기능이 프로젝트 의도에 맞나? | docs/PROJECT_DESIGN.md (읽기만) |
| 도메인 용어 처음 만남 | domain-glossary.md |
| 새 엣지케이스 발견 | 현재 Step의 Edge_#N.md (없으면 신규 생성) |
| 구조 변경 결정 | architecture.md 갱신 + mvp-checklist 현재 Step Implementation notes에 한 줄 |
| "왜 코드가 이렇게 됐지?" 조사 | mvp-checklist Implementation notes → 링크된 Edge_#N.md |
| 내가 무엇을 이해했는지 기록 | docs/learning/step-XX-*.md (개인용) |
| 외부에 프로젝트 소개 | (예정) README.md |

