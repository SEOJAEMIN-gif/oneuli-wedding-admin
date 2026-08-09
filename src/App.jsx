import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import * as db from "./supabase";
import Login from "./Login";

/* ============================================================
   오늘의웨딩 · 관리자 (독립 사이트)
   - 메인 사이트와 같은 Supabase에 연결됨 (여기서 등록하면 메인에 반영)
   - 로그인 후: 자리 관리 / 문의 / 설정(구글폼)
   ============================================================ */

// (선택) 메인 사이트 주소 — 넣어두면 "메인 사이트 ↗" 버튼이 새 탭으로 열려요.
const PUBLIC_SITE_URL = "";

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

const won = (n) => Number(n || 0).toLocaleString("ko-KR");
const priceText = (s) => `${won(s.price_min)}만~${won(s.price_max)}만원`;
const dateParts = (iso) => { const p = (iso || "").split("-"); return { m: +p[1] || 0, d: +p[2] || 0 }; };
const weekdayOf = (iso) => ["일", "월", "화", "수", "목", "금", "토"][new Date(iso).getDay()] || "";
const dday = (iso) => {
  const n = Math.round((new Date(iso) - new Date()) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? "D-DAY" : "지남";
};
const STATUS = { 예약가능: "ok", 문의중: "wait", 마감: "closed" };
const STATUS_LIST = ["예약가능", "문의중", "마감"];

// 한 업체의 여러 날짜/시간을 표준화해서 반환 (구버전 단일 date/time도 호환)
const venueTimes = (s) => {
  if (Array.isArray(s.times) && s.times.length) {
    return s.times.filter((t) => t && t.date);
  }
  if (s.date) return [{ date: s.date, time: s.time || "", status: s.status || "예약가능" }];
  return [];
};
// 가장 가까운(예약가능 우선) 날짜
const primaryTime = (s) => {
  const ts = venueTimes(s);
  if (!ts.length) return null;
  const sorted = [...ts].sort((a, b) => new Date(a.date) - new Date(b.date));
  return sorted.find((t) => t.status === "예약가능") || sorted[0];
};
// 업체 대표 상태 (하나라도 예약가능이면 예약가능)
const venueStatus = (s) => {
  const ts = venueTimes(s);
  if (ts.some((t) => t.status === "예약가능")) return "예약가능";
  if (ts.some((t) => t.status === "문의중")) return "문의중";
  return ts.length ? "마감" : (s.status || "예약가능");
};

const emptySlot = () => ({ id: uid(), venue: "", region: "", district: "", times: [{ date: "", time: "", status: "예약가능" }], price_min: "", price_max: "", cap: "", hall: "", parking: "", meal: "", status: "예약가능", kind: "chapel", desc: "", photos: [] });

function SlotModal({ slot, urlMap, onSave, onClose }) {
  // 구버전(단일 date) → times 배열로 정규화
  const initTimes = (Array.isArray(slot.times) && slot.times.length)
    ? slot.times
    : (slot.date ? [{ date: slot.date, time: slot.time || "", status: slot.status || "예약가능" }] : [{ date: "", time: "", status: "예약가능" }]);
  const [s, setS] = useState({ ...emptySlot(), ...slot, times: initTimes, photos: slot.photos || [] });
  const [busy, setBusy] = useState(false);
  const [localUrls, setLocalUrls] = useState({});
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const urlFor = (path) => localUrls[path] || urlMap[path];

  // 날짜 행 조작
  const setTime = (i, k, v) => setS((p) => ({ ...p, times: p.times.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));
  const addTime = () => setS((p) => ({ ...p, times: [...p.times, { date: "", time: "", status: "예약가능" }] }));
  const removeTime = (i) => setS((p) => ({ ...p, times: p.times.length > 1 ? p.times.filter((_, idx) => idx !== i) : p.times }));

  const addPhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if ((s.photos || []).length >= 4) { alert("사진은 최대 4장까지예요."); return; }
    setBusy(true);
    try {
      const path = await db.uploadPhoto(s.id, f);
      const map = await db.signedUrlMap([path]);
      setLocalUrls((p) => ({ ...p, ...map }));
      setS((p) => ({ ...p, photos: [...(p.photos || []), path] }));
    } catch (err) { alert("사진 업로드 실패: " + (err.message || err)); }
    setBusy(false); e.target.value = "";
  };
  const removePhoto = async (path) => {
    try { await db.deletePhoto(path); } catch (e) {}
    setS((p) => ({ ...p, photos: (p.photos || []).filter((x) => x !== path) }));
  };
  const save = () => {
    const times = (s.times || []).filter((t) => t.date);
    if (!s.venue || times.length === 0) { alert("식장명과 예식일(최소 1개)은 필수예요."); return; }
    const first = [...times].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    // 구버전 호환 필드도 같이 저장 (첫 날짜 기준)
    onSave({ ...s, times, date: first.date, time: first.time, status: first.status,
      price_min: +s.price_min || 0, price_max: +s.price_max || 0 });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="amodal" onClick={(e) => e.stopPropagation()}>
        <div className="amodal-head">
          <b>{slot.venue ? "자리 수정" : "예약 가능 자리 등록"}</b>
          <button className="xbtn" onClick={onClose}>✕</button>
        </div>
        <div className="amodal-body">
          <div className="photos">
            {(s.photos || []).map((path) => (
              <div className="photo-item" key={path}>
                <img src={urlFor(path)} alt="" /><button className="photo-del" onClick={() => removePhoto(path)}>✕</button>
              </div>
            ))}
            {(s.photos || []).length < 4 && (
              <label className="photo-add">{busy ? "…" : "＋"}<span>사진</span><input type="file" accept="image/*" onChange={addPhoto} hidden /></label>
            )}
          </div>
          <p className="ahint">사진을 올리면 무료 이미지 대신 이 사진이 노출돼요. (최대 4장)</p>

          <div className="fgrid">
            <label>식장명 *<input value={s.venue} onChange={(e) => set("venue", e.target.value)} placeholder="그랜드 발렌시아" /></label>
            <label>홀 종류<select value={s.kind} onChange={(e) => set("kind", e.target.value)}><option value="chapel">채플</option><option value="garden">가든/하우스</option><option value="ballroom">볼룸/컨벤션</option></select></label>
            <label>지역<input value={s.region} onChange={(e) => set("region", e.target.value)} placeholder="서울 강남" /></label>
            <label>세부 지역<input value={s.district} onChange={(e) => set("district", e.target.value)} placeholder="청담" /></label>
            <label>최소가(만원)<input type="number" value={s.price_min} onChange={(e) => set("price_min", e.target.value)} placeholder="3000" /></label>
            <label>최대가(만원)<input type="number" value={s.price_max} onChange={(e) => set("price_max", e.target.value)} placeholder="4000" /></label>
            <label>수용 인원<input value={s.cap} onChange={(e) => set("cap", e.target.value)} placeholder="300~400명" /></label>
            <label>홀 타입<input value={s.hall} onChange={(e) => set("hall", e.target.value)} placeholder="채플 · 단독홀" /></label>
            <label>주차<input value={s.parking} onChange={(e) => set("parking", e.target.value)} placeholder="발렛 가능" /></label>
            <label>식사<input value={s.meal} onChange={(e) => set("meal", e.target.value)} placeholder="코스/뷔페" /></label>
            <label className="full">소개<textarea rows={3} value={s.desc} onChange={(e) => set("desc", e.target.value)} placeholder="식장 소개..." /></label>
          </div>

          {/* 예약 가능 날짜 (여러 개) */}
          <div className="times-box">
            <div className="times-head">
              <span>예약 가능 날짜 *</span>
              <button className="add-time" onClick={addTime}>+ 날짜 추가</button>
            </div>
            {s.times.map((t, i) => (
              <div className="time-row" key={i}>
                <input type="date" value={t.date} onChange={(e) => setTime(i, "date", e.target.value)} />
                <input value={t.time} onChange={(e) => setTime(i, "time", e.target.value)} placeholder="오후 2시" />
                <select value={t.status} onChange={(e) => setTime(i, "status", e.target.value)}>{STATUS_LIST.map((x) => <option key={x}>{x}</option>)}</select>
                <button className="time-del" onClick={() => removeTime(i)} disabled={s.times.length <= 1} title="삭제">✕</button>
              </div>
            ))}
            <p className="ahint">같은 식장에 여러 날짜가 나오면 “+ 날짜 추가”로 계속 등록하세요.</p>
          </div>
        </div>
        <div className="amodal-foot">
          <button className="ghost" onClick={onClose}>취소</button>
          <button className="ask-main sm" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 관리자 ---------- */
function Admin({ slots, inquiries, urlMap, formUrl, onBack, onLogout, onSaveSlot, onDelSlot, onDelInquiry, onSaveForm, refresh }) {
  const [tab, setTab] = useState("slots");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(formUrl || "");
  useEffect(() => setForm(formUrl || ""), [formUrl]);

  return (
    <>
      <header className="nav nav-admin">
        <div className="logo">오늘의웨딩 <span className="adm">관리자</span></div>
        <nav className="nav-links">
          <button className="link" onClick={onBack}>메인 사이트 ↗</button>
          <button className="link" onClick={onLogout}>로그아웃</button>
        </nav>
      </header>

      <div className="admin">
        <div className="atabs">
          <button className={tab === "slots" ? "on" : ""} onClick={() => setTab("slots")}>자리 관리 ({slots.filter((x) => !x._demo).length})</button>
          <button className={tab === "inq" ? "on" : ""} onClick={() => setTab("inq")}>문의 ({inquiries.length})</button>
          <button className={tab === "set" ? "on" : ""} onClick={() => setTab("set")}>설정</button>
        </div>

        {tab === "slots" && (
          <>
            <div className="admin-head"><h2>예약 가능 자리</h2><button className="ask-main sm" onClick={() => setEditing(emptySlot())}>+ 자리 등록</button></div>
            {slots.some((x) => x._demo) && <div className="demo-note">지금 보이는 건 예시 데이터예요. ‘자리 등록’으로 실제 자리를 추가하면 예시는 사라집니다.</div>}
            <div className="admin-table">
              <div className="arow ahead"><span>식장</span><span>예약 날짜</span><span>가격</span><span>인원</span><span>상태</span><span></span></div>
              {slots.map((s) => {
                const ts = venueTimes(s); const pt = primaryTime(s);
                return (
                <div className="arow" key={s.id}>
                  <span className="a-venue">{s.venue}</span>
                  <span>{pt ? `${(pt.date || "").replaceAll("-", ".")} (${weekdayOf(pt.date)})` : "-"}{ts.length > 1 && <em className="cnt-tag">외 {ts.length - 1}</em>}</span>
                  <span>{priceText(s)}</span>
                  <span>{s.cap}</span>
                  <span className={`status status-${STATUS[venueStatus(s)]}`}>{venueStatus(s)}</span>
                  <span className="a-act">
                    {s._demo ? <em className="demo-tag">예시</em> : <>
                      <button onClick={() => setEditing(s)}>수정</button>
                      <button onClick={() => { if (confirm(`${s.venue} 삭제할까요?`)) onDelSlot(s); }}>삭제</button>
                    </>}
                  </span>
                </div>
              );})}
            </div>
          </>
        )}

        {tab === "inq" && (
          <>
            <div className="admin-head"><h2>접수된 문의</h2></div>
            <p className="ahint" style={{ marginBottom: 16 }}>홈페이지 하단 ‘상담 문의’ 폼으로 들어온 문의예요.</p>
            {inquiries.length === 0 ? <div className="empty">아직 접수된 문의가 없어요.</div> : (
              <div className="inq-list">
                {inquiries.map((q) => (
                  <div className="inq-card" key={q.id}>
                    <div className="inq-card-head">
                      <div className="inq-who"><b>{q.name || "이름 없음"}</b><a href={`tel:${q.phone}`} className="inq-phone">{q.phone}</a></div>
                      <span className="inq-date">{(q.created_at || "").slice(0, 10)}</span>
                    </div>
                    <div className="inq-fields">
                      <span><em>희망 지역</em>{q.region || "-"}</span>
                      <span><em>예상 인원</em>{q.guests || "-"}</span>
                      <span><em>예산</em>{q.budget || "-"}</span>
                      <span><em>희망 날짜</em>{q.wish_date || "-"}</span>
                    </div>
                    {q.message && <div className="inq-msg2">{q.message}</div>}
                    <button className="inq-del" onClick={() => { if (confirm("삭제할까요?")) onDelInquiry(q.id); }}>삭제</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "set" && (
          <>
            <div className="admin-head"><h2>설정</h2></div>
            <div className="setting-box">
              <label className="set-label">구글폼 링크 (문의/상담 신청 버튼 연결)</label>
              <p className="ahint">‘상담 신청’, ‘문의하기’, ‘희망 내용 작성하기’ 버튼이 이 주소로 열려요.</p>
              <div className="set-row">
                <input value={form} onChange={(e) => setForm(e.target.value)} placeholder="https://forms.gle/..." />
                <button className="ask-main sm" onClick={() => { onSaveForm(form.trim()); alert("저장했어요!"); }}>저장</button>
              </div>
            </div>
          </>
        )}
      </div>

      {editing && (
        <SlotModal slot={editing} urlMap={urlMap}
          onSave={async (s) => { await onSaveSlot(s); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}
    </>
  );
}


/* ================= 메인 (로그인 게이트 + 데이터) ================= */
export default function App() {
  const [slots, setSlots] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [settings, setSettings] = useState({});
  const [urlMap, setUrlMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(null);

  const formUrl = settings.google_form || "";

  const refresh = async () => {
    try {
      const [sl, st] = await Promise.all([db.loadSlots(), db.loadSettings()]);
      setSlots(sl);
      setSettings(st);
      const paths = sl.flatMap((s) => s.photos || []);
      setUrlMap(await db.signedUrlMap(paths));
    } catch (e) { /* 로그인 전이거나 설정 전 */ }
    setLoading(false);
  };

  const loadInq = async () => { try { setInquiries(await db.loadInquiries()); } catch (e) {} };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const on = !!data.session; setAuthed(on);
      if (on) { refresh(); loadInq(); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const on = !!s; setAuthed(on);
      if (on) { refresh(); loadInq(); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const saveSlot = async (s) => {
    try {
      const clean = { ...s }; delete clean._demo;
      const saved = await db.upsertSlot(clean);
      const map = await db.signedUrlMap(saved.photos || []);
      setUrlMap((p) => ({ ...p, ...map }));
      await refresh();
    } catch (e) { alert("저장 실패: " + (e.message || e)); }
  };
  const delSlot = async (s) => {
    try { for (const p of s.photos || []) await db.deletePhoto(p); await db.deleteSlot(s.id); await refresh(); }
    catch (e) { alert("삭제 실패: " + (e.message || e)); }
  };
  const delInquiry = async (id) => { try { await db.deleteInquiry(id); await loadInq(); } catch (e) {} };
  const saveForm = async (v) => { try { await db.saveSetting("google_form", v); setSettings((p) => ({ ...p, google_form: v })); } catch (e) { alert("저장 실패: " + (e.message || e)); } };

  const goMain = () => PUBLIC_SITE_URL ? window.open(PUBLIC_SITE_URL, "_blank") : alert("메인 사이트 주소를 코드 상단 PUBLIC_SITE_URL 에 넣어주세요.");

  if (authed === null) return <div className="boot"><Style />불러오는 중…</div>;
  if (!authed) return <div><Style /><Login onOk={() => { setAuthed(true); refresh(); loadInq(); }} onBack={goMain} /></div>;
  if (loading) return <div className="boot"><Style />불러오는 중…</div>;

  return (
    <div className="root"><Style />
      <Admin slots={slots} inquiries={inquiries} urlMap={urlMap} formUrl={formUrl}
        onBack={goMain}
        onLogout={async () => { await supabase.auth.signOut(); setAuthed(false); }}
        onSaveSlot={saveSlot} onDelSlot={delSlot} onDelInquiry={delInquiry} onSaveForm={saveForm} refresh={refresh} />
    </div>
  );
}


function Style() {
  return (
    <style>{`
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
    @import url('https://fonts.googleapis.com/css2?family=Hahmlet:wght@400;500;600;700&display=swap');
    :root{
      --bg:#ffffff; --bg2:#fff5f8; --ink:#3a2f34; --ink2:#8a7a80; --ink3:#c2b2b8;
      --rose:#e35b86; --rose-deep:#c93f6e; --gold:#c9a86a; --blush:#ffe1ea; --line:#f4e3e8;
      --ok:#8fa886; --wait:#c9a86a; --closed:#b3aab0;
    }
    *{box-sizing:border-box}
    .root{font-family:'Pretendard',system-ui,sans-serif; color:var(--ink); background:var(--bg); min-height:100vh}
    button{font-family:inherit; cursor:pointer}
    .boot{padding:80px; text-align:center; color:var(--ink2); font-family:'Pretendard',sans-serif}
    .empty{padding:60px; text-align:center; color:var(--ink2)}
    .err-bar{margin:0 40px; margin-top:14px; padding:12px 16px; border-radius:12px; font-size:13px; background:#fdf0ee; border:1px solid #f3d9d5; color:#b06e7a}

    .nav{display:flex; align-items:center; justify-content:space-between; padding:20px 44px; border-bottom:1px solid var(--line); background:rgba(255,252,251,.92); backdrop-filter:blur(8px); position:sticky; top:0; z-index:20}
    .logo{font-family:'Hahmlet',serif; font-weight:700; font-size:23px; letter-spacing:.5px; color:var(--ink)}
    .logo-em{color:var(--rose-deep)}
    .logo .adm{font-family:'Pretendard'; font-size:12px; font-weight:700; letter-spacing:2px; color:var(--gold); margin-left:6px}
    .nav-links{display:flex; align-items:center; gap:18px}
    .link{border:0; background:none; color:var(--ink2); font-size:14px; font-weight:500}
    .link:hover{color:var(--ink)}
    .cta-sm{background:var(--rose); color:#fff; padding:9px 18px; border-radius:100px; font-size:14px; font-weight:600; border:0}
    .cta-sm:hover{background:var(--rose-deep)}

    .hero{max-width:900px; margin:0 auto; padding:82px 40px 58px; text-align:center}
    .hero-live{display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--rose-deep); background:var(--blush); padding:8px 16px; border-radius:100px; margin-bottom:26px}
    .live-dot{width:7px; height:7px; border-radius:50%; background:var(--ok); box-shadow:0 0 0 3px rgba(143,168,134,.25)}
    .hero-title{font-family:'Hahmlet',serif; font-size:44px; font-weight:600; line-height:1.4; letter-spacing:-.5px; margin:0 0 22px}
    .hero-title em{font-style:normal; color:var(--rose-deep)}
    .hero-sub{color:var(--ink2); font-size:16px; line-height:1.85; margin:0 0 32px}
    .hero-cta{border:0; background:var(--rose); color:#fff; padding:15px 32px; border-radius:100px; font-size:16px; font-weight:700; box-shadow:0 8px 22px rgba(201,139,149,.32)}
    .hero-cta:hover{background:var(--rose-deep)}

    .board{max-width:1120px; margin:0 auto; padding:20px 40px 70px}
    .board-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:14px}
    .board-head h2{font-family:'Hahmlet',serif; font-size:27px; font-weight:600; margin:0}
    .filters{display:flex; gap:10px; flex-wrap:wrap}
    .filters select{border:1px solid var(--line); background:#fff; color:var(--ink); padding:11px 16px; border-radius:100px; font-family:inherit; font-size:14px; outline:none; cursor:pointer}
    .filters select:focus{border-color:var(--rose)}
    .filters select.ph{color:var(--ink3); border-color:var(--line)}

    .more-dates{display:inline-block; margin-left:8px; font-size:11px; font-weight:700; color:var(--rose-deep); background:var(--blush); padding:2px 9px; border-radius:100px}

    /* 상세: 날짜 선택 */
    .date-picker{margin:0 0 24px}
    .date-picker-title{font-size:14px; font-weight:700; color:var(--ink); margin-bottom:11px}
    .date-chips{display:flex; gap:10px; flex-wrap:wrap}
    .date-chip{position:relative; border:1.5px solid var(--line); background:#fff; border-radius:14px; padding:11px 16px; cursor:pointer; text-align:center; min-width:92px; transition:.15s; font-family:inherit}
    .date-chip b{display:block; font-family:'Hahmlet',serif; font-size:17px; color:var(--ink); line-height:1.2}
    .date-chip span{display:block; font-size:11.5px; color:var(--ink2); margin-top:3px}
    .date-chip em{display:block; font-style:normal; font-size:10px; font-weight:700; margin-top:4px; color:var(--wait)}
    .date-chip:hover{border-color:var(--rose)}
    .date-chip.on{border-color:var(--rose); background:var(--bg2); box-shadow:0 4px 14px rgba(227,91,134,.16)}
    .date-chip.dc-closed{opacity:.5; cursor:not-allowed}
    .date-chip.dc-closed em{color:var(--closed)}
    .date-chip.dc-wait em{color:var(--wait)}

    /* 관리자: 여러 날짜 입력 */
    .times-box{margin-top:20px; border:1px solid var(--line); border-radius:14px; padding:18px}
    .times-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:12px}
    .times-head span{font-size:13px; font-weight:700; color:var(--ink2)}
    .add-time{border:1px solid var(--rose); background:var(--blush); color:var(--rose-deep); padding:7px 14px; border-radius:100px; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer}
    .add-time:hover{background:var(--rose); color:#fff}
    .time-row{display:grid; grid-template-columns:1.3fr 1fr 1fr auto; gap:8px; margin-bottom:8px; align-items:center}
    .time-row input,.time-row select{border:1px solid var(--line); border-radius:9px; padding:9px 11px; font-family:inherit; font-size:13.5px; color:var(--ink); outline:none; background:#fff}
    .time-row input:focus,.time-row select:focus{border-color:var(--rose)}
    .time-del{border:1px solid var(--line); background:#fff; color:var(--ink2); width:34px; height:34px; border-radius:9px; cursor:pointer; font-size:12px}
    .time-del:hover:not(:disabled){border-color:var(--rose); color:var(--rose-deep)}
    .time-del:disabled{opacity:.35; cursor:not-allowed}

    .cnt-tag{font-style:normal; font-size:11px; font-weight:700; color:var(--rose-deep); background:var(--blush); padding:2px 8px; border-radius:100px; margin-left:7px}

    .inq-list{display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px}
    .inq-card{position:relative; border:1px solid var(--line); border-radius:16px; padding:18px 20px; background:#fff; display:flex; flex-direction:column}
    .inq-card-head{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--line)}
    .inq-who{min-width:0; display:flex; align-items:baseline; flex-wrap:wrap; gap:2px}
    .inq-who b{font-family:'Hahmlet',serif; font-size:17px}
    .inq-phone{color:var(--rose-deep); font-size:13px; font-weight:600; margin-left:10px; text-decoration:none}
    .inq-date{font-size:12px; color:var(--ink3); flex-shrink:0; white-space:nowrap}
    .inq-fields{display:grid; grid-template-columns:1fr 1fr; gap:10px 14px}
    .inq-fields span{display:flex; flex-direction:column; gap:3px; font-size:14px; color:var(--ink)}
    .inq-fields em{font-style:normal; font-size:11px; font-weight:700; color:var(--ink3)}
    .inq-msg2{margin-top:12px; padding-top:12px; border-top:1px solid var(--line); font-size:13.5px; color:var(--ink2); line-height:1.6}
    .inq-del{align-self:flex-end; margin-top:14px; border:1px solid var(--line); background:#fff; color:var(--ink2); border-radius:100px; padding:6px 14px; font-size:12px; cursor:pointer}
    .inq-del:hover{border-color:var(--rose); color:var(--rose-deep)}

    .slot-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:26px}
    .slot-card{text-align:left; border:1px solid var(--line); background:#fff; border-radius:22px; overflow:hidden; padding:0; transition:.2s}
    .slot-card:hover{transform:translateY(-5px); box-shadow:0 22px 48px rgba(176,110,122,.16); border-color:var(--blush)}
    .slot-photo{position:relative; aspect-ratio:16/11; overflow:hidden}
    .art{position:absolute; inset:0; width:100%; height:100%; object-fit:cover}
    img.art{background:var(--bg2)}
    .slot-photo-name{position:absolute; left:16px; bottom:14px; color:#fff; font-family:'Hahmlet',serif; font-size:17px; font-weight:600; z-index:2; text-shadow:0 1px 10px rgba(0,0,0,.4)}
    .datechip{position:absolute; top:14px; left:14px; z-index:2; background:rgba(255,255,255,.96); border-radius:14px; padding:8px 13px; text-align:center; box-shadow:0 6px 16px rgba(176,110,122,.18)}
    .dc-md{display:block; font-family:'Hahmlet',serif; font-size:20px; font-weight:700; color:var(--ink); line-height:1}
    .dc-wd{display:block; font-size:11px; color:var(--rose-deep); font-weight:700; margin-top:3px}
    .datechip.big{position:static; padding:16px; margin-bottom:16px; box-shadow:none}
    .datechip.big .dc-md{font-size:32px}
    .datechip.big .dc-wd{font-size:13px}
    .status{position:absolute; top:16px; right:14px; z-index:2; font-size:12px; font-weight:700; padding:5px 12px; border-radius:100px}
    .status-ok{background:rgba(143,168,134,.95); color:#fff}
    .status-wait{background:rgba(201,168,106,.95); color:#fff}
    .status-closed{background:rgba(179,170,176,.9); color:#fff}
    .status.big{position:static; display:inline-block; margin-bottom:14px}
    .slot-info{padding:17px 19px 21px}
    .slot-row1{display:flex; align-items:center; justify-content:space-between}
    .slot-venue{font-family:'Hahmlet',serif; font-weight:600; font-size:18px}
    .dday{font-size:12px; font-weight:700; color:var(--rose-deep); background:var(--blush); padding:3px 10px; border-radius:100px}
    .slot-when{color:var(--ink2); font-size:14px; margin-top:7px}
    .slot-price{margin-top:12px; font-size:17px; font-weight:800; color:var(--ink)}
    .slot-price em{font-style:normal; font-size:11px; font-weight:500; color:var(--ink3); margin-left:4px}
    .slot-tags{display:flex; gap:7px; margin-top:12px; flex-wrap:wrap}
    .slot-tags span{font-size:11.5px; color:var(--ink2); background:var(--bg2); border:1px solid var(--line); padding:4px 11px; border-radius:100px}

    .detail{max-width:1120px; margin:0 auto; padding:40px; display:grid; grid-template-columns:1fr 320px; gap:44px; align-items:start}
    .gallery-main{position:relative; aspect-ratio:16/10; border-radius:20px; overflow:hidden; margin-bottom:12px; background:var(--bg2)}
    .thumbs{display:flex; gap:10px}
    .thumb{position:relative; flex:1; aspect-ratio:4/3; border-radius:12px; border:2px solid transparent; overflow:hidden; padding:0; opacity:.65; transition:.15s; background:var(--bg2)}
    .thumb.on{opacity:1; border-color:var(--rose)}
    .detail-body{margin-top:34px}
    .detail-venue{font-family:'Hahmlet',serif; font-size:34px; font-weight:600; margin:0 0 6px}
    .detail-loc{color:var(--ink2); font-size:15px; margin:0 0 18px}
    .detail-desc{font-size:16px; line-height:1.9; color:#4d4149; margin:0 0 28px; white-space:pre-line}
    .spec{border:1px solid var(--line); border-radius:16px; overflow:hidden}
    .spec-row{display:grid; grid-template-columns:120px 1fr; padding:15px 20px; border-bottom:1px solid var(--line); font-size:15px}
    .spec-row:last-child{border-bottom:0}
    .spec-row span{color:var(--ink2)}
    .spec-price em{font-style:normal; font-size:12px; color:var(--ink3); font-weight:500; margin-left:6px}
    .ask-box{position:sticky; top:104px; border:1px solid var(--line); border-radius:20px; padding:26px 24px; text-align:center; background:linear-gradient(180deg,#fff,#fdf6f4); box-shadow:0 14px 36px rgba(176,110,122,.1)}
    .ask-box .datechip.big{background:var(--bg2); border:1px solid var(--line)}
    .ask-price{font-size:24px; font-weight:800; color:var(--ink)}
    .ask-note{font-size:12.5px; color:var(--ink2); margin:6px 0 20px}
    .ask-main{border:0; display:block; width:100%; background:var(--rose); color:#fff; padding:15px; border-radius:100px; font-size:16px; font-weight:700}
    .ask-main:hover{background:var(--rose-deep)}
    .ask-main.sm{width:auto; display:inline-block; padding:11px 20px; font-size:14px}
    .ask-hint{font-size:12.5px; color:var(--ink2); line-height:1.7; margin:14px 0 0}
    .ask-list{list-style:none; padding:18px 0 0; margin:18px 0 0; border-top:1px solid var(--line); font-size:13px; text-align:left; display:flex; flex-direction:column; gap:10px}
    .ask-list li{color:var(--rose-deep); font-weight:500}

    /* 관리자 */
    .nav-admin{background:var(--ink)}
    .nav-admin .logo{color:#fff}
    .nav-admin .link{color:#c9bcc2}
    .admin{max-width:1000px; margin:0 auto; padding:34px 40px}
    .atabs{display:flex; gap:6px; border-bottom:1px solid var(--line); margin-bottom:26px}
    .atabs button{border:0; background:none; padding:12px 18px; font-size:15px; font-weight:600; color:var(--ink2); margin-bottom:-1px}
    .atabs button.on{color:var(--rose-deep); border-bottom:2.5px solid var(--rose)}
    .admin-head{display:flex; justify-content:space-between; align-items:center; margin-bottom:20px}
    .admin-head h2{font-family:'Hahmlet',serif; font-size:24px; font-weight:600; margin:0}
    .demo-note{background:#fdf6ee; border:1px solid #f0e2cf; color:#a8843e; font-size:13px; padding:11px 15px; border-radius:10px; margin-bottom:16px}
    .admin-table{border:1px solid var(--line); border-radius:14px; overflow:hidden}
    .arow{display:grid; grid-template-columns:1.6fr 1.4fr 1.3fr 1fr .9fr 1.1fr; align-items:center; padding:14px 18px; border-bottom:1px solid var(--line); font-size:14px}
    .arow.inq{grid-template-columns:1fr 1.3fr 2fr 1fr .7fr}
    .arow:last-child{border-bottom:0}
    .ahead{background:var(--bg2); font-weight:700; color:var(--ink2); font-size:13px}
    .a-venue{font-weight:600; font-family:'Hahmlet',serif}
    .arow .status{position:static; display:inline-block; width:fit-content}
    .a-act{display:flex; gap:8px}
    .a-act button{border:1px solid var(--line); background:#fff; border-radius:100px; padding:6px 13px; font-size:13px}
    .demo-tag{font-style:normal; font-size:12px; color:var(--ink3)}
    .inq-msg{color:var(--ink2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
    .ahint{font-size:12px; color:var(--ink2); line-height:1.6; margin:8px 0 0}
    .setting-box{border:1px solid var(--line); border-radius:14px; padding:24px}
    .set-label{font-weight:700; font-size:15px}
    .set-row{display:flex; gap:10px; margin-top:14px}
    .set-row input{flex:1; border:1px solid var(--line); border-radius:10px; padding:11px 13px; font-family:inherit; font-size:14px; outline:none}
    .set-row input:focus{border-color:var(--rose)}

    /* 자리 등록 모달 */
    .overlay{position:fixed; inset:0; background:rgba(63,51,58,.5); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:50; padding:20px}
    .amodal{width:min(680px,100%); max-height:92vh; overflow:auto; background:#fff; border-radius:20px}
    .amodal-head{display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-bottom:1px solid var(--line); font-size:17px}
    .amodal-head b{font-family:'Hahmlet',serif}
    .xbtn{border:0; background:var(--bg2); width:32px; height:32px; border-radius:9px; color:var(--ink2)}
    .amodal-body{padding:22px 24px}
    .photos{display:flex; gap:10px; flex-wrap:wrap}
    .photo-item{position:relative; width:84px; height:84px; border-radius:12px; overflow:hidden; border:1px solid var(--line)}
    .photo-item img{width:100%; height:100%; object-fit:cover}
    .photo-del{position:absolute; top:3px; right:3px; width:20px; height:20px; border:0; border-radius:6px; background:rgba(0,0,0,.55); color:#fff; font-size:11px}
    .photo-add{width:84px; height:84px; border:1px dashed var(--rose); border-radius:12px; background:var(--bg2); color:var(--rose-deep); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; font-size:20px; cursor:pointer}
    .photo-add span{font-size:11px}
    .fgrid{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px}
    .fgrid label{display:flex; flex-direction:column; gap:6px; font-size:12.5px; font-weight:600; color:var(--ink2)}
    .fgrid label.full{grid-column:1/-1}
    .fgrid input,.fgrid textarea,.fgrid select{border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-family:inherit; font-size:14px; color:var(--ink); outline:none; background:#fff}
    .fgrid input:focus,.fgrid textarea:focus,.fgrid select:focus{border-color:var(--rose)}
    .amodal-foot{display:flex; justify-content:flex-end; gap:10px; padding:18px 24px; border-top:1px solid var(--line)}
    .ghost{border:1px solid var(--line); background:none; color:var(--ink2); padding:10px 18px; border-radius:100px; font-size:14px; font-weight:600}

    .foot{border-top:1px solid var(--line); margin-top:20px; background:var(--bg2)}
    .foot-inner{max-width:1120px; margin:0 auto; padding:44px 40px 30px; display:flex; justify-content:space-between; gap:40px; flex-wrap:wrap}
    .foot-logo{font-family:'Hahmlet',serif; font-weight:700; font-size:22px; color:var(--rose-deep); margin-bottom:12px}
    .foot-tag{color:var(--ink2); font-size:14px; margin:0 0 20px; line-height:1.6}
    .foot-partner{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
    .foot-partner span{font-size:14px; color:var(--ink); font-weight:600}
    .foot-partner-btn{border:1px solid var(--rose); background:none; color:var(--rose-deep); padding:9px 18px; border-radius:100px; font-family:inherit; font-size:13px; font-weight:600; cursor:pointer}
    .foot-partner-btn:hover{background:#fff}
    .foot-right{display:flex; flex-direction:column; gap:12px; min-width:280px}
    .foot-item{display:flex; gap:14px; font-size:14px; color:var(--ink2)}
    .foot-label{min-width:60px; color:var(--rose-deep); font-weight:700; font-size:13px}
    .foot-item a{color:var(--ink2); text-decoration:none}
    .foot-item a:hover{color:var(--rose-deep)}
    .foot-copy{border-top:1px solid var(--line); text-align:center; padding:18px; font-size:12px; color:var(--ink3)}

    @media(max-width:820px){
      .detail{grid-template-columns:1fr} .ask-box{position:static}
      .hero-title{font-size:32px} .nav{padding:16px 20px}
      .hero,.board,.detail,.admin{padding-left:20px; padding-right:20px}
      .fgrid{grid-template-columns:1fr} .arow{grid-template-columns:1fr 1fr; gap:8px; font-size:13px}
      .arow.inq{grid-template-columns:1fr 1fr}
      .inq-list{grid-template-columns:1fr}
      .foot-inner{flex-direction:column; gap:26px; padding:36px 20px 24px}
      .foot-right{min-width:0}
    }
    `}</style>
  );
}
