import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { db } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const CATEGORIES = {
  식비: { emoji: "🍱", color: "#E07A5F" },
  교통: { emoji: "🚗", color: "#4A6FA5" },
  의료: { emoji: "💊", color: "#81B29A" },
  교육: { emoji: "📚", color: "#F2CC8F" },
  여가: { emoji: "🎮", color: "#C77DFF" },
  쇼핑: { emoji: "🛍️", color: "#FF9F1C" },
  주거: { emoji: "🏠", color: "#2EC4B6" },
  저축: { emoji: "💰", color: "#3BB273" },
  급여: { emoji: "💼", color: "#3BB273" },
  기타: { emoji: "📦", color: "#aaa" },
};

const MEMBER_COLORS = ["#4A6FA5","#E07A5F","#81B29A","#F2CC8F","#C77DFF","#FF9F1C"];
const MEMBER_EMOJIS = ["👨","👩","🧒","👦","👧","🧓"];
const ASSET_COLORS = ["#4A6FA5","#81B29A","#F2CC8F","#E07A5F","#C77DFF","#FF9F1C","#2EC4B6"];
const ASSET_EMOJIS = ["🏦","📈","🏠","💳","💎","🏧","💵"];

const fmt = (n) => (n||0).toLocaleString() + "원";
const fmtShort = (n) => {
  if (!n) return "0원";
  if (n >= 100000000) return `${(n/100000000).toFixed(1)}억`;
  if (n >= 10000000) return `${(n/10000000).toFixed(1)}천만`;
  if (n >= 10000) return `${Math.round(n/10000)}만`;
  return `${n.toLocaleString()}원`;
};

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
  const [selectedMember, setSelectedMember] = useState(null);
  const [expandedCat, setExpandedCat] = useState({});
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringItems, setRecurringItems] = useState([]);
  const [recurringApplied, setRecurringApplied] = useState(false);
  const [rForm, setRForm] = useState({memo:"",amount:"",category:"주거",type:"expense",day:1,member:"",accountId:"",toAccountId:""});
  const [txForm, setTxForm] = useState({date:now.toISOString().slice(0,10),type:"expense",amount:"",category:"식비",memo:"",member:"",accountId:""});
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
      .filter(r => r.active !== false)
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
          if (t.accountId) {
            const delta = t.type === "income" ? t.amount : -t.amount;
            newCats = newCats.map(c => ({...c, accounts: c.accounts.map(a =>
              String(a.id)===String(t.accountId) ? {...a, amount: Math.max(0,(a.amount||0)+delta)} : a
            )}));
          }
        });
        const entry = { month: thisMonthLabel };
        newCats.forEach(c => { entry[c.label] = catTotal(c); });
        const newHistory = (setup.assetHistory||[]).some(h=>h.month===thisMonthLabel)
          ? (setup.assetHistory||[]).map(h=>h.month===thisMonthLabel?entry:h)
          : [...(setup.assetHistory||[]), entry];
        setSetup(s => ({...s, assetCats: newCats, assetHistory: newHistory}));
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

  const members    = setup?.members    || [];
  const assetCats  = setup?.assetCats  || [];
  const assetHistory = setup?.assetHistory || [];
  const totalAssetValue = allTotal(assetCats);

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

  const saveAssets = (newCats) => {
    const entry = { month: thisMonthLabel };
    newCats.forEach(c=>{ entry[c.label]=catTotal(c); });
    const newHistory = assetHistory.some(h=>h.month===thisMonthLabel)
      ? assetHistory.map(h=>h.month===thisMonthLabel?entry:h)
      : [...assetHistory, entry];
    setSetup(s=>({...s, assetCats:newCats, assetHistory:newHistory}));
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
      const entry = { month: thisMonthLabel };
      newCats.forEach(c => { entry[c.label] = catTotal(c); });
      const newHistory = (s.assetHistory||[]).some(h=>h.month===thisMonthLabel)
        ? (s.assetHistory||[]).map(h=>h.month===thisMonthLabel?entry:h)
        : [...(s.assetHistory||[]), entry];
      return { ...s, assetCats: newCats, assetHistory: newHistory };
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
      const entry = { month: thisMonthLabel };
      newCats.forEach(c => { entry[c.label] = catTotal(c); });
      const newHistory = (s.assetHistory||[]).some(h=>h.month===thisMonthLabel)
        ? (s.assetHistory||[]).map(h=>h.month===thisMonthLabel?entry:h)
        : [...(s.assetHistory||[]), entry];
      return { ...s, assetCats: newCats, assetHistory: newHistory };
    });
  };

  const addTx = () => {
    if (!txForm.amount || !txForm.memo || !txForm.member) return;
    const amt = parseInt(txForm.amount);
    const tx = { id: Date.now(), ...txForm, amount: amt, member: parseInt(txForm.member) };
    setTransactions(prev => [...prev, tx]);
    if (txForm.accountId) {
      const delta = txForm.type === "income" ? amt : -amt;
      setSetup(s => {
        const newCats = adjustAccount(s.assetCats, txForm.accountId, delta);
        const entry = { month: thisMonthLabel };
        newCats.forEach(c => { entry[c.label] = catTotal(c); });
        const newHistory = (s.assetHistory||[]).some(h=>h.month===thisMonthLabel)
          ? (s.assetHistory||[]).map(h=>h.month===thisMonthLabel?entry:h)
          : [...(s.assetHistory||[]), entry];
        return { ...s, assetCats: newCats, assetHistory: newHistory };
      });
    }
    setShowTxModal(false);
    setTxForm(f => ({ ...f, amount: "", memo: "", accountId: "" }));
  };

  const deleteTx = (tx) => {
    if (tx.isTransfer) { deleteTransfer(tx); return; }
    setTransactions(prev => prev.filter(x => x.id !== tx.id));
    if (tx.accountId) {
      const delta = tx.type === "income" ? -tx.amount : tx.amount;
      setSetup(s => {
        const newCats = adjustAccount(s.assetCats, tx.accountId, delta);
        const entry = { month: thisMonthLabel };
        newCats.forEach(c => { entry[c.label] = catTotal(c); });
        const newHistory = (s.assetHistory||[]).some(h=>h.month===thisMonthLabel)
          ? (s.assetHistory||[]).map(h=>h.month===thisMonthLabel?entry:h)
          : [...(s.assetHistory||[]), entry];
        return { ...s, assetCats: newCats, assetHistory: newHistory };
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
            <button className="btn-b" style={{padding:"8px 15px"}} onClick={()=>setShowTxModal(true)}>+ 추가</button>
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
        {tab==="dashboard" && (
          <div className="up" style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{background:"linear-gradient(135deg,#4A6FA5,#3257A0)",borderRadius:20,padding:"20px 22px",color:"white"}}>
              <div style={{fontSize:11,opacity:.75,marginBottom:3}}>{thisMonthLabel} 수지</div>
              <div style={{fontSize:30,fontWeight:700,marginBottom:13}}>{balance>=0?"+":""}{fmtShort(balance)}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"10px 13px"}}>
                  <div style={{fontSize:11,opacity:.8,marginBottom:2}}>💚 수입</div>
                  <div style={{fontSize:17,fontWeight:700}}>{fmtShort(totalIncome)}</div>
                </div>
                <div style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"10px 13px"}}>
                  <div style={{fontSize:11,opacity:.8,marginBottom:2}}>🔴 지출</div>
                  <div style={{fontSize:17,fontWeight:700}}>{fmtShort(totalExpense)}</div>
                </div>
              </div>
            </div>

            <div className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,color:"#aaa",marginBottom:3}}>총 가족 자산</div>
                <div style={{fontSize:24,fontWeight:700}}>{fmtShort(totalAssetValue)}</div>
              </div>
              <button onClick={()=>setShowAssetModal(true)} style={{background:"#EEF2F9",border:"none",borderRadius:10,padding:"8px 13px",color:"#4A6FA5",fontSize:13,fontWeight:600,cursor:"pointer"}}>수정 ✏️</button>
            </div>

            {memberExpense.some(m=>m.expense>0) && (
              <div className="card">
                <div style={{fontSize:13,fontWeight:700,marginBottom:13}}>👨‍👩‍👧 멤버별 지출</div>
                {memberExpense.filter(m=>m.expense>0).map((m,i)=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:11,marginBottom:10}}>
                    <span style={{fontSize:18,width:28}}>{m.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:13,fontWeight:500}}>{m.name}</span>
                        <span style={{fontSize:13,fontWeight:600,color:MEMBER_COLORS[i%6]}}>{fmtShort(m.expense)}</span>
                      </div>
                      <div style={{height:6,background:"#F0EBE0",borderRadius:3}}>
                        <div style={{height:"100%",width:`${Math.min(100,(m.expense/Math.max(...memberExpense.map(x=>x.expense),1))*100)}%`,background:MEMBER_COLORS[i%6],borderRadius:3,transition:"width .4s"}}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 고정지출 이번 달 요약 */}
            {recurringItems.filter(r=>r.active!==false).length > 0 && (
              <div className="card" style={{padding:"14px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700}}>🔁 이번 달 고정지출</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,background:recurringApplied?"#E8F5EE":"#FFF3E0",color:recurringApplied?"#3BB273":"#FF9F1C",padding:"3px 9px",borderRadius:20,fontWeight:600}}>
                      {recurringApplied ? "✓ 자동 적용됨" : "⏳ 적용 대기"}
                    </span>
                    <button onClick={()=>setTab("recurring")} style={{background:"none",border:"none",color:"#4A6FA5",fontSize:12,cursor:"pointer",fontWeight:600}}>관리 →</button>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {recurringItems.filter(r=>r.active!==false).slice(0,3).map(r=>{
                    const cat = CATEGORIES[r.category];
                    return (
                      <div key={r.id} style={{display:"flex",alignItems:"center",gap:9}}>
                        <span style={{fontSize:15}}>{cat?.emoji||"📦"}</span>
                        <span style={{fontSize:13,flex:1,color:"#444"}}>{r.memo}</span>
                        <span style={{fontSize:13,fontWeight:600,color:"#E07A5F"}}>-{fmtShort(r.amount)}</span>
                        <span style={{fontSize:11,color:"#bbb"}}>{r.day}일</span>
                      </div>
                    );
                  })}
                  {recurringItems.filter(r=>r.active!==false).length > 3 && (
                    <div style={{fontSize:12,color:"#aaa",textAlign:"center",marginTop:2}}>외 {recurringItems.filter(r=>r.active!==false).length-3}개 더</div>
                  )}
                </div>
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F5F0E8",display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:"#999"}}>이번 달 고정지출 합계</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#E07A5F"}}>{fmtShort(recurringItems.filter(r=>r.active!==false&&r.type!=="income").reduce((s,r)=>s+r.amount,0))}</span>
                </div>
              </div>
            )}

            {categoryData.length>0 && (
              <div className="card">
                <div style={{fontSize:14,fontWeight:700,marginBottom:15}}>이번 달 지출 분포</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {categoryData.map((d,i)=><Cell key={i} fill={d.color||ASSET_COLORS[i%7]}/>)}
                    </Pie>
                    <Tooltip formatter={v=>fmt(v)} contentStyle={{borderRadius:12,border:"none",fontFamily:"inherit",fontSize:12}}/>
                    <Legend formatter={v=>`${CATEGORIES[v]?.emoji||""} ${v}`}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

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
              const expanded = expandedCat[cat.id] !== false;
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

            {assetHistory.length>0 && assetCats.length>0 && (
              <div className="card">
                <div style={{fontSize:14,fontWeight:700,marginBottom:15}}>자산 변동 추이</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={assetHistory}>
                    <defs>
                      {assetCats.map(c=>(
                        <linearGradient key={c.id} id={`g${c.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={c.color} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={c.color} stopOpacity={0}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0"/>
                    <XAxis dataKey="month" tick={{fontSize:11,fill:"#aaa"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:"#aaa"}} tickFormatter={v=>v>=100000000?`${(v/100000000).toFixed(0)}억`:`${Math.round(v/10000)}만`} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={v=>fmt(v)} contentStyle={{borderRadius:12,border:"none",fontFamily:"inherit",fontSize:12}}/>
                    <Legend/>
                    {assetCats.map(c=>(
                      <Area key={c.id} type="monotone" dataKey={c.label} stackId="1" stroke={c.color} fill={`url(#g${c.id})`} strokeWidth={2}/>
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="card" style={{textAlign:"center",padding:16,color:"#aaa",fontSize:13}}>
              📅 매달 자산을 업데이트하면 추이 그래프가 쌓여요!
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
                        {t.date} · {isTransfer ? `${fromAcc?.name||"?"} → ${toAcc?.name||"?"}` : `${t.category} · ${mem?.emoji}${mem?.name}${t.accountId?` · 💳 ${allAccounts.find(a=>String(a.id)===String(t.accountId))?.name||""}`:""}` }
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:700,color:isTransfer?"#4A6FA5":t.type==="income"?"#3BB273":"#E07A5F",whiteSpace:"nowrap",marginRight:5}}>
                      {isTransfer?`↔ ${fmtShort(t.amount)}`:t.type==="income"?`+${fmtShort(t.amount)}`:`-${fmtShort(t.amount)}`}
                    </div>
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
              <div style={{fontSize:28,fontWeight:700}}>{fmtShort(recurringItems.filter(r=>r.active!==false&&r.type!=="income").reduce((s,r)=>s+r.amount,0))}</div>
              <div style={{fontSize:12,opacity:.75,marginTop:4}}>{recurringItems.filter(r=>r.active!==false).length}개 항목 · 매달 자동 적용</div>
            </div>

            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"16px 18px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #F5F0E8"}}>
                <div style={{fontSize:14,fontWeight:700}}>고정 항목 관리</div>
                <button onClick={()=>{setRForm({memo:"",amount:"",category:"주거",type:"expense",day:1,member:"",accountId:"",toAccountId:""});setShowRecurringModal("new");}}
                  style={{background:"#EEF2F9",border:"none",borderRadius:9,padding:"7px 13px",color:"#4A6FA5",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ 추가</button>
              </div>
              {recurringItems.length === 0 ? (
                <div style={{textAlign:"center",padding:36,color:"#aaa"}}>
                  <div style={{fontSize:32,marginBottom:10}}>🔁</div>
                  <div style={{fontSize:13,marginBottom:6}}>고정지출 항목이 없어요</div>
                  <div style={{fontSize:12}}>월세, 보험료, 구독료 등을 등록해보세요</div>
                </div>
              ) : recurringItems.map(r => {
                const cat = CATEGORIES[r.category];
                const acc = assetCats.flatMap(c=>c.accounts).find(a=>String(a.id)===String(r.accountId));
                const toAcc = r.type==="transfer" ? assetCats.flatMap(c=>c.accounts).find(a=>String(a.id)===String(r.toAccountId)) : null;
                const isTransfer = r.type === "transfer";
                return (
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:11,padding:"13px 18px",borderBottom:"1px solid #F5F0E8",opacity:r.active===false?0.45:1}}>
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
        <div className="overlay" onClick={()=>setShowTxModal(false)}>
          <div className="sheet" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:"#E5E0D5",borderRadius:4,margin:"0 auto 20px"}}/>
            <div style={{fontSize:17,fontWeight:700,marginBottom:16}}>내역 추가</div>
            <div className="tt">
              <button className={`tb ${txForm.type==="expense"?"on":""}`} onClick={()=>setTxForm({...txForm,type:"expense"})} style={{color:txForm.type==="expense"?"#E07A5F":"#999"}}>🔴 지출</button>
              <button className={`tb ${txForm.type==="income"?"on":""}`} onClick={()=>setTxForm({...txForm,type:"income"})} style={{color:txForm.type==="income"?"#3BB273":"#999"}}>💚 수입</button>
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
                  {Object.entries(CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.emoji} {k}</option>)}
                </select></div>
              <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>가족 멤버</label>
                <select className="sel" value={txForm.member} onChange={e=>setTxForm({...txForm,member:e.target.value})}>
                  <option value="">선택</option>
                  {members.map(m=><option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
                </select></div>
            </div>
            <div style={{marginBottom:11}}>
              <label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>
                {txForm.type==="income" ? "💳 입금 통장 (선택)" : "💳 출금 통장 (선택)"}
              </label>
              <select className="sel" value={txForm.accountId} onChange={e=>setTxForm({...txForm,accountId:e.target.value})}>
                <option value="">연결 안 함</option>
                {assetCats.map(cat =>
                  cat.accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{cat.emoji} {cat.label} › {acc.name} ({fmtShort(acc.amount)})</option>
                  ))
                )}
              </select>
              {txForm.accountId && (
                <div style={{fontSize:11,color: txForm.type==="income"?"#3BB273":"#E07A5F",marginTop:5,paddingLeft:4}}>
                  {txForm.type==="income" ? "▲ 저장 시 잔액이 늘어납니다" : "▼ 저장 시 잔액이 줄어듭니다"}
                </div>
              )}
            </div>
            <div style={{marginBottom:20}}><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>메모</label>
              <input className="inp" placeholder="내역을 입력하세요" value={txForm.memo} onChange={e=>setTxForm({...txForm,memo:e.target.value})}/></div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn-g" style={{flex:1}} onClick={()=>setShowTxModal(false)}>취소</button>
              <button className="btn-b" style={{flex:2}} onClick={addTx}>추가하기</button>
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
                <button className={`tb ${rForm.type==="expense"?"on":""}`} onClick={()=>setRForm({...rForm,type:"expense"})} style={{color:rForm.type==="expense"?"#E07A5F":"#999"}}>🔴 지출</button>
                <button className={`tb ${rForm.type==="income"?"on":""}`} onClick={()=>setRForm({...rForm,type:"income"})} style={{color:rForm.type==="income"?"#3BB273":"#999"}}>💚 수입</button>
                <button className={`tb ${rForm.type==="transfer"?"on":""}`} onClick={()=>setRForm({...rForm,type:"transfer"})} style={{color:rForm.type==="transfer"?"#4A6FA5":"#999"}}>🔄 이체</button>
              </div>
              <div style={{marginBottom:11}}><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>항목명</label>
                <input className="inp" placeholder={isTransfer?"예: 청약 자동이체":"예: 월세, 보험료"} value={rForm.memo} onChange={e=>setRForm({...rForm,memo:e.target.value})}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:11}}>
                <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>금액 (원)</label>
                  <input className="inp" type="number" placeholder="0" value={rForm.amount} onChange={e=>setRForm({...rForm,amount:e.target.value})}/></div>
                <div><label style={{fontSize:12,color:"#aaa",display:"block",marginBottom:4}}>매월 몇 일</label>
                  <input className="inp" type="number" min="1" max="31" placeholder="1" value={rForm.day} onChange={e=>setRForm({...rForm,day:parseInt(e.target.value)||1})}/></div>
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
                        {Object.entries(CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.emoji} {k}</option>)}
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
              <div style={{fontSize:13,fontWeight:600,color:"#555",marginBottom:10}}>가족 구성원 이름 수정</div>
              {members.filter(m=>m.id!==9999).map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:"#FAFAF7",borderRadius:10,marginBottom:7}}>
                  <span style={{fontSize:19}}>{m.emoji}</span>
                  <input className="inp" style={{background:"transparent",border:"none",padding:0,flex:1,fontWeight:500}} value={m.name}
                    onChange={e=>setSetup(s=>({...s,members:s.members.map(x=>x.id===m.id?{...x,name:e.target.value}:x)}))}/>
                </div>
              ))}
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
