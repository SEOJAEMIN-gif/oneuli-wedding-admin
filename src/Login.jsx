import { useState } from "react";
import { supabase } from "./supabase";

export default function Login({ onOk, onBack }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr("이메일 또는 비밀번호가 맞지 않아요.");
    else onOk();
  };

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">오늘의웨딩</div>
        <div className="login-sub">관리자 로그인</div>
        <div className="login-fields">
          <input className="login-input" placeholder="이메일" value={email} autoFocus
            onChange={(e) => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && !busy && submit()} />
          <input className="login-input" type="password" placeholder="비밀번호" value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && !busy && submit()} />
          {err && <div className="login-err">{err}</div>}
          <button className="login-btn" onClick={submit} disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
          <button className="login-back" onClick={onBack}>← 사이트로 돌아가기</button>
        </div>
      </div>
      <style>{`
        .login-root{min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;
          font-family:'Pretendard',system-ui,sans-serif;
          background:radial-gradient(700px 400px at 30% 0%, #ffe1ea, transparent 60%), #ffffff;}
        .login-card{width:min(370px,100%); padding:42px 34px 30px; text-align:center; background:#fff;
          border:1px solid #f4e3e8; border-radius:22px; box-shadow:0 24px 60px rgba(176,110,122,.14);}
        .login-brand{font-family:'Hahmlet',serif; font-weight:700; font-size:26px; color:#c93f6e;}
        .login-sub{font-size:13px; color:#8c7b82; letter-spacing:2px; margin-top:8px;}
        .login-fields{margin-top:28px; display:flex; flex-direction:column; gap:11px;}
        .login-input{background:#fff5f8; border:1px solid #f4e3e8; color:#3a2f34; padding:13px 15px;
          border-radius:12px; font-family:inherit; font-size:15px; outline:none;}
        .login-input:focus{border-color:#e35b86;}
        .login-err{color:#c96b6b; font-size:13px;}
        .login-btn{margin-top:4px; border:0; cursor:pointer; padding:14px; border-radius:12px; color:#fff;
          font-family:inherit; font-size:15px; font-weight:700; background:#e35b86;}
        .login-btn:hover{background:#c93f6e;} .login-btn:disabled{opacity:.6;}
        .login-back{margin-top:6px; border:0; background:none; color:#8c7b82; font-family:inherit; font-size:13px; cursor:pointer;}
      `}</style>
    </div>
  );
}
