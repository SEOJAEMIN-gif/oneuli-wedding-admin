# 오늘의웨딩 · 관리자 (독립 사이트)

메인 사이트(`oneuli-wedding`)와 **같은 Supabase**에 연결되는 별도의 관리자 사이트예요.
여기서 자리를 등록/수정하면 **메인 사이트에 바로 반영**됩니다.

핵심: 이 관리자 사이트는 메인 사이트와 **DB(Supabase)만 공유**하고,
주소(URL)는 완전히 따로예요. → 방문자는 관리자 주소를 알 수 없어 더 안전합니다.

---

## ✅ 준비 전 체크
메인 사이트(`oneuli-wedding`)를 이미 배포해서 Supabase가 만들어져 있어야 해요.
그때 쓴 **Project URL**과 **Legacy anon 키(`eyJ...`)** 를 그대로 재사용합니다.
(새 Supabase 만들 필요 ❌ — 같은 걸 써야 데이터가 연결돼요!)

---

## A. GitHub — 관리자용 새 저장소
1. GitHub에서 **새 저장소** 만들기 (예: `oneuli-wedding-admin`)
2. 이 폴더 전체를 업로드 (메인이랑 **다른 저장소**로!)

## B. Vercel — 관리자용 새 프로젝트
1. vercel.com → **Add New → Project** → 방금 만든 `oneuli-wedding-admin` 저장소 **Import**
2. **Deploy 누르기 전에** Environment Variables 2개 입력
   (메인 사이트에 넣었던 것과 **똑같은 값**):

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | 메인이랑 같은 Project URL |
   | `VITE_SUPABASE_ANON_KEY` | 메인이랑 같은 **Legacy anon 키** (`eyJ...`) |

3. **Deploy** → 1~2분 뒤 **관리자 전용 주소** 완성 ✨
   (예: `oneuli-wedding-admin.vercel.app` — 이 주소를 북마크!)

## C. 로그인
- 관리자 계정은 메인 배포 때 만든 그 계정을 그대로 사용해요.
  (아직 없다면 Supabase → **Authentication → Users → Add user → Create new user**,
   **Auto Confirm User 체크**)
- 관리자 주소 접속 → 그 이메일/비번으로 로그인

---

## 🔗 (선택) "메인 사이트 ↗" 버튼 연결
관리자 화면 우측 상단의 **메인 사이트 ↗** 버튼이 실제 메인 사이트로 열리게 하려면:
- `src/App.jsx` 맨 위 `const PUBLIC_SITE_URL = "";` 에 메인 사이트 주소를 넣어주세요.
  예: `const PUBLIC_SITE_URL = "https://oneuli-wedding.vercel.app";`

---

## ✅ 쓰는 법
- **자리 관리**: 자리 등록/수정/삭제, 사진 업로드, **여러 날짜/시간** 등록, 상태 변경
- **문의**: 접수된 문의 확인/삭제
- **설정**: 구글폼 링크 입력 → 메인 사이트의 문의 버튼이 그 폼으로 연결

여기서 저장하면 메인 사이트 새로고침 시 바로 반영돼요! 💐
