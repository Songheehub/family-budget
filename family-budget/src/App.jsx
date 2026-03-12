import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { db } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const EXPENSE_CATEGORIES = {
  식비:       { emoji: "🍱", color: "#E07A5F" },
  장보기:     { emoji: "🛒", color: "#FF9F1C" },
  "카페·디저트": { emoji: "☕", color: "#A0785A" },
  의료:       { emoji: "💊", color: "#81B29A" },
  통신:       { emoji: "📱", color: "#5C85D6" },
  공과금:     { emoji: "🔌", color: "#6DBF9E" },
  교육:       { emoji: "📚", color: "#F2CC8F" },
  문화:       { emoji: "🎭", color: "#C77DFF" },
  쇼핑:       { emoji: "🛍️", color: "#4A6FA5" },
  여행:       { emoji: "✈️", color: "#4A90D9" },
  용돈:       { emoji: "💸", color: "#2EC4B6" },
  주거:       { emoji: "🏠", color: "#3BB273" },
  기타:       { emoji: "📦", color: "#aaa" },
};
const INCOME_CATEGORIES = {
  급여:   { emoji: "💼", color: "#3BB273" },
  이자:   { emoji: "🏦", color: "#4A6FA5" },
  상여:   { emoji: "🎁", color: "#FF9F1C" },
  용돈:   { emoji: "💝", color: "#C77DFF" },
  기타:   { emoji: "📦", color: "#aaa" },
};
const CATEGORIES = { ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES };

const MEMBER_COLORS = ["#4A6FA5","#E07A5F","#81B29A","#F2CC8F","#C77DFF","#FF9F1C"];
const MEMBER_EMOJIS = ["👨","👩","🧒","👦","👧","🧓"];
const ASSET_COLORS = ["#4A6FA5","#81B29A","#F2CC8F","#E07A5F","#C77DFF","#FF9F1C","#2EC4B6"];
const ASSET_EMOJIS = ["🏦","📈","🏠","💳","💎","🏧","💵"];

const fmt = (n) => (n||0).toLocaleString() + "원";
const cardLabel = (card, members) => {
  const mem = members?.find(m => m.id === card.memberId);
  return mem ? `${card.name}(${mem.name})` : card.name;
};
const fmtShort = (n) => fmt(n);

const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
const thisMonthLabel = `${now.getFullYear()}년 ${now.getMonth()+1}월`;
const catTotal = (cat) => (cat.accounts||[]).reduce((s,a)=>s+(a.amount||0),0);
const allTotal = (cats) => (cats||[]).reduce((s,c)=>s+catTotal(c),0);

// ─── Firebase helpers ───────────────────────────────────────────────
const FAMILY_ID = "shared"; // 가족 공유 ID (모두 같은 데이터)

const fbGet = async (collection) => {
  const snap = await getDoc(doc(db, collection, FAMILY_ID));
  return snap.exists() ? snap.data().value : null;
};
const fbSet = async (collection, value) => {
  await setDoc(doc(db, collection, FAMILY_ID), { value });
};
const fbDelete = async (collection) => {
  await deleteDoc(doc(db, collection, FAMILY_ID));
};

// ────────────────────────────────────────────
// 설정 마법사
// ────────────────────────────────────────────
function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [members, setMembers] = useState([
    { id: 1, name: "아빠", emoji: "👨" },
    { id: 2, name: "엄마", emoji: "👩" },
  ]);
  const [newName, setNewName] = useState("");
  const [assetCats, setAssetCats] = useState([
    { id: 1, label: "예금/현금", color: "#4A6FA5", emoji: "🏦", accounts: [{ id: 101, name: "", amount: "" }] },
    { id: 2, label: "투자/주식", color: "#81B29A", emoji: "📈", accounts: [{ id: 201, name: "", amount: "" }] },
    { id: 3, label: "부동산",   color: "#F2CC8F", emoji: "🏠", accounts: [{ id: 301, name: "", amount: "" }] },
  ]);

  const addMember = () => {
    if (!newName.trim()) return;
    setMembers([...members, { id: Date.now(), name: newName.trim(), emoji: MEMBER_EMOJIS[members.length % MEMBER_EMOJIS.length] }]);
    setNewName("");
  };
  const addCat = () => {
    const i = assetCats.length % ASSET_COLORS.length;
    setAssetCats([...assetCats, { id: Date.now(), label: "", color: ASSET_COLORS[i], emoji: ASSET_EMOJIS[i], accounts: [{ id: Date.now()+1, name: "", amount: "" }] }]);
  };
  const updCat = (cid, k, v) => setAssetCats(assetCats.map(c => c.id===cid ? {...c,[k]:v} : c));
  const delCat = (cid) => setAssetCats(assetCats.filter(c => c.id!==cid));
  const addAcc = (cid) => setAssetCats(assetCats.map(c => c.id===cid ? {...c, accounts:[...c.accounts,{id:Date.now(),name:"",amount:""}]} : c));
  const updAcc = (cid, aid, k, v) => setAssetCats(assetCats.map(c => c.id===cid ? {...c, accounts:c.accounts.map(a=>a.id===aid?{...a,[k]:v}:a)} : c));
  const delAcc = (cid, aid) => setAssetCats(assetCats.map(c => c.id===cid ? {...c, accounts:c.accounts.filter(a=>a.id!==aid)} : c));

  const finish = () => {
    const finalMembers = [...members, { id: 9999, name: "공동", emoji: "🏠" }];
    const finalCats = assetCats.filter(c=>c.label).map(c=>({...c, accounts:c.accounts.filter(a=>a.name).map(a=>({...a,amount:parseInt(a.amount)||0}))}));
    const entry = { month: thisMonthLabel };
    finalCats.forEach(c => { entry[c.label] = catTotal(c); });
    onComplete({ members: finalMembers, assetCats: finalCats, assetHistory: [entry], transactions: [] });
  };

  const S = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}.wi{width:100%;padding:10px 13px;border:1.5px solid #E5E0D5;border-radius:9px;font-family:inherit;font-size:14px;outline:none;background:#FAFAF7;transition:border .2s}.wi:focus{border-color:#4A6FA5}`;

  return (
    <div style={{minHeight:"100vh",background:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{S}</style>
      <div style={{background:"white",borderRadius:24,padding:28,width:"100%",maxWidth:480,boxShadow:"0 8px 40px rgba(0,0,0,.08)"}}>
        <div style={{display:"flex",gap:6,marginBottom:24}}>
          {[1,2].map(s=><div key={s} style={{flex:1,height:4,borderRadius:4,background:s<=step?"#4A6FA5":"#E5E0D5",transition:"background .3s"}}/>)}
        </div>

        {step===1 && (<>
          <div style={{fontSize:26,marginBottom:6}}>👨‍👩‍👧</div>
          <div style={{fontSize:19,fontWeight:700,marginBottom:3}}>가족 구성원 설정</div>
          <div style={{fontSize:12,color:"#999",marginBottom:20}}>가계부를 함께 쓸 가족을 추가해요</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            {members.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,background:"#FAFAF7",borderRadius:11,padding:"9px 13px"}}>
                <span style={{fontSize:20}}>{m.emoji}</span>
                <input className="wi" style={{background:"transparent",border:"none",flex:1,fontWeight:500,padding:0}} value={m.name}
                  onChange={e=>setMembers(members.map(x=>x.id===m.id?{...x,name:e.target.value}:x))}/>
                {members.length>1&&<button onClick={()=>setMembers(members.filter(x=>x.id!==m.id))} style={{background:"none",border:"none",color:"#ccc",fontSize:15,cursor:"pointer"}}>✕</button>}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:24}}>
            <input className="wi" placeholder="이름 입력 후 Enter" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addMember()}/>
            <button onClick={addMember} style={{background:"#EEF2F9",border:"none",borderRadius:9,padding:"0 14px",fontSize:18,cursor:"pointer",color:"#4A6FA5",flexShrink:0}}>+</button>
          </div>
          <button onClick={()=>setStep(2)} style={{width:"100%",padding:13,background:"#4A6FA5",color:"white",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>다음 →</button>
        </>)}

        {step===2 && (<>
          <div style={{fontSize:26,marginBottom:6}}>💎</div>
          <div style={{fontSize:19,fontWeight:700,marginBottom:3}}>자산 설정</div>
          <div style={{fontSize:12,color:"#999",marginBottom:18}}>카테고리 안에 통장/계좌를 등록해요</div>
          <div style={{display:"flex",flexDirection:"column",gap:13,marginBottom:12}}>
            {assetCats.map(cat=>(
              <div key={cat.id} style={{border:`1.5px solid ${cat.color}55`,borderRadius:14,overflow:"hidden"}}>
                <div style={{background:cat.color+"18",padding:"10px 13px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>{cat.emoji}</span>
                  <input className="wi" placeholder="카테고리명 (예: 예금/현금)" value={cat.label}
                    onChange={e=>updCat(cat.id,"label",e.target.value)}
                    style={{background:"transparent",border:"none",fontWeight:700,padding:0,fontSize:14,flex:1,color:"#2A2A2A"}}/>
                  <span style={{fontSize:12,color:cat.color,fontWeight:600,whiteSpace:"nowrap"}}>
                    {fmtShort(cat.accounts.reduce((s,a)=>s+(parseInt(a.amount)||0),0))}
                  </span>
                  <button onClick={()=>delCat(cat.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:13,cursor:"pointer",padding:0}}>✕</button>
                </div>
                <div style={{padding:"10px 13px",display:"flex",flexDirection:"column",gap:7}}>
                  {cat.accounts.map(acc=>(
                    <div key={acc.id} style={{display:"flex",gap:7,alignItems:"center"}}>
                      <input className="wi" style={{flex:1}} placeholder="통장명 (예: 국민은행)" value={acc.name} onChange={e=>updAcc(cat.id,acc.id,"name",e.target.value)}/>
                      <input className="wi" style={{flex:1}} placeholder="잔액 (원)" type="number" value={acc.amount} onChange={e=>updAcc(cat.id,acc.id,"amount",e.target.value)}/>
                      <button onClick={()=>delAcc(cat.id,acc.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:13,cursor:"pointer",padding:"0 4px",flexShrink:0}}>✕</button>
                    </div>
                  ))}
                  <button onClick={()=>addAcc(cat.id)} style={{background:"none",border:`1.5px dashed ${cat.color}88`,borderRadius:8,padding:"7px",color:cat.color,fontSize:12,cursor:"pointer",fontFamily:"inherit",marginTop:2}}>+ 통장 추가</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addCat} style={{width:"100%",padding:10,background:"#F5F0E8",border:"1.5px dashed #C8BFB0",borderRadius:12,color:"#888",fontSize:13,cursor:"pointer",fontFamily:"inherit",marginBottom:18}}>+ 카테고리 추가</button>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} style={{flex:1,padding:13,background:"#F0EBE0",color:"#555",border:"none",borderRadius:12,fontSize:15,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>← 이전</button>
            <button onClick={finish} style={{flex:2,padding:13,background:"#4A6FA5",color:"white",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>완료 🎉</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// 자산 수정 모달
// ────────────────────────────────────────────
function AssetEditModal({ assetCats: initCats, onSave, onClose }) {
  const [cats, setCats] = useState(initCats.map(c=>({...c,accounts:c.accounts.map(a=>({...a}))})));
  const addAcc = (cid) => setCats(cats.map(c=>c.id===cid?{...c,accounts:[...c.accounts,{id:Date.now(),name:"",amount:0}]}:c));
  const updAcc = (cid,aid,k,v) => setCats(cats.map(c=>c.id===cid?{...c,accounts:c.accounts.map(a=>a.id===aid?{...a,[k]:k==="amount"?(parseInt(v)||0):v}:a)}:c));
  const delAcc = (cid,aid) => setCats(cats.map(c=>c.id===cid?{...c,accounts:c.accounts.filter(a=>a.id!==aid)}:c));
  const addCat = () => {
    const i = cats.length % ASSET_COLORS.length;
    setCats([...cats,{id:Date.now(),label:"",color:ASSET_COLORS[i],emoji:ASSET_EMOJIS[i],accounts:[{id:Date.now()+1,name:"",amount:0}]}]);
  };
  const updCat = (cid,k,v) => setCats(cats.map(c=>c.id===cid?{...c,[k]:v}:c));
  const delCat = (cid) => setCats(cats.filter(c=>c.id!==cid));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 18px"}}/>
        <div style={{fontSize:17,fontWeight:700,marginBottom:16}}>자산 수정 ✏️</div>
        <div style={{display:"flex",flexDirection:"column",gap:13,marginBottom:12}}>
          {cats.map(cat=>(
            <div key={cat.id} style={{border:`1.5px solid ${cat.color}55`,borderRadius:14,overflow:"hidden"}}>
              <div style={{background:cat.color+"18",padding:"10px 13px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>{cat.emoji}</span>
                <input className="inp" placeholder="카테고리명" value={cat.label} onChange={e=>updCat(cat.id,"label",e.target.value)}
                  style={{background:"transparent",border:"none",fontWeight:700,padding:0,fontSize:14,flex:1}}/>
                <span style={{fontSize:12,color:cat.color,fontWeight:600,whiteSpace:"nowrap"}}>{fmtShort(catTotal(cat))}</span>
                <button onClick={()=>delCat(cat.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:13,cursor:"pointer"}}>✕</button>
              </div>
              <div style={{padding:"10px 13px",display:"flex",flexDirection:"column",gap:7}}>
                {cat.accounts.map(acc=>(
                  <div key={acc.id} style={{display:"flex",gap:7,alignItems:"center"}}>
                    <input className="inp" style={{flex:1}} placeholder="통장명" value={acc.name} onChange={e=>updAcc(cat.id,acc.id,"name",e.target.value)}/>
                    <input className="inp" style={{flex:1}} placeholder="잔액" type="number" value={acc.amount||""} onChange={e=>updAcc(cat.id,acc.id,"amount",e.target.value)}/>
                    <button onClick={()=>delAcc(cat.id,acc.id)} style={{background:"none",border:"none",color:"#ccc",fontSize:13,cursor:"pointer",padding:"0 4px"}}>✕</button>
                  </div>
                ))}
                <button onClick={()=>addAcc(cat.id)} style={{background:"none",border:`1.5px dashed ${cat.color}88`,borderRadius:8,padding:"7px",color:cat.color,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>+ 통장 추가</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addCat} style={{width:"100%",padding:10,background:"#F5F0E8",border:"1.5px dashed #C8BFB0",borderRadius:12,color:"#888",fontSize:13,cursor:"pointer",fontFamily:"inherit",marginBottom:18}}>+ 카테고리 추가</button>
        <div style={{display:"flex",gap:10}}>
          <button className="btn-g" style={{flex:1}} onClick={onClose}>취소</button>
          <button className="btn-b" style={{flex:2}} onClick={()=>onSave(cats)}>저장하기</button>
        </div>
      </div>
    </div>
  );
}

// ── 카드 추가 폼 ──
function CardAddForm({ members, onAdd }) {
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), memberId: memberId ? parseInt(memberId) : null });
    setName(""); setMemberId("");
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <input className="inp" placeholder="카드 이름 (예: 신한카드)" value={name} onChange={e=>setName(e.target.value)}/>
      <select className="sel" value={memberId} onChange={e=>setMemberId(e.target.value)}>
        <option value="">카드 주인 선택</option>
        {members.map(m=><option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
      </select>
      <button className="btn-b" onClick={submit} style={{width:"100%"}}>+ 추가</button>
    </div>
  );
}

// ── 카드 일괄 입력 모달 ──
function BulkCardModal({ cards, members, assetCats, today, defaultCardId, defaultMemberId, onSave, onClose }) {
  const [step, setStep] = useState("input");
  const [cardId, setCardId] = useState(defaultCardId || String(cards[0]?.id||""));
  const [memberId, setMemberId] = useState(defaultMemberId || String(members[0]?.id||""));
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [inputMode, setInputMode] = useState("text"); // "text" | "csv"
  const fileRef = useRef();

  const EXPENSE_CATEGORIES = ["식비","장보기","카페·디저트","의료","통신","공과금","교육","문화","쇼핑","여행","용돈","주거","기타"];

  const parseWithAI = async (content) => {
    setParsing(true); setParseError("");
    try {
      const res = await fetch("/api/parse-card", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:2000,
          messages:[{role:"user", content:`다음은 카드 사용내역입니다 (문자/텍스트이거나 CSV일 수 있어요). 각 결제 건을 파싱해서 JSON 배열로만 응답하세요. 다른 말 없이 JSON만.

카테고리는 반드시 다음 중 하나: ${EXPENSE_CATEGORIES.join(",")}
날짜가 없으면 오늘(${today}) 사용. 날짜 형식은 YYYY-MM-DD.
금액은 숫자만(원, 콤마 제거). 지출만 포함, 취소/환불 제외.
memo는 가맹점명 또는 내용.

응답 형식:
[{"date":"2026-03-11","amount":15000,"memo":"스타벅스","category":"식비"}]

내역:
${content.slice(0, 8000)}`}]
        })
      });
      if (!res.ok) {
        const errBody = await res.text();
        setParseError(`API 오류 (${res.status}): ${errBody.slice(0,100)}`);
        return;
      }
      const data = await res.json();
      if (data.error) { setParseError(`API 오류: ${data.error.message}`); return; }
      const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "";
      const clean = text.replace(/```json|```/g,"").trim();
      const items = JSON.parse(clean);
      setParsed(items.map((it,i)=>({...it, _id:i, enabled:true})));
      setStep("confirm");
    } catch(e) {
      setParseError(`오류: ${e.message}`);
    } finally { setParsing(false); }
  };

  // CSV 한 줄을 컬럼 배열로 파싱 (따옴표 안의 콤마 처리)
  const splitCSVLine = (line) => {
    const cols = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  };

  // 순수 JS로 CSV 파싱 (AI 없이)
  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // 헤더 찾기
    const headerIdx = lines.findIndex(l =>
      /날짜|이용일|승인일|거래일|결제일/.test(l) &&
      /금액|이용금액|승인금액|거래금액/.test(l)
    );
    if (headerIdx === -1) return [];

    const headers = splitCSVLine(lines[headerIdx]).map(h => h.replace(/"/g,"").trim());

    // 컬럼 인덱스 찾기
    const dateCol = headers.findIndex(h => /날짜|이용일|승인일|거래일|결제일/.test(h));
    const amtCol  = headers.findIndex(h => /이용금액|승인금액|거래금액|결제금액|금액/.test(h));
    const memoCol = headers.findIndex(h => /가맹점|상호|이용처|내용|거래처|업종명/.test(h));

    if (dateCol === -1 || amtCol === -1) return [];

    const results = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i]).map(c => c.replace(/"/g,"").trim());
      if (cols.length <= Math.max(dateCol, amtCol)) continue;

      // 날짜 파싱
      let dateRaw = cols[dateCol] || "";
      let date = today;
      const dm  = dateRaw.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
      const dm3 = dateRaw.match(/^(\d{4})(\d{2})(\d{2})$/);
      const dm2 = dateRaw.match(/^(\d{2})(\d{2})(\d{2})$/);
      if (dm)  date = `${dm[1]}-${dm[2].padStart(2,"0")}-${dm[3].padStart(2,"0")}`;
      else if (dm3) date = `${dm3[1]}-${dm3[2]}-${dm3[3]}`;
      else if (dm2) date = `20${dm2[1]}-${dm2[2]}-${dm2[3]}`;

      // 금액 파싱 (콤마·원·공백 모두 제거)
      const amtRaw = cols[amtCol] || "0";
      const amt = parseInt(amtRaw.replace(/[^0-9]/g,"")) || 0;
      if (amt <= 0) continue;

      const memo = memoCol !== -1 ? (cols[memoCol] || "미상") : "미상";

      // 간단 카테고리 자동 분류
      const category = (() => {
        const n = memo;
        if (/스타벅스|커피|베이커리|맥도날드|버거킹|롯데리아|피자|치킨|식당|음식|한식|중식|일식|분식|김밥|도시락/.test(n)) return "식비";
        if (/카페|디저트|케이크|마카롱|빵|파리바게|뚜레쥬르|이디야|투썸|할리스|폴바셋/.test(n)) return "카페·디저트";
        if (/마트|이마트|홈플러스|롯데마트|코스트코|GS25|CU|세븐|편의점|농협|하나로/.test(n)) return "장보기";
        if (/병원|의원|약국|클리닉|치과|한의원|건강/.test(n)) return "의료";
        if (/SK텔레콤|KT|LG U\+|통신|휴대폰|인터넷|알뜰폰/.test(n)) return "통신";
        if (/전기|가스|수도|관리비|공과금|한국전력|도시가스/.test(n)) return "공과금";
        if (/학원|교육|문구|학습|어린이|유치원|학교/.test(n)) return "교육";
        if (/영화|CGV|롯데시네마|넷플릭스|유튜브|게임|스포츠|헬스/.test(n)) return "문화";
        if (/여행|호텔|항공|숙박|에어비앤비|펜션|리조트/.test(n)) return "여행";
        if (/백화점|아울렛|올리브영|다이소|무신사|배민|요기요|쇼핑/.test(n)) return "쇼핑";
        if (/월세|임대|아파트|보험/.test(n)) return "주거";
        return "기타";
      })();

      results.push({ date, amount: amt, memo, category, _id: i, enabled: true });
    }
    return results;
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setParsing(true); setParseError("");
    try {
      const buf = await file.arrayBuffer();
      // EUC-KR 우선 시도 (한국 카드사 CSV)
      let text = "";
      try {
        text = new TextDecoder("euc-kr").decode(buf);
        if (text.includes("\uFFFD")) text = new TextDecoder("utf-8").decode(buf);
      } catch { text = new TextDecoder("utf-8").decode(buf); }

      const items = parseCSV(text);
      if (items.length === 0) {
        setParseError("내역을 찾지 못했어요. 파일 형식을 확인해주세요.");
        setParsing(false); return;
      }
      setParsed(items);
      setStep("confirm");
    } catch(err) {
      setParseError(`파일 읽기 오류: ${err.message}`);
    } finally { setParsing(false); }
  };

  const save = () => {
    const txs = parsed.filter(p=>p.enabled).map((p,i)=>({
      id: Date.now() + i,
      date: p.date,
      type: "expense",
      amount: parseInt(p.amount)||0,
      category: p.category||"기타",
      memo: p.memo,
      member: parseInt(memberId)||members[0]?.id,
      cardId: cardId,
      accountId: "",
    }));
    onSave(txs, cardId, memberId);
  };

  return (
    <div className="overlay">
      <div className="sheet" style={{maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 18px"}}/>
        <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>💳 카드내역 일괄 입력</div>
        <div style={{fontSize:12,color:"#aaa",marginBottom:16}}>카드사 앱에서 내보낸 CSV 또는 문자 내역을 붙여넣으세요</div>

        {step==="input" ? (<>
          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>카드</label>
              <select className="sel" value={cardId} onChange={e=>setCardId(e.target.value)}>
                {cards.map(c=><option key={c.id} value={c.id}>{cardLabel(c, members)}</option>)}
              </select>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>카드 주인</label>
              <select className="sel" value={memberId} onChange={e=>setMemberId(e.target.value)}>
                {members.filter(m=>m.id!==9999).map(m=><option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
              </select>
            </div>
          </div>

          {/* 입력 방식 탭 */}
          <div className="tt" style={{marginBottom:12}}>
            <button className={`tb ${inputMode==="csv"?"on":""}`} onClick={()=>setInputMode("csv")} style={{color:inputMode==="csv"?"#4A6FA5":"#999",fontSize:12}}>📁 CSV 파일</button>
            <button className={`tb ${inputMode==="text"?"on":""}`} onClick={()=>setInputMode("text")} style={{color:inputMode==="text"?"#4A6FA5":"#999",fontSize:12}}>📋 텍스트 붙여넣기</button>
          </div>

          {inputMode==="csv" ? (
            <div>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx" style={{display:"none"}} onChange={handleCSV}/>
              <button onClick={()=>fileRef.current.click()}
                style={{width:"100%",padding:"32px 20px",background:"#FAFAF7",border:"2px dashed #C8BFB0",borderRadius:16,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <span style={{fontSize:36}}>📁</span>
                <span style={{fontSize:14,fontWeight:600,color:"#555"}}>CSV 파일 선택</span>
                <span style={{fontSize:11,color:"#aaa",textAlign:"center",lineHeight:1.8}}>
                  엑셀 → 다른이름저장 → <b style={{color:"#4A6FA5"}}>CSV (쉼표로 분리)</b> 로 저장 후 업로드<br/>
                  신한·현대·삼성·국민·하나·롯데·BC 카드 모두 지원
                </span>
              </button>
              {parsing && <div style={{textAlign:"center",padding:"16px 0",color:"#4A6FA5",fontSize:13}}>✨ AI가 내역을 분석 중이에요…</div>}
            </div>
          ) : (
            <div>
              <textarea value={rawText} onChange={e=>setRawText(e.target.value)}
                placeholder={"카드사 문자 또는 내역을 붙여넣으세요:\n\n[신한카드] 15,000원 스타벅스 승인 03/10\n[신한카드] 32,000원 올리브영 승인 03/11"}
                style={{width:"100%",minHeight:160,padding:12,borderRadius:12,border:"1.5px solid #E5E0D5",fontSize:13,fontFamily:"inherit",resize:"vertical",background:"#FAFAF7",boxSizing:"border-box",lineHeight:1.6}}/>
              {parsing && <div style={{textAlign:"center",padding:"8px 0",color:"#4A6FA5",fontSize:13}}>✨ AI 분석 중…</div>}
            </div>
          )}

          {parseError && <div style={{fontSize:12,color:"#E07A5F",marginTop:6}}>{parseError}</div>}

          {inputMode==="text" && (
            <div style={{display:"flex",gap:10,marginTop:14}}>
              <button className="btn-g" style={{flex:1}} onClick={onClose}>취소</button>
              <button className="btn-b" style={{flex:2}} onClick={()=>{
                if (!rawText.trim()) return;
                const items = parseCSV(rawText);
                if (items.length === 0) { setParseError("내역을 찾지 못했어요. 날짜·금액·가맹점 컬럼이 있는 CSV 형식인지 확인해주세요."); return; }
                setParsed(items); setStep("confirm");
              }} disabled={!rawText.trim()}>파싱하기</button>
            </div>
          )}
          {inputMode==="csv" && !parsing && (
            <button className="btn-g" style={{width:"100%",marginTop:12}} onClick={onClose}>취소</button>
          )}
        </>) : (<>
          <div style={{fontSize:13,fontWeight:600,marginBottom:10,color:"#555"}}>파싱된 내역 확인 <span style={{color:"#4A6FA5"}}>{parsed.filter(p=>p.enabled).length}건 선택됨</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {parsed.map((p,i)=>(
              <div key={p._id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:p.enabled?"#FAFAF7":"#f5f5f5",borderRadius:12,border:`1.5px solid ${p.enabled?"#E5E0D5":"#eee"}`,opacity:p.enabled?1:0.5}}>
                <input type="checkbox" checked={p.enabled} onChange={e=>setParsed(prev=>prev.map((x,j)=>j===i?{...x,enabled:e.target.checked}:x))} style={{width:16,height:16,accentColor:"#4A6FA5",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                    <input value={p.memo} onChange={e=>setParsed(prev=>prev.map((x,j)=>j===i?{...x,memo:e.target.value}:x))}
                      style={{fontSize:13,fontWeight:500,border:"none",background:"transparent",flex:1,minWidth:80,fontFamily:"inherit"}}/>
                    <select value={p.category} onChange={e=>setParsed(prev=>prev.map((x,j)=>j===i?{...x,category:e.target.value}:x))}
                      style={{fontSize:11,border:"1px solid #E5E0D5",borderRadius:7,padding:"2px 6px",background:"white",fontFamily:"inherit"}}>
                      {EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input value={p.date} onChange={e=>setParsed(prev=>prev.map((x,j)=>j===i?{...x,date:e.target.value}:x))}
                      style={{fontSize:11,color:"#aaa",border:"none",background:"transparent",fontFamily:"inherit",width:90}}/>
                    <input type="number" value={p.amount} onChange={e=>setParsed(prev=>prev.map((x,j)=>j===i?{...x,amount:parseInt(e.target.value)||0}:x))}
                      style={{fontSize:13,fontWeight:700,color:"#E07A5F",border:"none",background:"transparent",fontFamily:"inherit",width:90,textAlign:"right"}}/>
                    <span style={{fontSize:12,color:"#E07A5F"}}>원</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn-g" style={{flex:1}} onClick={()=>setStep("input")}>← 다시</button>
            <button className="btn-b" style={{flex:2}} onClick={save} disabled={!parsed.some(p=>p.enabled)}>
              저장 ({parsed.filter(p=>p.enabled).length}건)
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// 메인 앱
// ────────────────────────────────────────────
export default function App() {
  const [setup, setSetup] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(null);
  const [settleAccountId, setSettleAccountId] = useState("");
  const [showBulkCardModal, setShowBulkCardModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [expandedCat, setExpandedCat] = useState({});
  const [chartView, setChartView] = useState("category");
  const [chartPeriod, setChartPeriod] = useState("monthly");
  const [chartFocusCat, setChartFocusCat] = useState(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringItems, setRecurringItems] = useState([]);
  const [recurringApplied, setRecurringApplied] = useState(false);
  const [rForm, setRForm] = useState({memo:"",amount:"",category:"식비",type:"expense",day:1,member:"",accountId:"",toAccountId:""});
  const [txForm, setTxForm] = useState({date:now.toISOString().slice(0,10),type:"expense",amount:"",category:"식비",memo:"",member:"",accountId:"",cardId:""});
  const [editTxId, setEditTxId] = useState(null);
  const [lastMember, setLastMember] = useState("");
  const [dashMember, setDashMember] = useState(null); // 대시보드 멤버 필터
  const [lastCardId, setLastCardId] = useState("");
  const [lastCardMemberId, setLastCardMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const isRemoteUpdate = useRef(false); // 원격 업데이트로 인한 state 변경 여부

  // ── Firestore 실시간 구독 ──────────────────────────────
  useEffect(() => {
    let loadedSetup = null;
    let loadedTx = [];
    let loadedRecurring = [];
    let count = 0;
    const done = () => { count++; if (count >= 3) setLoading(false); };

    // setup 구독
    const unsubSetup = onSnapshot(doc(db, "setup", FAMILY_ID), (snap) => {
      if (snap.exists()) {
        const val = snap.data().value;
        loadedSetup = val;
        isRemoteUpdate.current = true;
        setSetup(val);
        isRemoteUpdate.current = false;

        // 고정지출 자동 적용 체크 (최초 1회)
        if (count < 3) {
          // 나중에 transactions 로드 후 처리
        }
      }
      done();
    }, () => done());

    // transactions 구독 (실시간 동기화)
    const unsubTx = onSnapshot(doc(db, "transactions", FAMILY_ID), (snap) => {
      if (snap.exists()) {
        loadedTx = snap.data().value;
        isRemoteUpdate.current = true;
        setTransactions(loadedTx);
        isRemoteUpdate.current = false;
      }
      done();
    }, () => done());

    // recurring 구독
    const unsubRecurring = onSnapshot(doc(db, "recurring", FAMILY_ID), (snap) => {
      if (snap.exists()) {
        loadedRecurring = snap.data().value;
        isRemoteUpdate.current = true;
        setRecurringItems(loadedRecurring);
        isRemoteUpdate.current = false;
      }
      done();
    }, () => done());

    return () => { unsubSetup(); unsubTx(); unsubRecurring(); };
  }, []);

  // ── 고정지출 이번 달 자동 적용 (로딩 완료 후) ──────────────
  useEffect(() => {
    if (loading) return;
    if (!recurringItems.length || !setup) return;
    const alreadyApplied = transactions.some(t => t.isRecurring && t.date.startsWith(thisMonth));
    if (alreadyApplied) { setRecurringApplied(true); return; }

    const autoTx = recurringItems
      .filter(r => r.active !== false && (r.day || 1) <= now.getDate())
      .flatMap(r => {
        const base = {
          date: `${thisMonth}-${String(r.day||1).padStart(2,"0")}`,
          amount: r.amount, memo: r.memo, member: r.member || 9999,
          isRecurring: true, recurringId: r.id,
        };
        if (r.type === "transfer") {
          const tid = Date.now() + Math.random();
          return [
            { ...base, id: tid,   type:"transfer", category:"이체", accountId: r.accountId,   toAccountId: r.toAccountId, isTransfer:true, transferPair: tid+1 },
            { ...base, id: tid+1, type:"transfer", category:"이체", accountId: r.toAccountId, fromAccountId: r.accountId, isTransfer:true, isTransferIn:true, transferPair: tid },
          ];
        }
        return [{ ...base, id: Date.now() + Math.random(), type: r.type || "expense", category: r.category, accountId: r.accountId || "" }];
      });

    if (autoTx.length > 0) {
      const newTx = [...transactions, ...autoTx];
      setTransactions(newTx);

      if (setup?.assetCats) {
        let newCats = [...setup.assetCats];
        autoTx.forEach(t => {
          if (t.isTransfer) {
            if (!t.isTransferIn && t.accountId) {
              newCats = newCats.map(c => ({...c, accounts: c.accounts.map(a =>
                String(a.id)===String(t.accountId) ? {...a, amount: Math.max(0,(a.amount||0)-t.amount)} : a
              )}));
            } else if (t.isTransferIn && t.accountId) {
              newCats = newCats.map(c => ({...c, accounts: c.accounts.map(a =>
                String(a.id)===String(t.accountId) ? {...a, amount: (a.amount||0)+t.amount} : a
              )}));
            }
          } else if (t.accountId) {
            const delta = t.type === "income" ? t.amount : -t.amount;
            newCats = newCats.map(c => ({...c, accounts: c.accounts.map(a =>
              String(a.id)===String(t.accountId) ? {...a, amount: Math.max(0,(a.amount||0)+delta)} : a
            )}));
          }
        });
        const { assetHistory, accountHistory } = buildSnapshot(newCats, setup);
        setSetup(s => ({...s, assetCats: newCats, assetHistory, accountHistory}));
      }
    }
    setRecurringApplied(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── setup → Firestore 저장 ──────────────────────────────
  useEffect(() => {
    if (loading || !setup || isRemoteUpdate.current) return;
    setSaving(true);
    fbSet("setup", setup)
      .then(() => { setLastSaved(new Date()); setSaving(false); })
      .catch(() => setSaving(false));
  }, [setup, loading]);

  // ── transactions → Firestore 저장 ──────────────────────
  useEffect(() => {
    if (loading || isRemoteUpdate.current) return;
    setSaving(true);
    fbSet("transactions", transactions)
      .then(() => { setLastSaved(new Date()); setSaving(false); })
      .catch(() => setSaving(false));
  }, [transactions, loading]);

  // ── recurring → Firestore 저장 ─────────────────────────
  useEffect(() => {
    if (loading || isRemoteUpdate.current) return;
    fbSet("recurring", recurringItems).catch(() => {});
  }, [recurringItems, loading]);

  const members      = setup?.members      || [];
  const assetCats    = setup?.assetCats    || [];
  const assetHistory = setup?.assetHistory || [];
  const accountHistory = setup?.accountHistory || [];
  const cards        = setup?.cards        || [];
  const totalAssetValue = allTotal(assetCats);

  // 카드별 미정산 누적금액
  const cardBalances = useMemo(() => {
    const map = {};
    cards.forEach(c => { map[String(c.id)] = 0; });
    transactions.filter(t => t.cardId && !t.isCardSettle).forEach(t => {
      const k = String(t.cardId);
      if (map[k] !== undefined) map[k] += t.amount;
    });
    return map;
  }, [transactions, cards]);

  // 카드 정산
  const settleCard = () => {
    const card = showSettleModal;
    if (!card || !settleAccountId) return;
    const amt = cardBalances[String(card.id)] || 0;
    if (!amt) return;
    const settleDate = now.toISOString().slice(0,10);
    // 정산 내역 (지출로 통장에서 차감)
    const settleTx = { id: Date.now(), date: settleDate, type:"expense", amount: amt,
      category:"기타", memo:`${card.name} 카드 정산`, member: card.memberId||9999,
      accountId: settleAccountId, isCardSettle: true, cardId: card.id };
    setTransactions(prev => [...prev, settleTx]);
    setSetup(s => {
      const newCats = adjustAccount(s.assetCats, settleAccountId, -amt);
      const { assetHistory, accountHistory } = buildSnapshot(newCats, s);
      return { ...s, assetCats: newCats, assetHistory, accountHistory };
    });
    setShowSettleModal(null);
    setSettleAccountId("");
  };

  const monthTx      = useMemo(()=>transactions.filter(t=>t.date.startsWith(thisMonth)),[transactions]);
  const totalIncome  = useMemo(()=>monthTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[monthTx]);
  const totalExpense = useMemo(()=>monthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[monthTx]);
  const balance      = totalIncome - totalExpense;

  const categoryData = useMemo(()=>{
    const map={};
    monthTx.filter(t=>t.type==="expense").forEach(t=>{map[t.category]=(map[t.category]||0)+t.amount;});
    return Object.entries(map).map(([name,value])=>({name,value,...CATEGORIES[name]})).sort((a,b)=>b.value-a.value);
  },[monthTx]);

  const memberExpense = useMemo(()=>members.map(m=>({...m,expense:monthTx.filter(t=>t.type==="expense"&&t.member===m.id).reduce((s,t)=>s+t.amount,0)})),[monthTx,members]);
  const filteredTx    = useMemo(()=>[...transactions].filter(t=>!selectedMember||t.member===selectedMember).sort((a,b)=>b.date.localeCompare(a.date)),[transactions,selectedMember]);

  // 자산 스냅샷 기록 (카테고리별 월간 + 통장별 일간)
  const buildSnapshot = (newCats, prevSetup) => {
    const todayStr = now.toISOString().slice(0,10);
    // 카테고리 월별 히스토리
    const entry = { month: thisMonthLabel };
    newCats.forEach(c=>{ entry[c.label]=catTotal(c); });
    const prevHistory = prevSetup?.assetHistory || [];
    const newHistory = prevHistory.some(h=>h.month===thisMonthLabel)
      ? prevHistory.map(h=>h.month===thisMonthLabel?entry:h)
      : [...prevHistory, entry];
    // 통장별 일간 히스토리
    const accEntry = { date: todayStr };
    newCats.forEach(c=>c.accounts.forEach(a=>{ accEntry[String(a.id)] = a.amount||0; }));
    const prevAccHistory = prevSetup?.accountHistory || [];
    const newAccHistory = prevAccHistory.some(h=>h.date===todayStr)
      ? prevAccHistory.map(h=>h.date===todayStr?accEntry:h)
      : [...prevAccHistory, accEntry];
    return { assetHistory: newHistory, accountHistory: newAccHistory };
  };

  const saveAssets = (newCats) => {
    setSetup(s => {
      const { assetHistory, accountHistory } = buildSnapshot(newCats, s);
      return { ...s, assetCats: newCats, assetHistory, accountHistory };
    });
    setShowAssetModal(false);
  };

  const adjustAccount = (cats, accountId, delta) => {
    if (!accountId) return cats;
    return cats.map(c => ({
      ...c,
      accounts: c.accounts.map(a =>
        String(a.id) === String(accountId)
          ? { ...a, amount: Math.max(0, (a.amount||0) + delta) }
          : a
      )
    }));
  };

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({date:now.toISOString().slice(0,10),fromId:"",toId:"",amount:"",memo:"이체"});

  const addTransfer = () => {
    const { date, fromId, toId, amount, memo } = transferForm;
    if (!fromId || !toId || !amount || fromId === toId) return;
    const amt = parseInt(amount);
    const transferId = Date.now();
    // 이체 내역 2건 추가 (출금 + 입금)
    const txOut = { id: transferId,     date, type:"transfer", amount: amt, memo: memo||"이체", accountId: fromId, toAccountId: toId, member: 9999, category:"이체", isTransfer:true, transferPair: transferId+1 };
    const txIn  = { id: transferId+1,   date, type:"transfer", amount: amt, memo: memo||"이체", accountId: toId,   fromAccountId: fromId, member: 9999, category:"이체", isTransfer:true, isTransferIn:true, transferPair: transferId };
    setTransactions(prev => [...prev, txOut, txIn]);
    // 잔액 조정
    setSetup(s => {
      let newCats = adjustAccount(s.assetCats, fromId, -amt);
      newCats = adjustAccount(newCats, toId, amt);
      const { assetHistory, accountHistory } = buildSnapshot(newCats, s);
      return { ...s, assetCats: newCats, assetHistory, accountHistory };
    });
    setShowTransferModal(false);
    setTransferForm(f => ({...f, amount:"", memo:"이체"}));
  };

  const deleteTransfer = (tx) => {
    const amt = tx.amount;
    // 이체 쌍 둘 다 삭제
    setTransactions(prev => prev.filter(x => x.id !== tx.id && x.id !== tx.transferPair));
    // 잔액 복원
    setSetup(s => {
      let newCats = s.assetCats;
      if (tx.isTransferIn) {
        newCats = adjustAccount(newCats, tx.accountId, -amt);
        newCats = adjustAccount(newCats, tx.fromAccountId, amt);
      } else {
        newCats = adjustAccount(newCats, tx.accountId, amt);
        newCats = adjustAccount(newCats, tx.toAccountId, -amt);
      }
      const { assetHistory, accountHistory } = buildSnapshot(newCats, s);
      return { ...s, assetCats: newCats, assetHistory, accountHistory };
    });
  };

  const addTx = () => {
    if (!txForm.amount || !txForm.memo || !txForm.member) return;
    const amt = parseInt(txForm.amount);
    if (editTxId) {
      // 수정 모드: 기존 내역 교체 (통장 잔액은 건드리지 않음)
      setTransactions(prev => prev.map(x => x.id === editTxId ? { ...x, ...txForm, amount: amt, member: parseInt(txForm.member) } : x));
      setEditTxId(null);
    } else {
      // 신규 추가
      const tx = { id: Date.now(), ...txForm, amount: amt, member: parseInt(txForm.member) };
      setTransactions(prev => [...prev, tx]);
      if (txForm.accountId && !txForm.cardId) {
        const delta = txForm.type === "income" ? amt : -amt;
        setSetup(s => {
          const newCats = adjustAccount(s.assetCats, txForm.accountId, delta);
          const { assetHistory, accountHistory } = buildSnapshot(newCats, s);
          return { ...s, assetCats: newCats, assetHistory, accountHistory };
        });
      }
    }
    setShowTxModal(false);
    setLastMember(txForm.member);
    setTxForm(f => ({ ...f, amount: "", memo: "", accountId: "", cardId: "" }));
  };

  const deleteTx = (tx) => {
    if (tx.isTransfer) { deleteTransfer(tx); return; }
    setTransactions(prev => prev.filter(x => x.id !== tx.id));
    // 카드결제 내역이면 통장 잔액 복원 불필요
    if (tx.accountId && !tx.cardId) {
      const delta = tx.type === "income" ? -tx.amount : tx.amount;
      setSetup(s => {
        const newCats = adjustAccount(s.assetCats, tx.accountId, delta);
        const { assetHistory, accountHistory } = buildSnapshot(newCats, s);
        return { ...s, assetCats: newCats, assetHistory, accountHistory };
      });
    }
  };

  // ── 로딩 화면
  if (loading) return (
    <div style={{minHeight:"100vh",background:"#F5F0E8",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{fontSize:40}}>🏡</div>
      <div style={{width:32,height:32,border:"3px solid #E5E0D5",borderTop:"3px solid #4A6FA5",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{fontSize:14,color:"#999"}}>가족 데이터 불러오는 중…</div>
    </div>
  );

  if (!setup) return <SetupWizard onComplete={(data)=>setSetup(data)}/>;

  const CSS=`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D4C9B5;border-radius:3px}.card{background:white;border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.05)}.inp{width:100%;padding:10px 13px;border:1.5px solid #E5E0D5;border-radius:9px;font-family:inherit;font-size:14px;outline:none;background:#FAFAF7;transition:border .2s}.inp:focus{border-color:#4A6FA5}.sel{width:100%;padding:10px 13px;border:1.5px solid #E5E0D5;border-radius:9px;font-family:inherit;font-size:14px;outline:none;background:#FAFAF7}.btn-b{background:#4A6FA5;color:white;border:none;border-radius:11px;padding:12px 20px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600}.btn-g{background:#F0EBE0;color:#555;border:none;border-radius:11px;padding:12px 20px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:500}.tx-row{display:flex;align-items:center;gap:11px;padding:12px 17px;border-bottom:1px solid #F5F0E8;transition:background .15s}.tx-row:hover{background:#FAFAF7}.tx-row:last-child{border-bottom:none}.overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:flex-end;justify-content:center}.sheet{background:white;border-radius:24px 24px 0 0;padding:26px 22px 48px;width:100%;max-width:500px;height:92vh;overflow-y:auto}.tt{display:flex;background:#F0EBE0;border-radius:10px;padding:3px;margin-bottom:14px}.tb{flex:1;padding:9px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;background:transparent;transition:all .2s}.tb.on{background:white;box-shadow:0 1px 4px rgba(0,0,0,.1)}.chip{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1.5px solid transparent;transition:all .2s}.nav-tab{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;padding:8px 4px;border:none;background:none;cursor:pointer;font-family:inherit;border-radius:10px;transition:background .2s}@keyframes up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}.up{animation:up .25s ease}`;

  return (
    <div style={{fontFamily:"'Noto Sans KR',sans-serif",minHeight:"100vh",background:"#F5F0E8",color:"#2A2A2A"}}>
      <style>{CSS}</style>

      {/* 헤더 */}
      <div style={{background:"white",borderBottom:"1px solid #EDE8DE",padding:"13px 17px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:600,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:10,color:"#bbb",letterSpacing:"0.1em"}}>FAMILY BUDGET</div>
            <div style={{fontSize:18,fontWeight:700}}>우리 가족 가계부 🏡</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {saving
              ? <span style={{fontSize:11,color:"#aaa"}}>저장 중…</span>
              : lastSaved && <span style={{fontSize:11,color:"#bbb"}}>✓ 저장됨</span>
            }
            <button style={{background:"#F0EBE0",border:"none",borderRadius:10,padding:"8px 11px",fontSize:15,cursor:"pointer"}} onClick={()=>setShowSettingsModal(true)}>⚙️</button>
            <button className="btn-g" style={{padding:"8px 13px",fontSize:13}} onClick={()=>setShowTransferModal(true)}>🔄 이체</button>
            {cards.length>0 && <button className="btn-g" style={{padding:"8px 13px",fontSize:13}} onClick={()=>setShowBulkCardModal(true)}>💳 일괄</button>}
            <button className="btn-b" style={{padding:"8px 15px"}} onClick={()=>{
              setEditTxId(null);
              setTxForm({date:now.toISOString().slice(0,10),type:"expense",amount:"",category:"식비",memo:"",member:lastMember,accountId:"",cardId:""});
              setShowTxModal(true);
            }}>+ 추가</button>
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div style={{background:"white",borderBottom:"1px solid #EDE8DE"}}>
        <div style={{maxWidth:600,margin:"0 auto",display:"flex",padding:"6px 8px"}}>
          {[["dashboard","📊","대시보드"],["assets","📈","자산"],["transactions","📋","내역"],["recurring","🔁","고정지출"],["analysis","🔍","분석"]].map(([id,icon,label])=>(
            <button key={id} className="nav-tab" onClick={()=>setTab(id)} style={{background:tab===id?"#EEF2F9":"none"}}>
              <span style={{fontSize:18}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:tab===id?700:400,color:tab===id?"#4A6FA5":"#999"}}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"16px 13px 60px"}}>

        {/* ── 대시보드 ── */}
        {tab==="dashboard" && (()=>{
          const activeMem = dashMember ? members.find(m=>m.id===dashMember) : null;
          const dashTx = dashMember ? monthTx.filter(t=>t.member===dashMember) : monthTx;
          const dashIncome  = dashTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
          const dashExpense = dashTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
          const dashBalance = dashIncome - dashExpense;
          const donutData = (() => {
            const map={};
            dashTx.filter(t=>t.type==="expense").forEach(t=>{ map[t.category]=(map[t.category]||0)+t.amount; });
            return Object.entries(map).map(([name,value])=>({name,value,...(EXPENSE_CATEGORIES[name]||{})})).sort((a,b)=>b.value-a.value);
          })();
          return (
          <div className="up" style={{display:"flex",flexDirection:"column",gap:13}}>
            {/* 이번 달 수지 메인 카드 */}
            <div style={{background:"linear-gradient(135deg,#4A6FA5,#3257A0)",borderRadius:20,padding:"20px 22px",color:"white"}}>
              <div style={{fontSize:11,opacity:.75,marginBottom:2}}>
                {thisMonthLabel} {activeMem ? `· ${activeMem.emoji} ${activeMem.name}` : "전체"}
              </div>
              <div style={{fontSize:32,fontWeight:700,marginBottom:3}}>{dashBalance>=0?"+":""}{fmtShort(dashBalance)}</div>
              <div style={{fontSize:12,opacity:.7,marginBottom:14}}>
                저축률 {dashIncome ? Math.round((dashBalance/dashIncome)*100) : 0}%
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"10px 13px"}}>
                  <div style={{fontSize:11,opacity:.8,marginBottom:2}}>💚 수입</div>
                  <div style={{fontSize:17,fontWeight:700}}>{fmtShort(dashIncome)}</div>
                </div>
                <div style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"10px 13px"}}>
                  <div style={{fontSize:11,opacity:.8,marginBottom:2}}>🔴 지출</div>
                  <div style={{fontSize:17,fontWeight:700}}>{fmtShort(dashExpense)}</div>
                </div>
              </div>
            </div>

            {/* 멤버 필터 칩 */}
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              <button onClick={()=>setDashMember(null)} className="chip"
                style={{border:`1.5px solid ${!dashMember?"#4A6FA5":"#E5E0D5"}`,background:!dashMember?"#EEF2F9":"white",color:!dashMember?"#4A6FA5":"#666"}}>
                👨‍👩‍👧 전체
              </button>
              {members.filter(m=>m.id!==9999).map((m,i)=>(
                <button key={m.id} onClick={()=>setDashMember(dashMember===m.id?null:m.id)} className="chip"
                  style={{border:`1.5px solid ${dashMember===m.id?MEMBER_COLORS[i%6]:"#E5E0D5"}`,background:dashMember===m.id?MEMBER_COLORS[i%6]+"22":"white",color:dashMember===m.id?MEMBER_COLORS[i%6]:"#666"}}>
                  {m.emoji} {m.name}
                </button>
              ))}
            </div>

            {/* 도넛차트 + 카테고리 리스트 */}
            {donutData.length > 0 ? (
              <div className="card">
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>
                  📊 카테고리별 지출
                  {activeMem && <span style={{fontSize:11,color:"#aaa",fontWeight:400,marginLeft:6}}>{activeMem.emoji} {activeMem.name}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center"}}>
                  <div style={{flexShrink:0}}>
                    <ResponsiveContainer width={150} height={150}>
                      <PieChart>
                        <Pie data={donutData} cx="50%" cy="50%" innerRadius={42} outerRadius={68}
                          dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
                          {donutData.map((d,i)=><Cell key={i} fill={d.color||ASSET_COLORS[i%7]}/>)}
                        </Pie>
                        <Tooltip formatter={v=>fmt(v)} contentStyle={{borderRadius:10,border:"none",fontFamily:"inherit",fontSize:11}}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:7,minWidth:0,paddingLeft:8}}>
                    {donutData.slice(0,6).map((d,i)=>(
                      <div key={d.name} style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:8,height:8,borderRadius:2,background:d.color||ASSET_COLORS[i%7],flexShrink:0}}/>
                        <span style={{fontSize:12,color:"#555",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.emoji} {d.name}</span>
                        <span style={{fontSize:12,fontWeight:600,color:"#333",whiteSpace:"nowrap"}}>{fmtShort(d.value)}</span>
                        <span style={{fontSize:10,color:"#bbb",width:28,textAlign:"right"}}>{dashExpense?Math.round(d.value/dashExpense*100):0}%</span>
                      </div>
                    ))}
                    {donutData.length > 6 && <div style={{fontSize:11,color:"#bbb"}}>외 {donutData.length-6}개</div>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{textAlign:"center",padding:"28px 0",color:"#bbb"}}>
                <div style={{fontSize:28,marginBottom:8}}>📊</div>
                <div style={{fontSize:13}}>이번 달 지출 내역이 없어요</div>
              </div>
            )}

            {/* 전체 선택 시: 멤버별 수지 비교 */}
            {!dashMember && members.filter(m=>m.id!==9999).length > 0 && (
              <div className="card">
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>👨‍👩‍👧 멤버별 이번 달</div>
                {members.filter(m=>m.id!==9999).map((m,i)=>{
                  const inc = monthTx.filter(t=>t.type==="income"&&t.member===m.id).reduce((s,t)=>s+t.amount,0);
                  const exp = monthTx.filter(t=>t.type==="expense"&&t.member===m.id).reduce((s,t)=>s+t.amount,0);
                  const bal = inc - exp;
                  const maxExp = Math.max(...members.filter(x=>x.id!==9999).map(x=>
                    monthTx.filter(t=>t.type==="expense"&&t.member===x.id).reduce((s,t)=>s+t.amount,0)
                  ),1);
                  return (
                    <div key={m.id} style={{marginBottom:11,cursor:"pointer"}} onClick={()=>setDashMember(m.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:18,width:26,flexShrink:0}}>{m.emoji}</span>
                        <span style={{fontSize:13,fontWeight:600,flex:1}}>{m.name}</span>
                        <span style={{fontSize:11,color:"#3BB273"}}>+{fmtShort(inc)}</span>
                        <span style={{fontSize:11,color:"#E07A5F",margin:"0 4px"}}>-{fmtShort(exp)}</span>
                        <span style={{fontSize:13,fontWeight:700,color:bal>=0?"#3BB273":"#E07A5F",minWidth:50,textAlign:"right"}}>{bal>=0?"+":""}{fmtShort(bal)}</span>
                      </div>
                      <div style={{height:5,background:"#F0EBE0",borderRadius:3,marginLeft:34}}>
                        <div style={{height:"100%",width:`${Math.min(100,(exp/maxExp)*100)}%`,background:MEMBER_COLORS[i%6],borderRadius:3,transition:"width .4s"}}/>
                      </div>
                    </div>
                  );
                })}
                <div style={{fontSize:11,color:"#bbb",textAlign:"center",marginTop:2}}>멤버를 탭하면 상세 보기</div>
              </div>
            )}

            {/* 자산 요약 */}
            <div className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,color:"#aaa",marginBottom:3}}>💎 총 가족 자산</div>
                <div style={{fontSize:22,fontWeight:700}}>{fmtShort(totalAssetValue)}</div>
                {assetCats.length > 0 && (
                  <div style={{fontSize:11,color:"#bbb",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {assetCats.map(c=>`${c.emoji} ${c.label} ${fmtShort(catTotal(c))}`).join("  ·  ")}
                  </div>
                )}
              </div>
              <button onClick={()=>setShowAssetModal(true)}
                style={{background:"#EEF2F9",border:"none",borderRadius:10,padding:"8px 13px",color:"#4A6FA5",fontSize:13,fontWeight:600,cursor:"pointer",flexShrink:0,marginLeft:12}}>
                수정 ✏️
              </button>
            </div>

          </div>
          );
        })()}

                {/* ── 자산 탭 ── */}
        {tab==="assets" && (
          <div className="up" style={{display:"flex",flexDirection:"column",gap:13}}>
            <div className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,color:"#aaa",marginBottom:2}}>총 가족 자산</div>
                <div style={{fontSize:26,fontWeight:700}}>{fmtShort(totalAssetValue)}</div>
              </div>
              <button onClick={()=>setShowAssetModal(true)} style={{background:"#EEF2F9",border:"none",borderRadius:10,padding:"8px 13px",color:"#4A6FA5",fontSize:13,fontWeight:600,cursor:"pointer"}}>수정 ✏️</button>
            </div>

            {assetCats.map((cat,ci)=>{
              const expanded = expandedCat[cat.id] === true;
              return (
                <div key={cat.id} className="card" style={{padding:0,overflow:"hidden"}}>
                  <div onClick={()=>setExpandedCat(p=>({...p,[cat.id]:!expanded}))}
                    style={{display:"flex",alignItems:"center",gap:11,padding:"14px 18px",cursor:"pointer",background:cat.color+"0D"}}>
                    <div style={{width:38,height:38,borderRadius:12,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.emoji}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600}}>{cat.label}</div>
                      <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{cat.accounts.length}개 계좌</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:700,color:cat.color}}>{fmtShort(catTotal(cat))}</div>
                      <div style={{fontSize:11,color:"#ccc",marginTop:2}}>전체의 {totalAssetValue?Math.round(catTotal(cat)/totalAssetValue*100):0}%</div>
                    </div>
                    <span style={{fontSize:12,color:"#ccc",marginLeft:4}}>{expanded?"▲":"▼"}</span>
                  </div>
                  {expanded && (
                    <div style={{padding:"8px 13px 13px",display:"flex",flexDirection:"column",gap:7}}>
                      {cat.accounts.map(acc=>(
                        <div key={acc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 13px",background:"#FAFAF7",borderRadius:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:9}}>
                            <div style={{width:7,height:7,borderRadius:2,background:cat.color,flexShrink:0}}/>
                            <span style={{fontSize:13,color:"#444"}}>{acc.name}</span>
                          </div>
                          <span style={{fontSize:14,fontWeight:700,color:"#2A2A2A"}}>{fmt(acc.amount)}</span>
                        </div>
                      ))}
                      <button onClick={()=>setShowAssetModal(true)}
                        style={{background:"none",border:`1.5px dashed ${cat.color}88`,borderRadius:9,padding:"7px",color:cat.color,fontSize:12,cursor:"pointer",width:"100%",fontFamily:"inherit",marginTop:2}}>
                        ✏️ 수정하기
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── 카드 섹션 ── */}
            {cards.length > 0 && (
              <div className="card" style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"14px 18px 10px",borderBottom:"1px solid #F5F0E8"}}>
                  <div style={{fontSize:14,fontWeight:700}}>💳 카드 미정산 잔액</div>
                </div>
                {cards.map(card => {
                  const bal = cardBalances[String(card.id)] || 0;
                  const mem = members.find(m=>m.id===card.memberId);
                  return (
                    <div key={card.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",borderBottom:"1px solid #F5F0E8"}}>
                      <div style={{width:38,height:38,borderRadius:11,background:"#FFF0EE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>💳</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:500}}>{cardLabel(card, members)}</div>
                      </div>
                      <div style={{textAlign:"right",marginRight:8}}>
                        <div style={{fontSize:15,fontWeight:700,color:bal>0?"#E07A5F":"#aaa"}}>{fmtShort(bal)}</div>
                        <div style={{fontSize:11,color:"#bbb",marginTop:2}}>미정산</div>
                      </div>
                      <button onClick={()=>{setShowSettleModal(card);setSettleAccountId("");}}
                        disabled={bal===0}
                        style={{background:bal>0?"#E07A5F":"#eee",border:"none",borderRadius:9,padding:"8px 13px",color:bal>0?"white":"#bbb",fontSize:12,fontWeight:600,cursor:bal>0?"pointer":"default",flexShrink:0}}>
                        정산
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── 자산 추이 차트 ── */}
            {(assetHistory.length>0 || accountHistory.length>0) && assetCats.length>0 && (()=>{
              const allAccounts = assetCats.flatMap(c=>c.accounts.map(a=>({...a,catLabel:c.label,catColor:c.color,catId:c.id})));

              // 집계 함수
              const aggregate = (entries, keyFn) => {
                const map = {};
                entries.forEach(e => {
                  const k = keyFn(e.date||e.month||"");
                  map[k] = e; // 같은 기간 중 마지막 값
                });
                return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);
              };

              let chartData = [];
              let lines = [];

              if (chartView==="category") {
                // 카테고리별: assetHistory 기반
                const raw = assetHistory.map(h=>({...h, _key: h.month}));
                if (chartPeriod==="yearly") {
                  const map={};
                  raw.forEach(h=>{ const y=(h.month||"").slice(0,4); map[y]=h; });
                  chartData = Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>({...v,_key:v.month?.slice(0,4)||""}));
                } else {
                  chartData = raw;
                }
                lines = assetCats.map(c=>({key:c.label,color:c.color,label:c.label}));

              } else {
                // 통장별: accountHistory 기반
                const focusCat = chartFocusCat ? assetCats.find(c=>c.id===chartFocusCat) : null;
                const targetAccs = focusCat ? focusCat.accounts : allAccounts;

                let raw = [...accountHistory].sort((a,b)=>(a.date||"").localeCompare(b.date||""));

                if (chartPeriod==="monthly") {
                  raw = aggregate(raw, d=>d.slice(0,7));
                  chartData = raw.map(e=>({...e,_key:e.date?.slice(0,7)||""}));
                } else if (chartPeriod==="yearly") {
                  raw = aggregate(raw, d=>d.slice(0,4));
                  chartData = raw.map(e=>({...e,_key:e.date?.slice(0,4)||""}));
                } else {
                  chartData = raw.map(e=>({...e,_key:e.date||""}));
                }
                lines = targetAccs.map((a,i)=>({key:String(a.id),color:focusCat?focusCat.color:ASSET_COLORS[i%7],label:a.name}));
              }

              const xKey = "_key";

              return (
                <div className="card">
                  <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>자산 변동 추이</div>

                  {/* 뷰 토글 */}
                  <div style={{display:"flex",gap:7,marginBottom:10}}>
                    <div className="tt" style={{flex:"none",marginBottom:0}}>
                      {[["category","📊 카테고리"],["account","🏦 통장별"]].map(([v,l])=>(
                        <button key={v} className={`tb ${chartView===v?"on":""}`} onClick={()=>setChartView(v)} style={{color:chartView===v?"#4A6FA5":"#999",fontSize:12,padding:"7px 10px",whiteSpace:"nowrap"}}>{l}</button>
                      ))}
                    </div>
                    <div className="tt" style={{flex:"none",marginBottom:0}}>
                      {[["daily","일별"],["monthly","월별"],["yearly","연도별"]].map(([v,l])=>(
                        <button key={v} className={`tb ${chartPeriod===v?"on":""}`} onClick={()=>setChartPeriod(v)} style={{color:chartPeriod===v?"#4A6FA5":"#999",fontSize:12,padding:"7px 10px",whiteSpace:"nowrap"}}>{l}</button>
                      ))}
                    </div>
                  </div>

                  {/* 통장별일 때 카테고리 필터 */}
                  {chartView==="account" && (
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                      <button onClick={()=>setChartFocusCat(null)} className="chip"
                        style={{border:`1.5px solid ${!chartFocusCat?"#4A6FA5":"#E5E0D5"}`,background:!chartFocusCat?"#EEF2F9":"white",color:!chartFocusCat?"#4A6FA5":"#666"}}>전체</button>
                      {assetCats.map(c=>(
                        <button key={c.id} onClick={()=>setChartFocusCat(chartFocusCat===c.id?null:c.id)} className="chip"
                          style={{border:`1.5px solid ${chartFocusCat===c.id?c.color:"#E5E0D5"}`,background:chartFocusCat===c.id?c.color+"22":"white",color:chartFocusCat===c.id?c.color:"#666"}}>
                          {c.emoji} {c.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {chartData.length < 2 ? (
                    <div style={{textAlign:"center",padding:"24px 0",color:"#aaa",fontSize:13}}>
                      📅 내역이 쌓이면 추이가 표시돼요
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={chartData}>
                        <defs>
                          {lines.map(l=>(
                            <linearGradient key={l.key} id={`gh_${l.key}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={l.color} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={l.color} stopOpacity={0}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0"/>
                        <XAxis dataKey={xKey} tick={{fontSize:10,fill:"#aaa"}} axisLine={false} tickLine={false}
                          tickFormatter={v=>chartPeriod==="daily"?v.slice(5):chartPeriod==="monthly"?v.slice(2):v}/>
                        <YAxis tick={{fontSize:10,fill:"#aaa"}} tickFormatter={v=>v>=100000000?`${(v/100000000).toFixed(0)}억`:v>=10000?`${Math.round(v/10000)}만`:`${v}`} axisLine={false} tickLine={false}/>
                        <Tooltip formatter={(v,name)=>[fmt(v), lines.find(l=>l.key===name)?.label||name]} contentStyle={{borderRadius:12,border:"none",fontFamily:"inherit",fontSize:12}}/>
                        <Legend formatter={name=>lines.find(l=>l.key===name)?.label||name}/>
                        {lines.map((l,i)=>(
                          <Area key={l.key} type="monotone" dataKey={l.key}
                            stackId={chartView==="category"?"1":undefined}
                            stroke={l.color} fill={`url(#gh_${l.key})`} strokeWidth={2}
                            name={l.key}/>
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              );
            })()}
            <div className="card" style={{textAlign:"center",padding:16,color:"#aaa",fontSize:13}}>
              💡 내역을 추가하거나 자산 수정 시 자동으로 추이가 기록돼요
            </div>
          </div>
        )}

        {/* ── 내역 탭 ── */}
        {tab==="transactions" && (
          <div className="up" style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              <button onClick={()=>setSelectedMember(null)} className="chip" style={{border:`1.5px solid ${!selectedMember?"#4A6FA5":"#E5E0D5"}`,background:!selectedMember?"#EEF2F9":"white",color:!selectedMember?"#4A6FA5":"#666"}}>전체</button>
              {members.map((m,i)=>(
                <button key={m.id} onClick={()=>setSelectedMember(selectedMember===m.id?null:m.id)} className="chip"
                  style={{border:`1.5px solid ${selectedMember===m.id?MEMBER_COLORS[i%6]:"#E5E0D5"}`,background:selectedMember===m.id?MEMBER_COLORS[i%6]+"22":"white",color:selectedMember===m.id?MEMBER_COLORS[i%6]:"#666"}}>
                  {m.emoji} {m.name}
                </button>
              ))}
            </div>

            {/* 합계 요약 */}
            {(() => {
              const visibleTx = filteredTx.filter(t => !t.isTransfer || !t.isTransferIn);
              const sumIncome  = visibleTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
              const sumExpense = visibleTx.filter(t=>t.type==="expense"&&!t.isCardSettle).reduce((s,t)=>s+t.amount,0);
              const sumBalance = sumIncome - sumExpense;
              return (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <div className="card" style={{padding:"12px 13px",textAlign:"center"}}>
                    <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>💚 수입</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#3BB273"}}>{fmtShort(sumIncome)}</div>
                  </div>
                  <div className="card" style={{padding:"12px 13px",textAlign:"center"}}>
                    <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>🔴 지출</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#E07A5F"}}>{fmtShort(sumExpense)}</div>
                  </div>
                  <div className="card" style={{padding:"12px 13px",textAlign:"center"}}>
                    <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>💰 잔여</div>
                    <div style={{fontSize:14,fontWeight:700,color:sumBalance>=0?"#3BB273":"#E07A5F"}}>{sumBalance>=0?"+":""}{fmtShort(sumBalance)}</div>
                  </div>
                </div>
              );
            })()}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              {filteredTx.length===0 ? (
                <div style={{textAlign:"center",padding:40,color:"#aaa"}}>
                  <div style={{fontSize:32,marginBottom:10}}>📋</div>
                  <div style={{fontSize:13}}>내역이 없어요</div>
                </div>
              ) : filteredTx.map(t=>{
                const cat=CATEGORIES[t.category];
                const mem=members.find(m=>m.id===t.member);
                const allAccounts = assetCats.flatMap(c=>c.accounts);
                if (t.isTransfer && t.isTransferIn) return null; // 이체 입금 행은 숨김
                const isTransfer = t.isTransfer;
                const fromAcc = isTransfer ? allAccounts.find(a=>String(a.id)===String(t.accountId)) : null;
                const toAcc   = isTransfer ? allAccounts.find(a=>String(a.id)===String(t.toAccountId)) : null;
                return (
                  <div key={t.id} className="tx-row">
                    <div style={{width:37,height:37,borderRadius:11,background:isTransfer?"#EEF2F9":cat?.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19}}>
                      {isTransfer?"🔄":cat?.emoji}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.memo}</div>
                      <div style={{fontSize:11,color:"#aaa",marginTop:2}}>
                        {t.date} · {isTransfer
                          ? `${fromAcc?.name||"?"} → ${toAcc?.name||"?"}`
                          : `${t.category} · ${mem?.emoji}${mem?.name}${t.cardId ? ` · 💳 ${cardLabel(cards.find(c=>String(c.id)===String(t.cardId))||{name:"카드"}, members)}` : t.accountId?` · 💳 ${allAccounts.find(a=>String(a.id)===String(t.accountId))?.name||""}`:""}${t.isCardSettle?" · 카드 정산":""}`}
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:700,color:isTransfer?"#4A6FA5":t.type==="income"?"#3BB273":"#E07A5F",whiteSpace:"nowrap",marginRight:5}}>
                      {isTransfer?`↔ ${fmtShort(t.amount)}`:t.type==="income"?`+${fmtShort(t.amount)}`:`-${fmtShort(t.amount)}`}
                    </div>
                    <button onClick={()=>{
                      setEditTxId(t.id);
                      setTxForm({...t, amount:String(t.amount), member:String(t.member), cardId:t.cardId||"", accountId:t.accountId||""});
                      setShowTxModal(true);
                    }} style={{background:"none",border:"none",color:"#ccc",fontSize:13,cursor:"pointer",padding:4}}>✏️</button>
                    <button onClick={()=>deleteTx(t)} style={{background:"none",border:"none",color:"#ddd",fontSize:13,cursor:"pointer",padding:4}}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 고정지출 탭 ── */}
        {tab==="recurring" && (
          <div className="up" style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{background:"linear-gradient(135deg,#E07A5F,#C4614A)",borderRadius:20,padding:"18px 22px",color:"white"}}>
              <div style={{fontSize:11,opacity:.8,marginBottom:3}}>매월 고정 지출</div>
              <div style={{fontSize:28,fontWeight:700}}>{fmtShort(recurringItems.filter(r=>r.active!==false&&r.type==="expense"&&(r.day||1)<=now.getDate()).reduce((s,r)=>s+r.amount,0))}</div>
              <div style={{fontSize:12,opacity:.75,marginTop:4}}>{recurringItems.filter(r=>r.active!==false).length}개 항목 · 매달 자동 적용</div>
            </div>

            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"16px 18px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #F5F0E8"}}>
                <div style={{fontSize:14,fontWeight:700}}>고정 항목 관리</div>
                <button onClick={()=>{setRForm({memo:"",amount:"",category:"식비",type:"expense",day:1,member:"",accountId:"",toAccountId:""});setShowRecurringModal("new");}}
                  style={{background:"#EEF2F9",border:"none",borderRadius:9,padding:"7px 13px",color:"#4A6FA5",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ 추가</button>
              </div>
              {recurringItems.length === 0 ? (
                <div style={{textAlign:"center",padding:36,color:"#aaa"}}>
                  <div style={{fontSize:32,marginBottom:10}}>🔁</div>
                  <div style={{fontSize:13,marginBottom:6}}>고정지출 항목이 없어요</div>
                  <div style={{fontSize:12}}>월세, 보험료, 구독료 등을 등록해보세요</div>
                </div>
              ) : recurringItems.map((r, idx) => {
                const cat = CATEGORIES[r.category];
                const acc = assetCats.flatMap(c=>c.accounts).find(a=>String(a.id)===String(r.accountId));
                const toAcc = r.type==="transfer" ? assetCats.flatMap(c=>c.accounts).find(a=>String(a.id)===String(r.toAccountId)) : null;
                const isTransfer = r.type === "transfer";
                const moveUp = () => {
                  if (idx===0) return;
                  setRecurringItems(prev => { const a=[...prev]; [a[idx-1],a[idx]]=[a[idx],a[idx-1]]; return a; });
                };
                const moveDown = () => {
                  setRecurringItems(prev => { if(idx>=prev.length-1) return prev; const a=[...prev]; [a[idx],a[idx+1]]=[a[idx+1],a[idx]]; return a; });
                };
                return (
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:11,padding:"13px 18px",borderBottom:"1px solid #F5F0E8",opacity:r.active===false?0.45:1}}>
                    {/* 순서 버튼 */}
                    <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                      <button onClick={moveUp} disabled={idx===0}
                        style={{background:"none",border:"none",color:idx===0?"#e0e0e0":"#bbb",fontSize:13,cursor:idx===0?"default":"pointer",padding:"1px 4px",lineHeight:1}}>▲</button>
                      <button onClick={moveDown} disabled={idx===recurringItems.length-1}
                        style={{background:"none",border:"none",color:idx===recurringItems.length-1?"#e0e0e0":"#bbb",fontSize:13,cursor:idx===recurringItems.length-1?"default":"pointer",padding:"1px 4px",lineHeight:1}}>▼</button>
                    </div>
                    <div style={{width:38,height:38,borderRadius:11,background:isTransfer?"#EEF2F9":cat?.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}>
                      {isTransfer?"🔄":cat?.emoji||"📦"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500}}>{r.memo}</div>
                      <div style={{fontSize:11,color:"#aaa",marginTop:2}}>
                        매월 {r.day}일 · {isTransfer ? `${acc?.name||"?"} → ${toAcc?.name||"?"}` : `${r.category}${acc?` · 💳${acc.name}`:""}`}
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:isTransfer?"#4A6FA5":r.type==="income"?"#3BB273":"#E07A5F"}}>
                        {isTransfer?"↔":r.type==="income"?"+":"-"}{fmtShort(r.amount)}
                      </div>
                      <div style={{fontSize:11,color:"#bbb",marginTop:2}}>매월</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:4}}>
                      <button onClick={()=>setRecurringItems(prev=>prev.map(x=>x.id===r.id?{...x,active:x.active===false?true:false}:x))}
                        style={{background:r.active===false?"#F0EBE0":"#E8F5EE",border:"none",borderRadius:7,padding:"4px 8px",fontSize:11,cursor:"pointer",color:r.active===false?"#aaa":"#3BB273",fontWeight:600}}>
                        {r.active===false?"OFF":"ON"}
                      </button>
                      <button onClick={()=>{setRForm({...r,amount:String(r.amount),toAccountId:r.toAccountId||""});setShowRecurringModal(r);}}
                        style={{background:"#F5F0E8",border:"none",borderRadius:7,padding:"4px 8px",fontSize:11,cursor:"pointer",color:"#888"}}>
                        수정
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {recurringItems.length > 0 && (
              <div className="card">
                <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📅 이번 달 적용 현황</div>
                {recurringItems.filter(r=>r.active!==false).map(r => {
                  const applied = transactions.some(t => t.isRecurring && t.recurringId===r.id && t.date.startsWith(thisMonth));
                  const cat = CATEGORIES[r.category];
                  return (
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                      <span style={{fontSize:16}}>{cat?.emoji||"📦"}</span>
                      <span style={{fontSize:13,flex:1}}>{r.memo}</span>
                      <span style={{fontSize:12,fontWeight:600,color:r.type==="income"?"#3BB273":"#E07A5F"}}>{r.type==="income"?"+":"-"}{fmtShort(r.amount)}</span>
                      <span style={{fontSize:11,background:applied?"#E8F5EE":"#FFF3E0",color:applied?"#3BB273":"#FF9F1C",padding:"3px 8px",borderRadius:20,fontWeight:600,whiteSpace:"nowrap"}}>
                        {applied?"✓ 적용됨":"⏳ 미적용"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 분석 탭 ── */}
        {tab==="analysis" && (
          <div className="up" style={{display:"flex",flexDirection:"column",gap:13}}>
            <div className="card">
              <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{thisMonthLabel} 분석</div>
              <div style={{fontSize:12,color:"#aaa",marginBottom:16}}>저축률 {totalIncome?Math.round((balance/totalIncome)*100):0}%</div>
              {categoryData.length===0 ? (
                <div style={{textAlign:"center",padding:30,color:"#aaa",fontSize:13}}>이번 달 지출 내역이 없어요</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={categoryData} layout="vertical" margin={{left:0,right:20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0" horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:10,fill:"#aaa"}} tickFormatter={v=>`${Math.round(v/10000)}만`} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:12}} axisLine={false} tickLine={false} width={45}
                      tickFormatter={v=>`${CATEGORIES[v]?.emoji||""} ${v}`}/>
                    <Tooltip formatter={v=>fmt(v)} contentStyle={{borderRadius:12,border:"none",fontFamily:"inherit",fontSize:12}}/>
                    <Bar dataKey="value" radius={[0,6,6,0]}>
                      {categoryData.map((d,i)=><Cell key={i} fill={d.color||ASSET_COLORS[i%7]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>멤버별 지출 비교</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={memberExpense.filter(m=>m.id!==9999)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0"/>
                  <XAxis dataKey="name" tick={{fontSize:12}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:"#aaa"}} tickFormatter={v=>`${Math.round(v/10000)}만`} axisLine={false} tickLine={false}/>
                  <Tooltip formatter={v=>fmt(v)} contentStyle={{borderRadius:12,border:"none",fontFamily:"inherit",fontSize:12}}/>
                  <Bar dataKey="expense" radius={[6,6,0,0]}>
                    {memberExpense.filter(m=>m.id!==9999).map((_,i)=><Cell key={i} fill={MEMBER_COLORS[i%6]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>수지 요약</div>
              {[["💚 총 수입",totalIncome,"#3BB273"],["🔴 총 지출",totalExpense,"#E07A5F"],["💰 잉여금",balance,balance>=0?"#3BB273":"#E07A5F"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #F5F0E8"}}>
                  <span style={{fontSize:13,color:"#666"}}>{l}</span>
                  <span style={{fontSize:15,fontWeight:700,color:c}}>{v>=0?"+":""}{fmt(v)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0"}}>
                <span style={{fontSize:13,color:"#666"}}>📊 저축률</span>
                <span style={{fontSize:15,fontWeight:700,color:"#4A6FA5"}}>{totalIncome?Math.round((balance/totalIncome)*100):0}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 거래 추가 모달 ── */}
      {showTxModal && (
        <div className="overlay" onClick={()=>{setShowTxModal(false);setEditTxId(null);}}>
          <div className="sheet" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 20px"}}/>
            <div style={{fontSize:17,fontWeight:700,marginBottom:16}}>{editTxId?"내역 수정":"내역 추가"}</div>
            <div className="tt">
              <button className={`tb ${txForm.type==="expense"?"on":""}`} onClick={()=>setTxForm({...txForm,type:"expense",category:"식비"})} style={{color:txForm.type==="expense"?"#E07A5F":"#999"}}>🔴 지출</button>
              <button className={`tb ${txForm.type==="income"?"on":""}`} onClick={()=>setTxForm({...txForm,type:"income",category:"급여"})} style={{color:txForm.type==="income"?"#3BB273":"#999"}}>💚 수입</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:11}}>
              <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>날짜</label>
                <input className="inp" type="date" value={txForm.date} onChange={e=>setTxForm({...txForm,date:e.target.value})}/></div>
              <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>금액 (원)</label>
                <input className="inp" type="number" placeholder="0" value={txForm.amount} onChange={e=>setTxForm({...txForm,amount:e.target.value})}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:11}}>
              <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>카테고리</label>
                <select className="sel" value={txForm.category} onChange={e=>setTxForm({...txForm,category:e.target.value})}>
                  {Object.entries(txForm.type==="income"?INCOME_CATEGORIES:EXPENSE_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.emoji} {k}</option>)}
                </select></div>
              <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>가족 멤버</label>
                <select className="sel" value={String(txForm.member||"")} onChange={e=>setTxForm({...txForm,member:e.target.value})}>
                  <option value="">선택</option>
                  {members.map(m=><option key={m.id} value={String(m.id)}>{m.emoji} {m.name}</option>)}
                </select></div>
            </div>
            <div style={{marginBottom:11}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>
                {txForm.type==="income" ? "💳 입금 통장 (선택)" : "💳 결제 수단 (선택)"}
              </label>
              {txForm.type==="expense" && cards.length>0 && (
                <div className="tt" style={{marginBottom:7}}>
                  <button className={`tb ${!txForm.cardId?"on":""}`} onClick={()=>setTxForm({...txForm,cardId:""})} style={{color:!txForm.cardId?"#4A6FA5":"#999",fontSize:12}}>🏦 통장</button>
                  <button className={`tb ${txForm.cardId?"on":""}`} onClick={()=>setTxForm({...txForm,accountId:"",cardId:String(cards[0]?.id||"")})} style={{color:txForm.cardId?"#E07A5F":"#999",fontSize:12}}>💳 카드</button>
                </div>
              )}
              {txForm.cardId ? (
                <select className="sel" value={txForm.cardId} onChange={e=>setTxForm({...txForm,cardId:e.target.value,accountId:""})}>
                  {cards.map(c=><option key={c.id} value={c.id}>{cardLabel(c, members)}</option>)}
                </select>
              ) : (
                <select className="sel" value={txForm.accountId} onChange={e=>setTxForm({...txForm,accountId:e.target.value})}>
                  <option value="">연결 안 함</option>
                  {assetCats.map(cat=>cat.accounts.map(acc=>(
                    <option key={acc.id} value={acc.id}>{cat.emoji} {cat.label} › {acc.name} ({fmtShort(acc.amount)})</option>
                  )))}
                </select>
              )}
              {txForm.accountId && !txForm.cardId && (
                <div style={{fontSize:11,color:txForm.type==="income"?"#3BB273":"#E07A5F",marginTop:5,paddingLeft:4}}>
                  {txForm.type==="income" ? "▲ 저장 시 잔액이 늘어납니다" : "▼ 저장 시 잔액이 줄어듭니다"}
                </div>
              )}
              {txForm.cardId && <div style={{fontSize:11,color:"#FF9F1C",marginTop:5,paddingLeft:4}}>💳 카드값 누적 · 아래에서 실제 사용한 멤버도 선택해주세요</div>}
            </div>
            <div style={{marginBottom:20}}><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>메모</label>
              <input className="inp" placeholder="내역을 입력하세요" value={txForm.memo} onChange={e=>setTxForm({...txForm,memo:e.target.value})}/></div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn-g" style={{flex:1}} onClick={()=>{setShowTxModal(false);setEditTxId(null);}}>취소</button>
              <button className="btn-b" style={{flex:2}} onClick={addTx}>{editTxId?"수정 완료":"추가하기"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 카드 일괄 입력 모달 ── */}
      {showBulkCardModal && <BulkCardModal
          cards={cards} members={members} assetCats={assetCats}
          today={now.toISOString().slice(0,10)}
          defaultCardId={lastCardId}
          defaultMemberId={lastCardMemberId}
          onSave={(txs, cardId, memberId)=>{
            setTransactions(prev=>[...prev, ...txs]);
            setLastCardId(cardId);
            setLastCardMemberId(memberId);
            setShowBulkCardModal(false);
          }}
          onClose={()=>setShowBulkCardModal(false)}
        />}

      {/* ── 카드 정산 모달 ── */}
      {showSettleModal && (
        <div className="overlay" onClick={()=>setShowSettleModal(null)}>
          <div className="sheet" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 20px"}}/>
            <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>💳 카드 정산</div>
            <div style={{fontSize:13,color:"#666",marginBottom:18}}>{showSettleModal.name} 미정산 잔액</div>
            <div style={{fontSize:32,fontWeight:700,color:"#E07A5F",textAlign:"center",marginBottom:20}}>
              {fmt(cardBalances[String(showSettleModal.id)]||0)}
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:6}}>출금 통장 선택</label>
              <select className="sel" value={settleAccountId} onChange={e=>setSettleAccountId(e.target.value)}>
                <option value="">통장을 선택하세요</option>
                {assetCats.map(cat=>cat.accounts.map(acc=>(
                  <option key={acc.id} value={acc.id}>{cat.emoji} {cat.label} › {acc.name} ({fmtShort(acc.amount)})</option>
                )))}
              </select>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn-g" style={{flex:1}} onClick={()=>setShowSettleModal(null)}>취소</button>
              <button className="btn-b" style={{flex:2,background:"#E07A5F"}} onClick={settleCard} disabled={!settleAccountId}>정산하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 고정지출 추가/수정 모달 ── */}
      {showRecurringModal && (()=>{
        const isNew = showRecurringModal === "new";
        const editing = isNew ? null : showRecurringModal;
        const isTransfer = rForm.type === "transfer";
        const save = () => {
          if (!rForm.amount || !rForm.memo) return;
          if (isTransfer && (!rForm.accountId || !rForm.toAccountId)) return;
          const item = { ...rForm, id: isNew ? Date.now() : editing.id, amount: parseInt(rForm.amount), active: true };
          setRecurringItems(prev => isNew ? [...prev, item] : prev.map(x=>x.id===item.id?item:x));
          setShowRecurringModal(false);
        };
        const remove = () => {
          if (window.confirm("이 고정항목을 삭제할까요?")) {
            setRecurringItems(prev => prev.filter(x=>x.id!==editing.id));
            setShowRecurringModal(false);
          }
        };
        return (
          <div className="overlay" onClick={()=>setShowRecurringModal(false)}>
            <div className="sheet" onClick={e=>e.stopPropagation()}>
              <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 20px"}}/>
              <div style={{fontSize:17,fontWeight:700,marginBottom:16}}>{isNew?"고정항목 추가":"고정항목 수정"}</div>
              {/* 타입 선택 */}
              <div className="tt" style={{marginBottom:14}}>
                <button className={`tb ${rForm.type==="expense"?"on":""}`} onClick={()=>setRForm({...rForm,type:"expense",category:"식비"})} style={{color:rForm.type==="expense"?"#E07A5F":"#999"}}>🔴 지출</button>
                <button className={`tb ${rForm.type==="income"?"on":""}`} onClick={()=>setRForm({...rForm,type:"income",category:"급여"})} style={{color:rForm.type==="income"?"#3BB273":"#999"}}>💚 수입</button>
                <button className={`tb ${rForm.type==="transfer"?"on":""}`} onClick={()=>setRForm({...rForm,type:"transfer"})} style={{color:rForm.type==="transfer"?"#4A6FA5":"#999"}}>🔄 이체</button>
              </div>
              <div style={{marginBottom:11}}><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>항목명</label>
                <input className="inp" placeholder={isTransfer?"예: 청약 자동이체":"예: 월세, 보험료"} value={rForm.memo} onChange={e=>setRForm({...rForm,memo:e.target.value})}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:11}}>
                <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>금액 (원)</label>
                  <input className="inp" type="number" placeholder="0" value={rForm.amount} onChange={e=>setRForm({...rForm,amount:e.target.value})}/></div>
                <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>매월 몇 일</label>
                  <select className="sel" value={rForm.day} onChange={e=>setRForm({...rForm,day:parseInt(e.target.value)})}>
                    {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}일</option>)}
                  </select></div>
              </div>

              {isTransfer ? (
                /* 이체 타입: 출금/입금 통장 선택 */
                <>
                  <div style={{marginBottom:11}}>
                    <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>💸 출금 통장</label>
                    <select className="sel" value={rForm.accountId} onChange={e=>setRForm({...rForm,accountId:e.target.value})}>
                      <option value="">선택</option>
                      {assetCats.map(cat=>cat.accounts.map(acc=>(
                        <option key={acc.id} value={acc.id}>{cat.emoji} {cat.label} › {acc.name}</option>
                      )))}
                    </select>
                  </div>
                  <div style={{textAlign:"center",fontSize:18,margin:"2px 0"}}>↓</div>
                  <div style={{marginBottom:22}}>
                    <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>💰 입금 통장</label>
                    <select className="sel" value={rForm.toAccountId} onChange={e=>setRForm({...rForm,toAccountId:e.target.value})}>
                      <option value="">선택</option>
                      {assetCats.map(cat=>cat.accounts.map(acc=>(
                        <option key={acc.id} value={acc.id} disabled={String(acc.id)===String(rForm.accountId)}>{cat.emoji} {cat.label} › {acc.name}</option>
                      )))}
                    </select>
                  </div>
                </>
              ) : (
                /* 수입/지출 타입: 카테고리, 멤버, 연결통장 */
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:11}}>
                    <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>카테고리</label>
                      <select className="sel" value={rForm.category} onChange={e=>setRForm({...rForm,category:e.target.value})}>
                        {Object.entries(rForm.type==="income"?INCOME_CATEGORIES:EXPENSE_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.emoji} {k}</option>)}
                      </select></div>
                    <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>담당 멤버</label>
                      <select className="sel" value={rForm.member} onChange={e=>setRForm({...rForm,member:e.target.value})}>
                        <option value="">선택</option>
                        {members.map(m=><option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
                      </select></div>
                  </div>
                  <div style={{marginBottom:22}}>
                    <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>💳 연결 통장 (선택)</label>
                    <select className="sel" value={rForm.accountId} onChange={e=>setRForm({...rForm,accountId:e.target.value})}>
                      <option value="">연결 안 함</option>
                      {assetCats.map(cat=>cat.accounts.map(acc=>(
                        <option key={acc.id} value={acc.id}>{cat.emoji} {cat.label} › {acc.name}</option>
                      )))}
                    </select>
                  </div>
                </>
              )}

              <div style={{display:"flex",gap:10}}>
                {!isNew && <button onClick={remove} style={{flex:1,padding:12,background:"#FFF0EE",border:"1.5px solid #F5C0B8",borderRadius:11,color:"#E07A5F",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>삭제</button>}
                <button className="btn-g" style={{flex:1}} onClick={()=>setShowRecurringModal(false)}>취소</button>
                <button className="btn-b" style={{flex:2}} onClick={save}>저장하기</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 이체 모달 ── */}
      {showTransferModal && (
        <div className="overlay" onClick={()=>setShowTransferModal(false)}>
          <div className="sheet" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 20px"}}/>
            <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>🔄 통장 간 이체</div>
            <div style={{fontSize:12,color:"#aaa",marginBottom:18}}>잔액이 자동으로 조정돼요</div>
            <div style={{marginBottom:11}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>날짜</label>
              <input className="inp" type="date" value={transferForm.date} onChange={e=>setTransferForm({...transferForm,date:e.target.value})}/>
            </div>
            <div style={{marginBottom:11}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>💸 출금 통장</label>
              <select className="sel" value={transferForm.fromId} onChange={e=>setTransferForm({...transferForm,fromId:e.target.value})}>
                <option value="">선택</option>
                {assetCats.map(cat=>cat.accounts.map(acc=>(
                  <option key={acc.id} value={acc.id}>{cat.emoji} {cat.label} › {acc.name} ({fmtShort(acc.amount)})</option>
                )))}
              </select>
            </div>
            <div style={{textAlign:"center",fontSize:20,margin:"4px 0"}}>↓</div>
            <div style={{marginBottom:11}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>💰 입금 통장</label>
              <select className="sel" value={transferForm.toId} onChange={e=>setTransferForm({...transferForm,toId:e.target.value})}>
                <option value="">선택</option>
                {assetCats.map(cat=>cat.accounts.map(acc=>(
                  <option key={acc.id} value={acc.id} disabled={String(acc.id)===String(transferForm.fromId)}>{cat.emoji} {cat.label} › {acc.name} ({fmtShort(acc.amount)})</option>
                )))}
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:11}}>
              <div>
                <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>금액 (원)</label>
                <input className="inp" type="number" placeholder="0" value={transferForm.amount} onChange={e=>setTransferForm({...transferForm,amount:e.target.value})}/>
              </div>
              <div>
                <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>메모</label>
                <input className="inp" placeholder="이체" value={transferForm.memo} onChange={e=>setTransferForm({...transferForm,memo:e.target.value})}/>
              </div>
            </div>
            {transferForm.fromId && transferForm.toId && transferForm.amount && (
              <div style={{background:"#EEF2F9",borderRadius:11,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#4A6FA5"}}>
                {assetCats.flatMap(c=>c.accounts).find(a=>String(a.id)===String(transferForm.fromId))?.name} 에서
                → {assetCats.flatMap(c=>c.accounts).find(a=>String(a.id)===String(transferForm.toId))?.name} 으로
                <strong> {fmtShort(parseInt(transferForm.amount)||0)}</strong> 이체
              </div>
            )}
            <div style={{display:"flex",gap:10}}>
              <button className="btn-g" style={{flex:1}} onClick={()=>setShowTransferModal(false)}>취소</button>
              <button className="btn-b" style={{flex:2}} onClick={addTransfer}>이체하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 자산 수정 모달 ── */}
      {showAssetModal && <AssetEditModal assetCats={assetCats} onSave={saveAssets} onClose={()=>setShowAssetModal(false)}/>}

      {/* ── 설정 모달 ── */}
      {showSettingsModal && (
        <div className="overlay" onClick={()=>setShowSettingsModal(false)}>
          <div className="sheet" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 20px"}}/>
            <div style={{fontSize:17,fontWeight:700,marginBottom:18}}>⚙️ 설정</div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:600,color:"#555",marginBottom:10}}>가족 구성원 관리</div>
              {members.filter(m=>m.id!==9999).map((m,i)=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:"#FAFAF7",borderRadius:10,marginBottom:7}}>
                  <span style={{fontSize:19}}>{m.emoji}</span>
                  <input className="inp" style={{background:"transparent",border:"none",padding:0,flex:1,fontWeight:500}} value={m.name}
                    onChange={e=>setSetup(s=>({...s,members:s.members.map(x=>x.id===m.id?{...x,name:e.target.value}:x)}))}/>
                  {members.filter(x=>x.id!==9999).length > 1 && (
                    <button onClick={()=>setSetup(s=>({...s,members:s.members.filter(x=>x.id!==m.id)}))}
                      style={{background:"#FFF0EE",border:"none",borderRadius:8,padding:"5px 10px",color:"#E07A5F",fontSize:12,cursor:"pointer"}}>삭제</button>
                  )}
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <input className="inp" placeholder="이름 입력" id="newMemberInput"
                  onKeyDown={e=>{
                    if(e.key==="Enter"&&e.target.value.trim()){
                      const name=e.target.value.trim();
                      const idx=members.filter(x=>x.id!==9999).length;
                      setSetup(s=>({...s,members:[...s.members,{id:Date.now(),name,emoji:MEMBER_EMOJIS[idx%MEMBER_EMOJIS.length]}]}));
                      e.target.value="";
                    }
                  }}
                  style={{flex:1}}/>
                <button onClick={()=>{
                  const inp=document.getElementById("newMemberInput");
                  if(!inp||!inp.value.trim()) return;
                  const name=inp.value.trim();
                  const idx=members.filter(x=>x.id!==9999).length;
                  setSetup(s=>({...s,members:[...s.members,{id:Date.now(),name,emoji:MEMBER_EMOJIS[idx%MEMBER_EMOJIS.length]}]}));
                  inp.value="";
                }} style={{background:"#EEF2F9",border:"none",borderRadius:9,padding:"0 16px",fontSize:18,cursor:"pointer",color:"#4A6FA5",flexShrink:0,height:42}}>+</button>
              </div>
            </div>

            {/* 카드 관리 */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:600,color:"#555",marginBottom:10}}>💳 카드 관리</div>
              {cards.map((card, idx) => {
                const mem = members.find(m => m.id === card.memberId);
                return (
                  <div key={card.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:"#FAFAF7",borderRadius:10,marginBottom:7}}>
                    <span style={{fontSize:18}}>💳</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500}}>{cardLabel(card, members)}</div>
                    </div>
                    <button onClick={()=>setSetup(s=>({...s, cards:(s.cards||[]).filter((_,i)=>i!==idx)}))}
                      style={{background:"#FFF0EE",border:"none",borderRadius:8,padding:"5px 10px",color:"#E07A5F",fontSize:12,cursor:"pointer"}}>삭제</button>
                  </div>
                );
              })}
              <CardAddForm members={members} onAdd={card=>setSetup(s=>({...s, cards:[...(s.cards||[]), {...card, id:Date.now()}]}))}/>
            </div>

            <button onClick={()=>{if(window.confirm("모든 데이터를 초기화할까요?")){
              fbDelete("setup").catch(()=>{});
              fbDelete("transactions").catch(()=>{});
              fbDelete("recurring").catch(()=>{});
              setSetup(null);setTransactions([]);setRecurringItems([]);setShowSettingsModal(false);}}}
              style={{width:"100%",padding:12,background:"#FFF0EE",border:"1.5px solid #F5C0B8",borderRadius:10,color:"#E07A5F",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              🔄 초기화 (처음부터 다시 설정)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
