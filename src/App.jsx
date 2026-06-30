import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════════════════════
const API = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL)
  || "http://localhost:8000/api/v1";
const LIVE_INTERVAL = 30000;

const STORAGE_KEY = "shotiq_keys_v1";
function loadKeys() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function saveKeys(keys) { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); }

// ════════════════════════════════════════════════════════════════════════════
//  DESIGN SYSTEM — Stadium Analytics Dark
// ════════════════════════════════════════════════════════════════════════════
const C = {
  // Backgrounds
  bg:          "#060a12",
  surface:     "#0c1220",
  card:        "#111827",
  cardHover:   "#172032",
  sidebar:     "#0d1525",
  // Borders
  border:      "#1e2d45",
  borderLight: "#253652",
  // Text
  text:        "#f1f5f9",
  muted:       "#64748b",
  dim:         "#334155",
  // Accents — amber/gold = stadium lights
  accent:      "#f59e0b",
  accentDim:   "#f59e0b15",
  accentHover: "#fbbf24",
  // Team colors
  home:        "#3b82f6",
  homeDim:     "#3b82f612",
  away:        "#ef4444",
  awayDim:     "#ef444412",
  total:       "#8b5cf6",
  totalDim:    "#8b5cf612",
  // Status
  live:        "#ef4444",
  success:     "#10b981",
  warn:        "#f59e0b",
  error:       "#ef4444",
};

const mono    = "'IBM Plex Mono', 'JetBrains Mono', monospace";
const display = "'Space Grotesk', 'DM Sans', sans-serif";
const body    = "'Inter', 'DM Sans', sans-serif";

// ════════════════════════════════════════════════════════════════════════════
//  API CLIENT
// ════════════════════════════════════════════════════════════════════════════
function authHeaders() {
  const k = loadKeys();
  const h = {};
  if (k.football) h["X-Football-Key"] = k.football;
  if (k.gemini)   h["X-Gemini-Key"]   = k.gemini;
  if (k.grok)     h["X-Grok-Key"]     = k.grok;
  return h;
}

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...opts.headers },
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401) throw new Error("missing_api_key");
    if (r.status === 429) throw new Error("rate_limited");
    throw new Error(t);
  }
  return r.json();
}

const api = {
  health:          ()             => fetch(API.replace("/api/v1","") + "/health").then(r=>r.json()),
  usage:           ()             => apiFetch("/usage"),
  leagues:         (tier)         => apiFetch(`/leagues${tier?`?tier=${tier}`:""}`),
  liveAll:         ()             => apiFetch("/live/all"),
  fixtures:        (id, d=7)      => apiFetch(`/leagues/${id}/fixtures?days_ahead=${d}`),
  standings:       (id)           => apiFetch(`/leagues/${id}/standings`),
  analyzeQuick:    (p)            => apiFetch(`/analyze/quick?home=${p.home}&away=${p.away}&league_id=${p.league_id}&home_sog=${p.home_sog||5.2}&away_sog=${p.away_sog||4.8}`),
  analyzeLive:     (body)         => apiFetch("/analyze/live",{method:"POST",body:JSON.stringify(body)}),
  understatTeams:  (slug, season) => apiFetch(`/understat/${slug}/${season}/teams`),
  understatMatches:(slug, season) => apiFetch(`/understat/${slug}/${season}/matches`),
  sbCompetitions:  ()             => apiFetch("/statsbomb/competitions"),
  sbMatches:       (cid, sid)     => apiFetch(`/statsbomb/matches/${cid}/${sid}`),
  fbrefShooting:   (key, season)  => apiFetch(`/fbref/${key}/${season}/shooting`),
  fbrefPlayers:    (key, season)  => apiFetch(`/fbref/${key}/${season}/players`),
  fbrefLeagues:    ()             => apiFetch("/fbref/leagues"),
  calibration:     (lid)          => apiFetch(`/calibration/${lid}`),
};

// ════════════════════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════════════════════
const pct = (v,d=1) => `${((v||0)*100).toFixed(d)}%`;
const num = (v,d=2) => typeof v==="number" ? v.toFixed(d) : "—";

function useInterval(fn, ms) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => {
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

// ── Mobile detection hook (defined early — used by every page) ──────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ════════════════════════════════════════════════════════════════════════════
//  UI PRIMITIVES
// ════════════════════════════════════════════════════════════════════════════

function LiveDot({ label = "AO VIVO" }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
      <span style={{
        width:8, height:8, borderRadius:"50%", background:C.live,
        boxShadow:`0 0 0 2px ${C.live}30`,
        animation:"livePulse 1.5s ease-in-out infinite",
      }}/>
      <span style={{ fontSize:10, color:C.live, fontFamily:mono, letterSpacing:2, fontWeight:700 }}>{label}</span>
    </span>
  );
}

function Badge({ children, color=C.accent }) {
  return (
    <span style={{
      display:"inline-block", fontSize:10, fontFamily:mono, letterSpacing:1,
      color, background:`${color}18`, border:`1px solid ${color}35`,
      padding:"2px 8px", borderRadius:4, textTransform:"uppercase", whiteSpace:"nowrap",
    }}>{children}</span>
  );
}

function Card({ children, style={}, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
      background:C.card,
      border:`1px solid ${accent ? accent+"30" : C.border}`,
      borderRadius:12,
      padding:20,
      boxShadow: accent ? `0 0 0 1px ${accent}15, 0 4px 24px ${accent}10` : "none",
      cursor:onClick?"pointer":"default",
      transition:"border-color 0.15s, box-shadow 0.15s",
      ...style,
    }}>{children}</div>
  );
}

function SLabel({ children }) {
  return (
    <div style={{
      fontSize:10, fontFamily:mono, letterSpacing:3, color:C.dim,
      textTransform:"uppercase", marginBottom:14,
    }}>{children}</div>
  );
}

function PBar({ value=0, max=1, color=C.accent, h=5 }) {
  const w = Math.min((value/max)*100, 100);
  return (
    <div style={{ height:h, background:C.border, borderRadius:h, overflow:"hidden" }}>
      <div style={{
        height:"100%", width:`${w}%`, background:color, borderRadius:h,
        transition:"width 0.8s cubic-bezier(.4,0,.2,1)",
      }}/>
    </div>
  );
}

function Spinner({ size=28, color=C.accent }) {
  return (
    <div style={{
      width:size, height:size,
      border:`2.5px solid ${C.border}`,
      borderTop:`2.5px solid ${color}`,
      borderRadius:"50%", animation:"spin 0.7s linear infinite",
      flexShrink:0,
    }}/>
  );
}

function LoadingState({ label="Carregando..." }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"60px 20px" }}>
      <Spinner size={36}/>
      <span style={{ fontSize:12, color:C.muted, fontFamily:mono }}>{label}</span>
    </div>
  );
}

function EmptyState({ icon="📊", title, sub, action, onAction }) {
  return (
    <div style={{ textAlign:"center", padding:"60px 24px", color:C.dim }}>
      <div style={{ fontSize:42, marginBottom:16, opacity:0.5 }}>{icon}</div>
      <div style={{ fontSize:16, fontWeight:600, color:C.muted, fontFamily:display, marginBottom:6 }}>{title}</div>
      {sub && <div style={{ fontSize:12, fontFamily:mono, lineHeight:1.6 }}>{sub}</div>}
      {action && (
        <button onClick={onAction} style={{
          marginTop:20, padding:"8px 20px", borderRadius:8,
          background:C.accentDim, border:`1px solid ${C.accent}40`,
          color:C.accent, fontSize:12, fontFamily:mono, cursor:"pointer",
        }}>{action}</button>
      )}
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  const clean = msg === "missing_api_key"
    ? "Chave da API-Football não configurada. Vá em ⚙️ Config."
    : msg === "rate_limited"
    ? "Limite diário de requisições atingido. Tente amanhã ou faça upgrade."
    : msg;
  return (
    <div style={{
      background:`${C.error}0e`, border:`1px solid ${C.error}30`,
      borderRadius:10, padding:"12px 16px",
      fontSize:12, color:C.error, fontFamily:mono, lineHeight:1.6,
    }}>⚠ {clean}</div>
  );
}

function StatDuel({ label, homeVal, awayVal, homeColor=C.home, awayColor=C.away }) {
  const h = parseFloat(homeVal)||0, a = parseFloat(awayVal)||0, t = h+a||1;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12 }}>
        <span style={{ fontFamily:mono, fontWeight:700, color:homeColor }}>{homeVal}</span>
        <span style={{ color:C.dim, fontSize:10, letterSpacing:1 }}>{label}</span>
        <span style={{ fontFamily:mono, fontWeight:700, color:awayColor }}>{awayVal}</span>
      </div>
      <div style={{ height:5, background:C.border, borderRadius:5, display:"flex", overflow:"hidden" }}>
        <div style={{ width:`${h/t*100}%`, background:homeColor, transition:"width 0.8s ease" }}/>
        <div style={{ flex:1, background:awayColor }}/>
      </div>
    </div>
  );
}

function MiniDist({ dist, color, mode, max=16 }) {
  const slice = (dist||[]).slice(0, max);
  const maxP  = Math.max(...slice.map(d=>d.p), 0.001);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:52 }}>
      {slice.map(({k,p}) => (
        <div key={k} title={`P(${k}) = ${pct(p)}`}
          style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{
            width:"100%",
            height:`${Math.max(2, (p/maxP)*44)}px`,
            background: k===mode ? color : `${color}30`,
            borderRadius:"2px 2px 0 0",
            boxShadow: k===mode ? `0 -3px 10px ${color}80` : "none",
            transition:"height 0.6s ease",
          }}/>
          {k%4===0 && <span style={{ fontSize:8, color:C.dim, marginTop:2, fontFamily:mono }}>{k}</span>}
        </div>
      ))}
    </div>
  );
}

function ScoreBox({ home, away, homeScore, awayScore, elapsed, status }) {
  return (
    <div style={{
      background:`linear-gradient(135deg, ${C.homeDim}, ${C.card}, ${C.awayDim})`,
      border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 24px",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        {status && ["1H","2H","HT"].includes(status) ? <LiveDot/> : <Badge color={C.warn}>{status||"—"}</Badge>}
        {elapsed && <span style={{ fontSize:12, fontFamily:mono, color:C.muted }}>{elapsed}'</span>}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:C.home, fontFamily:display }}>{home}</div>
          <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>MANDANTE</div>
        </div>
        <div style={{ textAlign:"center", padding:"0 16px" }}>
          <div style={{
            fontSize:38, fontWeight:900, fontFamily:mono,
            color:C.text, letterSpacing:6,
            textShadow:`0 0 30px ${C.accent}30`,
          }}>
            {homeScore ?? "–"}&nbsp;&nbsp;{awayScore ?? "–"}
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.away, fontFamily:display }}>{away}</div>
          <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>VISITANTE</div>
        </div>
      </div>
    </div>
  );
}

function LambdaCard({ label, value, ci, mode, color, sub }) {
  return (
    <div style={{
      background:C.card, border:`1px solid ${color}25`,
      borderRadius:12, padding:"16px 14px", textAlign:"center",
      boxShadow:`0 0 20px ${color}08`,
    }}>
      <div style={{ fontSize:9, color:C.dim, fontFamily:mono, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:36, fontWeight:900, color, fontFamily:mono, lineHeight:1 }}>{num(value)}</div>
      {mode !== undefined && <div style={{ fontSize:11, color:C.muted, fontFamily:mono, marginTop:6 }}>Moda: <span style={{ color }}>{mode}</span></div>}
      {ci && <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>[{num(ci[0],1)}, {num(ci[1],1)}]</div>}
      {sub && <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function KeyProbs({ probs, home, away }) {
  const items = [
    { label:`${home} +5 chutes`, p:probs?.home_over_5, color:C.home },
    { label:`${home} +7 chutes`, p:probs?.home_over_7, color:C.home },
    { label:`${away} +5 chutes`, p:probs?.away_over_5, color:C.away },
    { label:`${away} +7 chutes`, p:probs?.away_over_7, color:C.away },
    { label:"Total +8 chutes",   p:probs?.total_over_8,  color:C.total },
    { label:"Total +10 chutes",  p:probs?.total_over_10, color:C.total },
    { label:"Total +12 chutes",  p:probs?.total_over_12, color:C.total },
    { label:`${home} domina`,    p:probs?.home_dominates, color:C.accent },
  ].filter(i => i.p !== undefined);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {items.map(({ label, p, color }) => (
        <div key={label}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontSize:12, color:C.muted }}>{label}</span>
            <span style={{ fontSize:13, fontFamily:mono, color, fontWeight:700 }}>{pct(p)}</span>
          </div>
          <PBar value={p} color={color}/>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: LIVE
// ════════════════════════════════════════════════════════════════════════════
function LivePage() {
  const isMobile = useIsMobile();
  const [matches, setMatches]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [liveData, setLiveData]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr]             = useState("");
  const [lastSync, setLastSync]   = useState(null);
  const [sseOn, setSseOn]         = useState(false);
  const sseRef                    = useRef(null);

  const fetchMatches = useCallback(async () => {
    try {
      const d = await api.liveAll();
      setMatches(d.matches || []);
      setLastSync(new Date());
      setErr("");
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMatches(); }, []);
  useInterval(fetchMatches, LIVE_INTERVAL);
  useEffect(() => () => sseRef.current?.close(), []);

  const selectMatch = (m) => {
    setSelected(m); setLiveData(null); setSseOn(false); setAnalyzing(true);
    sseRef.current?.close();
    const k = loadKeys();
    const params = new URLSearchParams({
      home_team_id: m.home?.id||0, away_team_id: m.away?.id||0,
      home_team_name: m.home?.name||"", away_team_name: m.away?.name||"",
      league_id: m.league_id||71, football_key: k.football||"",
    });
    const es = new EventSource(`${API}/sse/live/${m.fixture_id}?${params}`);
    sseRef.current = es;
    es.addEventListener("update", e => {
      try { setLiveData(JSON.parse(e.data)); setSseOn(true); setAnalyzing(false); } catch {}
    });
    es.addEventListener("heartbeat", () => setSseOn(true));
    es.addEventListener("ended", () => { es.close(); setSseOn(false); });
    es.onerror = () => { setSseOn(false); setAnalyzing(false); };
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "300px 1fr", gap:20, alignItems:"start" }}>
      {/* Match list */}
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ fontSize:11, color:C.muted, fontFamily:mono }}>
            {matches.length} partidas ao vivo
          </span>
          {lastSync && <span style={{ fontSize:10, color:C.dim, fontFamily:mono }}>{lastSync.toLocaleTimeString("pt-BR")}</span>}
        </div>
        {loading ? <LoadingState label="Buscando partidas..."/> :
         err ? <ErrBox msg={err}/> :
         matches.length===0 ? (
           <EmptyState icon="📡" title="Nenhuma partida ao vivo" sub="Atualiza automaticamente a cada 30s"/>
         ) : (
           <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
             {matches.map((m,i) => {
               const sel = selected?.fixture_id===m.fixture_id;
               const isLive = ["1H","2H","HT"].includes(m.status_short);
               return (
                 <div key={i} onClick={() => selectMatch(m)} style={{
                   background: sel ? `${C.home}12` : C.card,
                   border:`1px solid ${sel ? C.home : isLive ? C.live+"40" : C.border}`,
                   borderRadius:10, padding:"12px 14px", cursor:"pointer",
                   transition:"all 0.15s",
                 }}>
                   <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                     {isLive ? <LiveDot/> : <Badge color={C.warn}>{m.status_short}</Badge>}
                     <span style={{ fontSize:10, fontFamily:mono, color:C.dim }}>{m.elapsed}'</span>
                   </div>
                   <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                     <span style={{ fontSize:13, fontWeight:700, color:C.home, fontFamily:display, flex:1 }}>{m.home?.name}</span>
                     <span style={{ fontSize:20, fontWeight:900, fontFamily:mono, color:C.text, padding:"0 10px", letterSpacing:3 }}>
                       {m.score_home??"-"} {m.score_away??"-"}
                     </span>
                     <span style={{ fontSize:13, fontWeight:700, color:C.away, fontFamily:display, flex:1, textAlign:"right" }}>{m.away?.name}</span>
                   </div>
                   {m.league_name && (
                     <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:6 }}>
                       {m.league_country} · {m.league_name}
                     </div>
                   )}
                 </div>
               );
             })}
           </div>
         )}
      </div>

      {/* Analysis panel */}
      <div>
        {!selected && <EmptyState icon="⚡" title="Selecione uma partida" sub="Clique numa partida ao vivo para ver a análise em tempo real"/>}
        {selected && analyzing && <LoadingState label="Conectando stream ao vivo..."/>}
        {selected && !analyzing && liveData && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <ScoreBox
              home={selected.home?.name} away={selected.away?.name}
              homeScore={liveData.score?.home} awayScore={liveData.score?.away}
              elapsed={liveData.elapsed} status={selected.status_long}
            />
            {sseOn && (
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <LiveDot label="STREAM ATIVO"/>
                <span style={{ fontSize:10, color:C.dim, fontFamily:mono }}>Atualiza automaticamente · sem polling</span>
              </div>
            )}
            {/* Lambda cards */}
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:12 }}>
              <LambdaCard label={selected.home?.name} value={liveData.lambdas?.home}
                color={C.home} sub={`Proj: ${num(liveData.projected_final?.home,1)}`}/>
              <LambdaCard label="Total" value={liveData.lambdas?.total}
                color={C.total} sub={`Proj: ${num(liveData.projected_final?.total,1)}`}/>
              <LambdaCard label={selected.away?.name} value={liveData.lambdas?.away}
                color={C.away} sub={`Proj: ${num(liveData.projected_final?.away,1)}`}/>
            </div>
            {/* Momentum */}
            <Card>
              <SLabel>Momentum · Ritmo atual vs esperado pela liga</SLabel>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[
                  { team:selected.home?.name, m:liveData.momentum?.home, color:C.home },
                  { team:selected.away?.name, m:liveData.momentum?.away, color:C.away },
                ].map(({team, m, color}) => {
                  const lc = m>1.2?C.success:m>0.8?C.accent:C.error;
                  const lbl = m>1.2?"🔥 ALTO":m>0.8?"⚡ NORMAL":"❄️ BAIXO";
                  return (
                    <div key={team} style={{ background:C.surface, borderRadius:10, padding:"14px 16px" }}>
                      <div style={{ fontSize:12, color, fontWeight:700, fontFamily:display, marginBottom:8 }}>{team}</div>
                      <div style={{ fontSize:30, fontWeight:900, fontFamily:mono, color }}>{num(m)}×</div>
                      <div style={{ marginTop:6 }}><Badge color={lc}>{lbl}</Badge></div>
                    </div>
                  );
                })}
              </div>
            </Card>
            {/* Live stats */}
            {liveData.live_stats?.home?.shots_on_target !== undefined && (
              <Card>
                <SLabel>Estatísticas em tempo real</SLabel>
                <StatDuel label="Chutes ao gol 🎯" homeVal={liveData.live_stats.home.shots_on_target} awayVal={liveData.live_stats.away?.shots_on_target}/>
                <StatDuel label="Chutes totais" homeVal={liveData.live_stats.home.shots_total} awayVal={liveData.live_stats.away?.shots_total}/>
                <StatDuel label="Posse de bola" homeVal={liveData.live_stats.home.possession} awayVal={liveData.live_stats.away?.possession}/>
                <StatDuel label="Escanteios" homeVal={liveData.live_stats.home.corners} awayVal={liveData.live_stats.away?.corners}/>
                <StatDuel label="Defesas" homeVal={liveData.live_stats.home.saves} awayVal={liveData.live_stats.away?.saves}/>
              </Card>
            )}
            {/* Probs */}
            <Card>
              <SLabel>Probabilidades projetadas · restante do jogo</SLabel>
              <KeyProbs probs={liveData.probabilities} home={selected.home?.name} away={selected.away?.name}/>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: ANALYZE
// ════════════════════════════════════════════════════════════════════════════
function AnalyzePage() {
  const isMobile = useIsMobile();
  const [leagues, setLeagues]     = useState([]);
  const [leagueId, setLeagueId]   = useState(71);
  const [homeName, setHomeName]   = useState("Flamengo");
  const [awayName, setAwayName]   = useState("Vasco");
  const [homeSog, setHomeSog]     = useState(6.8);
  const [awaySog, setAwaySog]     = useState(4.5);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState("");
  const [tab, setTab]             = useState("overview");
  const [exporting, setExporting] = useState("");

  useEffect(() => {
    api.leagues().then(d => setLeagues(d.leagues||[])).catch(()=>{});
  }, []);

  const run = async () => {
    setLoading(true); setErr(""); setResult(null);
    try {
      const d = await api.analyzeQuick({ home:homeName, away:awayName, league_id:leagueId, home_sog:homeSog, away_sog:awaySog });
      setResult(d); setTab("overview");
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const exportFile = async (kind) => {
    setExporting(kind);
    try {
      const r = await fetch(`${API}/export/${kind}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", ...authHeaders() },
        body:JSON.stringify({ home_team_id:0, away_team_id:0, home_team_name:homeName, away_team_name:awayName, league_id:leagueId }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url; a.download=`shotiq_${homeName}_vs_${awayName}.${kind==="excel"?"xlsx":"pdf"}`.replace(/\s/g,"_");
      a.click(); URL.revokeObjectURL(url);
    } catch(e) { alert("Erro ao exportar: "+e.message); }
    finally { setExporting(""); }
  };

  const TABS = ["overview","distribuição","tempos","mercado"];

  return (
    <div>
      {/* Config card */}
      <Card style={{ marginBottom:20 }}>
        <SLabel>Configurar partida</SLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:6 }}>LIGA</label>
            <select value={leagueId} onChange={e=>setLeagueId(+e.target.value)}
              style={{ width:"100%", padding:"10px 12px", background:C.surface, border:`1px solid ${C.borderLight}`, borderRadius:8, color:C.text, fontSize:12, outline:"none", cursor:"pointer" }}>
              {leagues.length===0 && <option value={71}>🇧🇷 Brasileirão Série A</option>}
              {leagues.map(l => <option key={l.id} value={l.id} style={{ background:C.card }}>{l.country} · {l.name}</option>)}
            </select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:6 }}>SOG/J CASA</label>
              <input type="number" step="0.1" value={homeSog} onChange={e=>setHomeSog(+e.target.value)}
                style={{ width:"100%", padding:"10px 12px", background:C.surface, border:`1px solid ${C.home}40`, borderRadius:8, color:C.home, fontSize:13, fontFamily:mono, outline:"none" }}/>
            </div>
            <div>
              <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:6 }}>SOG/J FORA</label>
              <input type="number" step="0.1" value={awaySog} onChange={e=>setAwaySog(+e.target.value)}
                style={{ width:"100%", padding:"10px 12px", background:C.surface, border:`1px solid ${C.away}40`, borderRadius:8, color:C.away, fontSize:13, fontFamily:mono, outline:"none" }}/>
            </div>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 32px 1fr", gap:10, alignItems:"end", marginBottom:16 }}>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:6 }}>🏠 MANDANTE</label>
            <input value={homeName} onChange={e=>setHomeName(e.target.value)}
              style={{ width:"100%", padding:"11px 14px", background:C.surface, border:`1px solid ${C.home}50`, borderRadius:8, color:C.home, fontSize:15, fontWeight:700, outline:"none" }}/>
          </div>
          <div style={{ textAlign:"center", color:C.dim, fontWeight:900, paddingBottom:8 }}>✕</div>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:6 }}>✈️ VISITANTE</label>
            <input value={awayName} onChange={e=>setAwayName(e.target.value)}
              style={{ width:"100%", padding:"11px 14px", background:C.surface, border:`1px solid ${C.away}50`, borderRadius:8, color:C.away, fontSize:15, fontWeight:700, outline:"none" }}/>
          </div>
        </div>
        <button onClick={run} disabled={loading}
          style={{
            width:"100%", padding:"13px", border:"none", borderRadius:10, cursor:"pointer",
            background:loading?C.border:`linear-gradient(90deg,${C.home},${C.accent})`,
            color:loading?C.muted:C.bg, fontWeight:800, fontSize:13, letterSpacing:2,
            textTransform:"uppercase", fontFamily:mono, transition:"opacity 0.2s",
          }}>
          {loading ? <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}><Spinner size={16} color={C.muted}/> CALCULANDO...</span> : "⚡ ANALISAR"}
        </button>
        {err && <div style={{ marginTop:10 }}><ErrBox msg={err}/></div>}
      </Card>

      {result && (
        <>
          {/* Tab bar */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, gap:10, flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:4, background:C.surface, borderRadius:10, padding:4 }}>
              {TABS.map(t => (
                <button key={t} onClick={()=>setTab(t)} style={{
                  padding:"6px 16px", borderRadius:8, border:"none", cursor:"pointer",
                  background:tab===t?C.card:"transparent",
                  color:tab===t?C.accent:C.muted,
                  fontWeight:tab===t?700:500, fontSize:12, fontFamily:mono,
                  textTransform:"uppercase", letterSpacing:1, transition:"all 0.15s",
                  boxShadow:tab===t?`0 0 0 1px ${C.border}`:"none",
                }}>{t}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {[{k:"excel",l:"📊 Excel",c:C.success},{k:"pdf",l:"📄 PDF",c:C.away}].map(({k,l,c})=>(
                <button key={k} onClick={()=>exportFile(k)} disabled={!!exporting}
                  style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${c}40`,
                    background:`${c}10`, color:c, fontSize:11, fontFamily:mono, cursor:"pointer" }}>
                  {exporting===k?<Spinner size={12} color={c}/>:l}
                </button>
              ))}
            </div>
          </div>

          {tab==="overview" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:14 }}>
                <LambdaCard label={homeName} value={result.lambdas?.home} color={C.home}
                  ci={result.confidence_intervals?.home} mode={result.modes?.home}/>
                <LambdaCard label="Total" value={result.lambdas?.total} color={C.total}
                  ci={result.confidence_intervals?.total} mode={result.modes?.total}/>
                <LambdaCard label={awayName} value={result.lambdas?.away} color={C.away}
                  ci={result.confidence_intervals?.away} mode={result.modes?.away}/>
              </div>
              <Card>
                <SLabel>Probabilidades-chave</SLabel>
                <KeyProbs probs={result.key_probabilities} home={homeName} away={awayName}/>
              </Card>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {(result.model?.sources||[]).map(s => <Badge key={s}>{s}</Badge>)}
              </div>
            </div>
          )}

          {tab==="distribuição" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {[
                { label:homeName, dist:result.distributions?.home, color:C.home, lam:result.lambdas?.home, mode:result.modes?.home },
                { label:awayName, dist:result.distributions?.away, color:C.away, lam:result.lambdas?.away, mode:result.modes?.away },
                { label:"Total",  dist:result.distributions?.total, color:C.total, lam:result.lambdas?.total, mode:result.modes?.total },
              ].map(({label,dist,color,lam,mode}) => (
                <Card key={label} accent={color}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
                    <span style={{ fontSize:14, fontWeight:700, color, fontFamily:display }}>{label}</span>
                    <span style={{ fontSize:11, color:C.dim, fontFamily:mono }}>λ={num(lam)} · Moda={mode}</span>
                  </div>
                  <MiniDist dist={dist} color={color} mode={mode} max={label==="Total"?22:16}/>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:4, marginTop:14 }}>
                    {(dist||[]).slice(0,16).map(({k,p}) => (
                      <div key={k} style={{
                        background:k===mode?`${color}20`:C.surface,
                        border:`1px solid ${k===mode?color+"50":C.border}`,
                        borderRadius:6, padding:"5px 4px", textAlign:"center",
                      }}>
                        <div style={{ fontSize:9, color:C.dim, fontFamily:mono }}>{k}</div>
                        <div style={{ fontSize:10, color:k===mode?color:C.muted, fontWeight:k===mode?700:400, fontFamily:mono }}>{pct(p)}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab==="tempos" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Card>
                <SLabel>Projeção por tempo · proporção 45% / 55%</SLabel>
                {[
                  { label:homeName, h1:result.half_splits?.home?.h1, h2:result.half_splits?.home?.h2, color:C.home },
                  { label:awayName, h1:result.half_splits?.away?.h1, h2:result.half_splits?.away?.h2, color:C.away },
                  { label:"Total",  h1:(result.half_splits?.home?.h1||0)+(result.half_splits?.away?.h1||0),
                                    h2:(result.half_splits?.home?.h2||0)+(result.half_splits?.away?.h2||0), color:C.total },
                ].map(({ label, h1, h2, color }) => {
                  const t = (h1||0)+(h2||0)||1;
                  return (
                    <div key={label} style={{ marginBottom:18 }}>
                      <div style={{ fontSize:13, fontWeight:700, color, fontFamily:display, marginBottom:10 }}>{label}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        {[{t:"1º Tempo",v:h1,p:(h1||0)/t},{t:"2º Tempo",v:h2,p:(h2||0)/t}].map(({t:tt,v,p}) => (
                          <div key={tt} style={{ background:C.surface, borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginBottom:6 }}>{tt}</div>
                            <div style={{ fontSize:26, fontWeight:900, color, fontFamily:mono }}>{num(v)}</div>
                            <PBar value={p} color={color} h={3}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          {tab==="mercado" && (
            <Card>
              <SLabel>Linhas de mercado · Over/Under</SLabel>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:mono }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                      {["Linha","Home Over","Away Over","Total Over","Home Exato","Away Exato"].map(h => (
                        <th key={h} style={{ padding:"8px 10px", color:C.dim, textAlign:"center", fontSize:10, letterSpacing:1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(result.market_table||[]).map(m => (
                      <tr key={m.line} style={{ borderBottom:`1px solid ${C.border}20` }}>
                        <td style={{ padding:"8px 10px", color:C.text, fontWeight:700, textAlign:"center" }}>{m.line}</td>
                        {[{v:m.home_over,c:C.home},{v:m.away_over,c:C.away},{v:m.total_over,c:C.total},{v:m.home_exact,c:C.home},{v:m.away_exact,c:C.away}]
                          .map(({v,c},i) => (
                          <td key={i} style={{ padding:"8px 10px", textAlign:"center" }}>
                            <span style={{ color:v>0.6?c:v>0.4?C.text:C.dim, fontWeight:v>0.6?700:400 }}>{pct(v)}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: TICKET
// ════════════════════════════════════════════════════════════════════════════
function TicketPage() {
  const isMobile = useIsMobile();
  const [image, setImage]     = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState("");
  const fileRef               = useRef(null);

  const onFile = (file) => {
    if (!file) return;
    setImage(file); setResult(null); setErr("");
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    const k = loadKeys();
    if (!k.gemini && !k.grok) { setErr("Configure uma chave Gemini (gratuita) em ⚙️ Config."); return; }
    setLoading(true); setErr(""); setResult(null);
    try {
      const form = new FormData();
      form.append("file", image);
      const r = await fetch(`${API}/ticket/analyze`, { method:"POST", headers:authHeaders(), body:form });
      if (!r.ok) { const t = await r.json(); throw new Error(t?.detail?.message||t?.detail||"Erro ao analisar."); }
      setResult(await r.json());
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const SC = { strong_value:C.success, value:C.accent, neutral:C.warn, avoid:C.error };
  const SL = { strong_value:"🔥 FORTE VALOR", value:"✅ VALOR", neutral:"➡️ NEUTRO", avoid:"❌ EVITAR" };
  const RC = { BAIXO:C.success, MÉDIO:C.warn, ALTO:C.error };

  return (
    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20, alignItems:"start" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if(f?.type.startsWith("image/")) onFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border:`2px dashed ${preview?C.accent:C.borderLight}`,
            borderRadius:14, padding:preview?0:"48px 24px",
            textAlign:"center", cursor:"pointer",
            background:preview?"transparent":C.surface,
            transition:"border-color 0.2s", overflow:"hidden",
          }}>
          {preview ? (
            <img src={preview} alt="Bilhete" style={{ width:"100%", borderRadius:12, display:"block" }}/>
          ) : (
            <>
              <div style={{ fontSize:44, marginBottom:14 }}>📸</div>
              <div style={{ fontSize:15, color:C.muted, fontFamily:display, marginBottom:6 }}>Arraste o print ou clique</div>
              <div style={{ fontSize:11, color:C.dim, fontFamily:mono }}>JPG · PNG · WEBP · máx 10MB</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>onFile(e.target.files[0])}/>
        {preview && (
          <button onClick={()=>{setImage(null);setPreview(null);setResult(null);}}
            style={{ padding:"8px", border:`1px solid ${C.border}`, borderRadius:8, background:"transparent", color:C.muted, fontSize:11, cursor:"pointer", fontFamily:mono }}>
            🗑️ Remover imagem
          </button>
        )}
        <button onClick={analyze} disabled={!image||loading}
          style={{
            padding:"14px", border:"none", borderRadius:10,
            cursor:image&&!loading?"pointer":"not-allowed",
            background:image&&!loading?`linear-gradient(90deg,${C.accent},${C.total})`:C.border,
            color:image&&!loading?C.bg:C.muted,
            fontWeight:800, fontSize:13, letterSpacing:2, textTransform:"uppercase", fontFamily:mono,
          }}>
          {loading ? <span style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}><Spinner size={16} color={C.muted}/>ANALISANDO...</span> : "🎯 ANALISAR BILHETE"}
        </button>
        {err && <ErrBox msg={err}/>}
        <Card style={{ background:C.surface }}>
          <SLabel>Como usar</SLabel>
          {["1. Aposte em qualquer casa (Bet365, Betano, Sportingbet...)",
            "2. Tire um print com odds bem visíveis",
            "3. Faça upload aqui antes do jogo",
            "4. Gemini lê as odds e comparamos com o modelo Poisson",
            "5. Veja quais seleções têm valor real e o risco do bilhete",
          ].map((s,i) => <div key={i} style={{ fontSize:11, color:C.muted, marginBottom:6, lineHeight:1.6 }}>{s}</div>)}
          <div style={{ marginTop:10, padding:"10px 12px", background:C.card, borderRadius:8, border:`1px solid ${C.warn}25`, fontSize:11, color:C.warn, lineHeight:1.5 }}>
            ⚠️ Análise educacional. Aposte com responsabilidade.
          </div>
        </Card>
      </div>

      {/* Right — Results */}
      <div>
        {!result && !loading && <EmptyState icon="🎟️" title="Faça upload do bilhete" sub="O modelo analisa cada seleção individualmente com Gemini Vision"/>}
        {loading && <LoadingState label="IA lendo e analisando o bilhete..."/>}
        {result && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Summary */}
            <Card accent={RC[result.resumo?.risco]}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <span style={{ fontSize:15, fontWeight:700, fontFamily:display, color:C.text }}>{result.resumo?.casa_apostas||"Bilhete"}</span>
                <Badge color={RC[result.resumo?.risco]||C.warn}>Risco {result.resumo?.risco}</Badge>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
                {[
                  { l:"Prob. Green", v:`${result.resumo?.prob_green_pct?.toFixed(1)||0}%`,
                    c:result.resumo?.prob_green_pct>50?C.success:result.resumo?.prob_green_pct>25?C.warn:C.error },
                  { l:"Odd Total", v:result.resumo?.total_odds||"—", c:C.total },
                  { l:"Com Valor", v:`${result.resumo?.selecoes_com_valor}/${result.resumo?.total_selecoes}`, c:C.accent },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ textAlign:"center", background:C.surface, borderRadius:10, padding:"10px 8px" }}>
                    <div style={{ fontSize:9, color:C.dim, fontFamily:mono, marginBottom:4, textTransform:"uppercase" }}>{l}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:c, fontFamily:mono }}>{v}</div>
                  </div>
                ))}
              </div>
              <PBar value={result.resumo?.prob_green_pct||0} max={100} color={RC[result.resumo?.risco]||C.warn} h={8}/>
            </Card>
            {/* AI */}
            {result.ai_analysis && (
              <Card accent={C.accent}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <div style={{ width:22, height:22, borderRadius:6, background:`linear-gradient(135deg,${C.home},${C.accent})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>✦</div>
                  <Badge>Análise IA</Badge>
                </div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.8, whiteSpace:"pre-wrap" }}>{result.ai_analysis}</div>
              </Card>
            )}
            {/* Selections */}
            <Card>
              <SLabel>Seleções · Modelo vs Mercado</SLabel>
              {result.selecoes_analisadas?.map((sel,i) => {
                const ma = sel.model_analysis;
                const sc = SC[ma?.signal]||C.muted;
                return (
                  <div key={i} style={{ padding:"12px 14px", borderRadius:10, marginBottom:10, background:C.surface, border:`1px solid ${sc}20` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{sel.jogo}</div>
                        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{sel.mercado} · <span style={{ color:C.accent }}>{sel.selecao}</span></div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:20, fontWeight:900, color:"#ffd700", fontFamily:mono }}>{sel.odd}</div>
                        {ma && <Badge color={sc} size={9}>{SL[ma.signal]}</Badge>}
                      </div>
                    </div>
                    {ma && (
                      <>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                          {[
                            { l:"Modelo", v:pct(ma.model_prob), c:C.home },
                            { l:"Mercado", v:pct(ma.market_prob), c:C.muted },
                            { l:"Edge", v:`${ma.edge_pct>0?"+":""}${ma.edge_pct?.toFixed(1)}%`, c:ma.edge_pct>0?C.success:C.error },
                          ].map(({l,v,c}) => (
                            <div key={l} style={{ textAlign:"center", background:C.card, borderRadius:6, padding:"6px 4px" }}>
                              <div style={{ fontSize:9, color:C.dim, fontFamily:mono, marginBottom:2 }}>{l}</div>
                              <div style={{ fontSize:14, fontWeight:700, color:c, fontFamily:mono }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <PBar value={ma.model_prob} color={sc}/>
                        {ma.kelly_quarter>0 && (
                          <div style={{ fontSize:10, color:C.accent, fontFamily:mono, marginTop:6 }}>
                            Kelly ¼: {(ma.kelly_quarter*100).toFixed(1)}% da banca
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </Card>
            <div style={{ fontSize:10, color:C.dim, fontFamily:mono, lineHeight:1.6, padding:"10px 14px", background:C.surface, borderRadius:8 }}>
              ⚠️ {result.disclaimer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: LEAGUES
// ════════════════════════════════════════════════════════════════════════════
function LeaguesPage() {
  const isMobile = useIsMobile();
  const [leagues, setLeagues]   = useState([]);
  const [tier, setTier]         = useState("");
  const [selected, setSelected] = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => { api.leagues(tier).then(d=>setLeagues(d.leagues||[])).catch(()=>{}); }, [tier]);

  const pick = async (l) => {
    setSelected(l); setLoading(true); setFixtures([]);
    try {
      const fx = await api.fixtures(l.id);
      setFixtures(fx.fixtures||[]);
    } catch {}
    finally { setLoading(false); }
  };

  const TIERS = [
    ["","Todas"],["top5","Top 5"],["south_america","América do Sul"],
    ["europe","Europa"],["global","Global"],["international","Internacional"],
  ];

  return (
    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "240px 1fr", gap:20 }}>
      <div>
        <SLabel>Região</SLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:20 }}>
          {TIERS.map(([t,label]) => (
            <button key={t} onClick={()=>setTier(t)}
              style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${tier===t?C.accent:C.border}`,
                background:tier===t?C.accentDim:"transparent", color:tier===t?C.accent:C.muted,
                cursor:"pointer", textAlign:"left", fontSize:12, fontFamily:mono }}>
              {label}
            </button>
          ))}
        </div>
        <SLabel>{leagues.length} ligas</SLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {leagues.map(l => (
            <div key={l.id} onClick={()=>pick(l)}
              style={{ padding:"10px 14px", borderRadius:8, cursor:"pointer",
                background:selected?.id===l.id?C.accentDim:C.card,
                border:`1px solid ${selected?.id===l.id?C.accent:C.border}`,
                transition:"all 0.15s" }}>
              <div style={{ fontSize:13, fontWeight:600, color:selected?.id===l.id?C.accent:C.text }}>{l.name}</div>
              <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>
                {l.country}
                {l.has_understat&&" · UST"}{l.has_statsbomb&&" · SB"}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        {!selected && <EmptyState icon="🌍" title="Selecione uma liga"/>}
        {selected && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:22, fontWeight:900, fontFamily:display, color:C.text }}>{selected.name}</div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{selected.country} · ID {selected.id}</div>
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {selected.has_understat&&<Badge color={C.total}>Understat</Badge>}
                  {selected.has_statsbomb&&<Badge color={C.home}>StatsBomb</Badge>}
                  <Badge>API-Football</Badge>
                  <Badge color={C.warn}>FBref</Badge>
                </div>
              </div>
            </Card>
            {loading && <LoadingState/>}
            {fixtures.length>0 && (
              <Card>
                <SLabel>Próximos jogos · 7 dias</SLabel>
                {fixtures.slice(0,6).map((f,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"10px 0", borderBottom:i<5?`1px solid ${C.border}20`:"none" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.home }}>{f.home?.name}</div>
                      <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>λ {f.expected_sog?.home||"—"}</div>
                    </div>
                    <div style={{ textAlign:"center", padding:"0 12px" }}>
                      <div style={{ fontSize:11, color:C.dim, fontFamily:mono }}>vs</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                        {f.date?new Date(f.date).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}):"—"}
                      </div>
                    </div>
                    <div style={{ flex:1, textAlign:"right" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.away }}>{f.away?.name}</div>
                      <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>λ {f.expected_sog?.away||"—"}</div>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: FBREF
// ════════════════════════════════════════════════════════════════════════════
function FBrefPage() {
  const [leagues, setLeagues]     = useState([]);
  const [selKey, setSelKey]       = useState("brasileirao");
  const [season, setSeason]       = useState(2024);
  const [shooting, setShooting]   = useState([]);
  const [players, setPlayers]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState("");
  const [tab, setTab]             = useState("teams");

  useEffect(() => { api.fbrefLeagues().then(d=>setLeagues(d.leagues||[])).catch(()=>{}); }, []);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const [sh, pl] = await Promise.all([api.fbrefShooting(selKey,season), api.fbrefPlayers(selKey,season)]);
      setShooting(sh.teams||[]); setPlayers(pl.players||[]);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <Card style={{ marginBottom:20 }}>
        <SLabel>FBref · fbref.com · StatsBomb/Opta · Gratuito</SLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:10, alignItems:"end" }}>
          <select value={selKey} onChange={e=>setSelKey(e.target.value)}
            style={{ padding:"10px 12px", background:C.surface, border:`1px solid ${C.borderLight}`, borderRadius:8, color:C.text, fontSize:12, outline:"none", cursor:"pointer" }}>
            {leagues.map(l=><option key={l.key} value={l.key} style={{ background:C.card }}>{l.country} · {l.name}</option>)}
            {leagues.length===0&&<option value="brasileirao">🇧🇷 Brasileirão</option>}
          </select>
          <input type="number" value={season} onChange={e=>setSeason(+e.target.value)}
            style={{ width:90, padding:"10px 12px", background:C.surface, border:`1px solid ${C.borderLight}`, borderRadius:8, color:C.text, fontSize:12, fontFamily:mono, outline:"none" }}/>
          <button onClick={load} disabled={loading}
            style={{ padding:"10px 20px", background:loading?C.border:`linear-gradient(90deg,${C.home},${C.accent})`,
              border:"none", borderRadius:8, color:loading?C.muted:C.bg, fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:mono }}>
            {loading?<Spinner size={14} color={C.muted}/>:"BUSCAR"}
          </button>
        </div>
        {err&&<div style={{ marginTop:10 }}><ErrBox msg={err}/></div>}
      </Card>

      {(shooting.length>0||players.length>0)&&(
        <>
          <div style={{ display:"flex", gap:4, background:C.surface, borderRadius:10, padding:4, marginBottom:16, width:"fit-content" }}>
            {[["teams","Times"],["players","Jogadores"]].map(([t,l]) => (
              <button key={t} onClick={()=>setTab(t)}
                style={{ padding:"6px 18px", borderRadius:8, border:"none", cursor:"pointer",
                  background:tab===t?C.card:"transparent", color:tab===t?C.accent:C.muted,
                  fontWeight:tab===t?700:500, fontSize:12, fontFamily:mono }}>
                {l}
              </button>
            ))}
          </div>

          {tab==="teams"&&(
            <Card style={{ padding:0, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                <SLabel>Shooting Stats · {selKey} {season}</SLabel>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:mono }}>
                  <thead>
                    <tr style={{ background:C.surface }}>
                      {["#","Time","SOT/J","Chutes/J","xG/J","SOT%","Dist."].map(h=>(
                        <th key={h} style={{ padding:"10px 14px", color:C.dim, textAlign:"left", fontSize:10, letterSpacing:1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shooting.map((t,i)=>(
                      <tr key={i} style={{ borderBottom:`1px solid ${C.border}15` }}>
                        <td style={{ padding:"9px 14px", color:C.dim }}>{i+1}</td>
                        <td style={{ padding:"9px 14px", color:C.text, fontWeight:600 }}>{t.team}</td>
                        <td style={{ padding:"9px 14px", color:C.home, fontWeight:700 }}>{num(t.sot_pg)}</td>
                        <td style={{ padding:"9px 14px", color:C.muted }}>{num(t.shots_pg)}</td>
                        <td style={{ padding:"9px 14px", color:C.accent, fontWeight:700 }}>{num(t.xG_pg,3)}</td>
                        <td style={{ padding:"9px 14px", color:C.muted }}>{num(t.sot_pct)}%</td>
                        <td style={{ padding:"9px 14px", color:C.dim }}>{num(t.avg_shot_dist)}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab==="players"&&(
            <Card style={{ padding:0, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                <SLabel>Top Jogadores por xG · {selKey} {season}</SLabel>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:mono }}>
                  <thead>
                    <tr style={{ background:C.surface }}>
                      {["#","Jogador","Time","SOT","xG","xG/90","Dist."].map(h=>(
                        <th key={h} style={{ padding:"10px 14px", color:C.dim, textAlign:"left", fontSize:10, letterSpacing:1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p,i)=>(
                      <tr key={i} style={{ borderBottom:`1px solid ${C.border}15` }}>
                        <td style={{ padding:"9px 14px", color:C.dim }}>{i+1}</td>
                        <td style={{ padding:"9px 14px", color:C.text, fontWeight:600 }}>{p.player}</td>
                        <td style={{ padding:"9px 14px", color:C.muted }}>{p.squad}</td>
                        <td style={{ padding:"9px 14px", color:C.home }}>{p.sot}</td>
                        <td style={{ padding:"9px 14px", color:"#ffd700", fontWeight:700 }}>{num(p.xG)}</td>
                        <td style={{ padding:"9px 14px", color:C.accent }}>{num(p.xG_per90,3)}</td>
                        <td style={{ padding:"9px 14px", color:C.dim }}>{num(p.dist)}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: UNDERSTAT
// ════════════════════════════════════════════════════════════════════════════
const UST_SLUGS = [
  ["EPL","Premier League 🏴󠁧󠁢󠁥󠁮󠁧󠁿"],["La_liga","La Liga 🇪🇸"],
  ["Bundesliga","Bundesliga 🇩🇪"],["Serie_A","Serie A 🇮🇹"],
  ["Ligue_1","Ligue 1 🇫🇷"],["RFPL","Liga Russa 🇷🇺"],
];

function UnderstatPage() {
  const [slug, setSlug]       = useState("EPL");
  const [season, setSeason]   = useState(2024);
  const [teams, setTeams]     = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const [tab, setTab]         = useState("teams");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const [td,md] = await Promise.all([api.understatTeams(slug,season), api.understatMatches(slug,season)]);
      setTeams(td.teams||[]); setMatches(md.matches||[]);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <Card style={{ marginBottom:20 }}>
        <SLabel>Understat · xG desde 2014/15 · Big 5 + RFPL · Gratuito</SLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:10, alignItems:"end" }}>
          <select value={slug} onChange={e=>setSlug(e.target.value)}
            style={{ padding:"10px 12px", background:C.surface, border:`1px solid ${C.borderLight}`, borderRadius:8, color:C.text, fontSize:12, outline:"none", cursor:"pointer" }}>
            {UST_SLUGS.map(([s,l])=><option key={s} value={s} style={{ background:C.card }}>{l}</option>)}
          </select>
          <input type="number" value={season} onChange={e=>setSeason(+e.target.value)}
            style={{ width:90, padding:"10px 12px", background:C.surface, border:`1px solid ${C.borderLight}`, borderRadius:8, color:C.text, fontSize:12, fontFamily:mono, outline:"none" }}/>
          <button onClick={load} disabled={loading}
            style={{ padding:"10px 20px", background:loading?C.border:`linear-gradient(90deg,${C.total},${C.accent})`,
              border:"none", borderRadius:8, color:loading?C.muted:C.bg, fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:mono }}>
            {loading?<Spinner size={14} color={C.muted}/>:"BUSCAR"}
          </button>
        </div>
        {err&&<div style={{ marginTop:10 }}><ErrBox msg={err}/></div>}
      </Card>

      {(teams.length>0||matches.length>0)&&(
        <>
          <div style={{ display:"flex", gap:4, background:C.surface, borderRadius:10, padding:4, marginBottom:16, width:"fit-content" }}>
            {[["teams","Times"],["matches","Partidas"]].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)}
                style={{ padding:"6px 18px", borderRadius:8, border:"none", cursor:"pointer",
                  background:tab===t?C.card:"transparent", color:tab===t?C.accent:C.muted,
                  fontWeight:tab===t?700:500, fontSize:12, fontFamily:mono }}>{l}</button>
            ))}
          </div>
          {tab==="teams"&&(
            <Card style={{ padding:0, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}><SLabel>xG por Time · {slug} {season}</SLabel></div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:mono }}>
                <thead><tr style={{ background:C.surface }}>
                  {["#","Time","PJ","xG/J","xGA/J","W","D","L","Pts"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", color:C.dim, textAlign:"left", fontSize:10 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {teams.map((t,i)=>(
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}15` }}>
                      <td style={{ padding:"9px 14px", color:C.dim }}>{i+1}</td>
                      <td style={{ padding:"9px 14px", color:C.text, fontWeight:600 }}>{t.team_name}</td>
                      <td style={{ padding:"9px 14px", color:C.muted }}>{t.matches}</td>
                      <td style={{ padding:"9px 14px", color:C.accent, fontWeight:700 }}>{num(t.xG_avg)}</td>
                      <td style={{ padding:"9px 14px", color:C.away }}>{num(t.xGA_avg)}</td>
                      <td style={{ padding:"9px 14px", color:C.success }}>{t.wins}</td>
                      <td style={{ padding:"9px 14px", color:C.warn }}>{t.draws}</td>
                      <td style={{ padding:"9px 14px", color:C.away }}>{t.losses}</td>
                      <td style={{ padding:"9px 14px", color:"#ffd700", fontWeight:700 }}>{t.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {tab==="matches"&&(
            <Card style={{ padding:0, overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}><SLabel>Partidas com xG · {slug} {season}</SLabel></div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:mono }}>
                <thead><tr style={{ background:C.surface }}>
                  {["Data","Casa","xG","Res","xG","Fora"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", color:C.dim, textAlign:"center", fontSize:10 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {matches.slice(0,30).map((m,i)=>(
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}15` }}>
                      <td style={{ padding:"9px 14px", color:C.dim }}>{m.date?.slice(0,10)}</td>
                      <td style={{ padding:"9px 14px", color:C.home, fontWeight:600 }}>{m.home_team}</td>
                      <td style={{ padding:"9px 14px", color:C.accent, textAlign:"center" }}>{num(m.home_xG)}</td>
                      <td style={{ padding:"9px 14px", color:C.text, fontWeight:700, textAlign:"center" }}>{m.home_goals}–{m.away_goals}</td>
                      <td style={{ padding:"9px 14px", color:C.accent, textAlign:"center" }}>{num(m.away_xG)}</td>
                      <td style={{ padding:"9px 14px", color:C.away, fontWeight:600 }}>{m.away_team}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: STATSBOMB
// ════════════════════════════════════════════════════════════════════════════
function StatsBombPage() {
  const isMobile = useIsMobile();
  const [comps, setComps]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [matches, setMatches]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState("");

  useEffect(() => { api.sbCompetitions().then(d=>setComps(d.competitions||[])).catch(e=>setErr(e.message)); }, []);

  const pick = async (c) => {
    setSelected(c); setMatches([]); setLoading(true);
    try { const d=await api.sbMatches(c.competition_id,c.season_id); setMatches(d.matches||[]); }
    catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "260px 1fr", gap:20 }}>
      <div>
        <SLabel>StatsBomb Open Data · Gratuito · GitHub</SLabel>
        {err&&<ErrBox msg={err}/>}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {comps.map((c,i)=>(
            <div key={i} onClick={()=>pick(c)}
              style={{ padding:"10px 14px", borderRadius:8, cursor:"pointer",
                background:selected?.key===c.key?C.accentDim:C.card,
                border:`1px solid ${selected?.key===c.key?C.accent:C.border}`,
                transition:"all 0.15s" }}>
              <div style={{ fontSize:12, fontWeight:600, color:selected?.key===c.key?C.accent:C.text }}>{c.key}</div>
              <div style={{ fontSize:9, color:C.dim, fontFamily:mono, marginTop:2 }}>
                comp:{c.competition_id} · season:{c.season_id}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        {!selected&&<EmptyState icon="🎯" title="Selecione uma competição" sub="Dados com xG por chute e posição exata no campo"/>}
        {loading&&<LoadingState/>}
        {selected&&!loading&&matches.length>0&&(
          <Card style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
              <SLabel>{selected.key} · {matches.length} partidas</SLabel>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:mono }}>
              <thead><tr style={{ background:C.surface }}>
                {["Data","Casa","Res","Fora","Estádio"].map(h=>(
                  <th key={h} style={{ padding:"10px 14px", color:C.dim, textAlign:"left", fontSize:10 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {matches.map((m,i)=>(
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}15` }}>
                    <td style={{ padding:"9px 14px", color:C.dim }}>{m.date}</td>
                    <td style={{ padding:"9px 14px", color:C.home, fontWeight:600 }}>{m.home_team}</td>
                    <td style={{ padding:"9px 14px", color:C.text, fontWeight:700 }}>{m.home_score}–{m.away_score}</td>
                    <td style={{ padding:"9px 14px", color:C.away, fontWeight:600 }}>{m.away_team}</td>
                    <td style={{ padding:"9px 14px", color:C.dim }}>{m.stadium||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: CALIBRATION
// ════════════════════════════════════════════════════════════════════════════
function CalibrationPage() {
  const isMobile = useIsMobile();
  const [leagueId, setLeagueId]     = useState(71);
  const [homeName, setHomeName]     = useState("");
  const [awayName, setAwayName]     = useState("");
  const [predHome, setPredHome]     = useState("");
  const [predAway, setPredAway]     = useState("");
  const [actualHome, setActualHome] = useState("");
  const [actualAway, setActualAway] = useState("");
  const [sending, setSending]       = useState(false);
  const [feedback, setFeedback]     = useState(null);
  const [stats, setStats]           = useState(null);
  const [history, setHistory]       = useState(() => {
    try { return JSON.parse(localStorage.getItem("shotiq_calib_history")||"[]"); } catch { return []; }
  });

  const loadStats = async (lid) => {
    try { setStats(await api.calibration(lid)); } catch {}
  };
  useEffect(() => { loadStats(leagueId); }, [leagueId]);

  const submit = async () => {
    if (!predHome||!predAway||!actualHome||!actualAway) { setFeedback({ok:false,msg:"Preencha todos os campos."}); return; }
    setSending(true); setFeedback(null);
    try {
      const p = new URLSearchParams({ league_id:leagueId, lambda_season_pred:predHome, lambda_form_pred:predAway, actual_sot:actualHome });
      const data = await apiFetch(`/calibration/feedback?${p}`,{method:"POST"});
      const entry = { date:new Date().toLocaleDateString("pt-BR"), home:homeName||"Time A", away:awayName||"Time B",
        pred_home:+predHome, pred_away:+predAway, real_home:+actualHome, real_away:+actualAway,
        err_home:Math.abs(+predHome - +actualHome).toFixed(2), err_away:Math.abs(+predAway-+actualAway).toFixed(2) };
      const nh = [entry,...history].slice(0,50);
      setHistory(nh); localStorage.setItem("shotiq_calib_history",JSON.stringify(nh));
      setFeedback({ok:true,msg:"✓ Resultado registrado! Modelo recalibrado."});
      setStats(data.calibration);
      setHomeName(""); setAwayName(""); setPredHome(""); setPredAway(""); setActualHome(""); setActualAway("");
    } catch(e) { setFeedback({ok:false,msg:`Erro: ${e.message}`}); }
    finally { setSending(false); }
  };

  const RC = { adapted:C.success, warming_up:C.warn, default:C.muted };

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:900, fontFamily:display, color:C.text, margin:"0 0 6px" }}>🧠 Treinar o Modelo</h2>
        <p style={{ fontSize:12, color:C.muted, margin:0, lineHeight:1.6 }}>
          Informe os resultados reais após os jogos. Com 8+ partidas registradas, os pesos do ensemble se adaptam automaticamente.
        </p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card>
            <SLabel>Liga</SLabel>
            <select value={leagueId} onChange={e=>{setLeagueId(+e.target.value); loadStats(+e.target.value);}}
              style={{ width:"100%", padding:"10px 12px", background:C.surface, border:`1px solid ${C.borderLight}`, borderRadius:8, color:C.text, fontSize:12, outline:"none" }}>
              {[[71,"🇧🇷 Brasileirão"],[39,"🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League"],[140,"🇪🇸 La Liga"],[78,"🇩🇪 Bundesliga"],[135,"🇮🇹 Serie A"],[61,"🇫🇷 Ligue 1"],[2,"🏆 Champions League"],[13,"🏆 Libertadores"]].map(([id,n])=>(
                <option key={id} value={id} style={{ background:C.card }}>{n}</option>
              ))}
            </select>
          </Card>
          <Card>
            <SLabel>Partida</SLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:5 }}>MANDANTE</label>
                <input value={homeName} onChange={e=>setHomeName(e.target.value)} placeholder="Ex: Flamengo"
                  style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${C.home}40`, borderRadius:8, color:C.home, fontSize:12, outline:"none" }}/>
              </div>
              <div>
                <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:5 }}>VISITANTE</label>
                <input value={awayName} onChange={e=>setAwayName(e.target.value)} placeholder="Ex: Vasco"
                  style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${C.away}40`, borderRadius:8, color:C.away, fontSize:12, outline:"none" }}/>
              </div>
            </div>
          </Card>
          <Card>
            <SLabel>λ Previsto pelo modelo</SLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[{l:"λ Mandante",v:predHome,s:setPredHome,c:C.home},{l:"λ Visitante",v:predAway,s:setPredAway,c:C.away}].map(({l,v,s,c})=>(
                <div key={l}>
                  <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:5 }}>{l}</label>
                  <input type="number" step="0.1" value={v} onChange={e=>s(e.target.value)} placeholder="Ex: 6.2"
                    style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${c}40`, borderRadius:8, color:c, fontSize:13, fontFamily:mono, outline:"none" }}/>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SLabel>Chutes ao gol reais</SLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[{l:"Mandante",v:actualHome,s:setActualHome,c:C.home},{l:"Visitante",v:actualAway,s:setActualAway,c:C.away}].map(({l,v,s,c})=>(
                <div key={l}>
                  <label style={{ fontSize:10, color:C.dim, fontFamily:mono, display:"block", marginBottom:5 }}>{l}</label>
                  <input type="number" step="1" value={v} onChange={e=>s(e.target.value)} placeholder="Ex: 7"
                    style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${c}40`, borderRadius:8, color:c, fontSize:18, fontFamily:mono, fontWeight:700, outline:"none" }}/>
                </div>
              ))}
            </div>
          </Card>
          <button onClick={submit} disabled={sending}
            style={{ padding:"13px", border:"none", borderRadius:10, cursor:"pointer",
              background:sending?C.border:`linear-gradient(90deg,${C.accent},${C.total})`,
              color:sending?C.muted:C.bg, fontWeight:800, fontSize:12, letterSpacing:2, textTransform:"uppercase", fontFamily:mono }}>
            {sending?<span style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}><Spinner size={16} color={C.muted}/>ENVIANDO...</span>:"🧠 REGISTRAR E RECALIBRAR"}
          </button>
          {feedback&&(
            <div style={{ padding:"12px 16px", borderRadius:8,
              background:feedback.ok?`${C.success}12`:`${C.error}12`,
              border:`1px solid ${feedback.ok?C.success:C.error}30`,
              color:feedback.ok?C.success:C.error, fontSize:12 }}>
              {feedback.msg}
            </div>
          )}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card accent={C.accent}>
            <SLabel>Status do Modelo · Liga {leagueId}</SLabel>
            {stats?(
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                  {[
                    {l:"Amostras",v:stats.samples,c:C.accent},
                    {l:"Status",v:stats.status==="adapted"?"ADAPTADO":stats.status==="warming_up"?"AQUECENDO":"PADRÃO",c:RC[stats.status]||C.muted},
                    {l:"Peso Temporada",v:`${((stats.weights?.season||0)*100).toFixed(0)}%`,c:C.home},
                    {l:"Peso Forma",v:`${((stats.weights?.form||0)*100).toFixed(0)}%`,c:C.away},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{ background:C.surface, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                      <div style={{ fontSize:9, color:C.dim, fontFamily:mono, marginBottom:4, textTransform:"uppercase" }}>{l}</div>
                      <div style={{ fontSize:20, fontWeight:900, color:c, fontFamily:mono }}>{v}</div>
                    </div>
                  ))}
                </div>
                {stats.avg_errors&&(
                  <>
                    <SLabel>Erro Médio por Componente (MAE)</SLabel>
                    {[{l:"Erro Temporada",v:stats.avg_errors.season,c:C.home},{l:"Erro Forma",v:stats.avg_errors.form,c:C.away}].map(({l,v,c})=>(
                      <div key={l} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:11, color:C.muted }}>{l}</span>
                          <span style={{ fontSize:12, fontFamily:mono, color:c, fontWeight:700 }}>{v?.toFixed(3)}</span>
                        </div>
                        <PBar value={v||0} max={5} color={c}/>
                      </div>
                    ))}
                  </>
                )}
                <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:8 }}>
                  {stats.samples<(stats.min_samples_needed||8)?`Precisa de ${(stats.min_samples_needed||8)-stats.samples} jogos a mais para adaptar.`:"✓ Pesos adaptativos ativos."}
                </div>
              </>
            ):<div style={{ color:C.dim, fontSize:12, fontFamily:mono }}>Carregando...</div>}
          </Card>

          {history.length>0&&(
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <SLabel>{history.length} jogos registrados</SLabel>
                <button onClick={()=>{setHistory([]);localStorage.removeItem("shotiq_calib_history");}}
                  style={{ fontSize:10, color:C.error, background:"transparent", border:`1px solid ${C.error}30`, borderRadius:4, padding:"2px 8px", cursor:"pointer", fontFamily:mono }}>
                  Limpar
                </button>
              </div>
              <div style={{ maxHeight:260, overflowY:"auto" }}>
                {history.map((h,i)=>(
                  <div key={i} style={{ padding:"8px 0", borderBottom:`1px solid ${C.border}15`, display:"grid", gridTemplateColumns:"1fr auto", gap:8, alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12, color:C.text, fontWeight:600 }}>{h.home} × {h.away}</div>
                      <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>
                        Prev <span style={{ color:C.home }}>{h.pred_home}</span>/<span style={{ color:C.away }}>{h.pred_away}</span>
                        {" · "}Real <span style={{ color:C.home }}>{h.real_home}</span>/<span style={{ color:C.away }}>{h.real_away}</span>
                        {" · "}{h.date}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:10, color:C.dim, fontFamily:mono }}>MAE</div>
                      <div style={{ fontSize:14, fontWeight:700, fontFamily:mono, color:+h.err_home<1.5?C.success:+h.err_home<2.5?C.warn:C.error }}>
                        {(((+h.err_home)+(+h.err_away))/2).toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {history.length===0&&(
            <EmptyState icon="🧠" title="Nenhum jogo registrado" sub={`Faça uma análise antes do jogo,\ndepois volte aqui com o resultado real.`}/>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: SETTINGS
// ════════════════════════════════════════════════════════════════════════════
function SettingsPage() {
  const [keys, setKeys]       = useState(loadKeys());
  const [saved, setSaved]     = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState(null);

  const update = (f,v) => { setKeys(p=>({...p,[f]:v})); setSaved(false); };
  const save = () => { saveKeys(keys); setSaved(true); setTimeout(()=>setSaved(false),2500); };
  const test = async () => {
    setTesting(true); setTestRes(null); saveKeys(keys);
    try { const d=await api.usage(); setTestRes({ok:true,msg:`Conectado · Plano: ${d.plan} · ${d.remaining} análises restantes hoje`}); }
    catch { setTestRes({ok:false,msg:"Não foi possível validar. Verifique a chave."}); }
    finally { setTesting(false); }
  };

  const FieldCard = ({ title, sub, link, linkLabel, field, placeholder, color=C.accent }) => (
    <Card style={{ marginBottom:14 }}>
      <SLabel>{title}</SLabel>
      {sub&&<p style={{ fontSize:11, color:C.dim, marginBottom:12, lineHeight:1.6 }}>
        {sub} {link&&<a href={link} target="_blank" rel="noreferrer" style={{ color:C.accent }}>{linkLabel}</a>}
      </p>}
      <input type="password" value={keys[field]||""} onChange={e=>update(field,e.target.value)} placeholder={placeholder}
        style={{ width:"100%", padding:"11px 14px", background:C.surface, border:`1px solid ${C.borderLight}`, borderRadius:8, color:C.text, fontSize:13, outline:"none", fontFamily:mono }}/>
    </Card>
  );

  return (
    <div style={{ maxWidth:600 }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:900, fontFamily:display, color:C.text, margin:"0 0 6px" }}>⚙️ Configurações</h2>
        <p style={{ fontSize:12, color:C.muted, margin:0 }}>As chaves ficam salvas só neste dispositivo — nunca enviadas a terceiros.</p>
      </div>

      <FieldCard title="API-Football · obrigatória para dados reais" field="football" placeholder="Cole sua chave da API-Football"
        sub="Crie gratuitamente (100 req/dia) em" link="https://www.api-football.com" linkLabel="api-football.com"/>

      <div style={{ marginBottom:14 }}>
        <button onClick={test} disabled={testing||!keys.football}
          style={{ padding:"9px 18px", borderRadius:8, border:"none", cursor:keys.football?"pointer":"not-allowed",
            background:keys.football?C.accentDim:C.border, color:keys.football?C.accent:C.dim,
            fontSize:11, fontFamily:mono, letterSpacing:1, fontWeight:700 }}>
          {testing?<span style={{ display:"flex",alignItems:"center",gap:8 }}><Spinner size={12}/>TESTANDO...</span>:"🔌 TESTAR CONEXÃO"}
        </button>
        {testRes&&(
          <div style={{ marginTop:10, padding:"10px 14px", borderRadius:8,
            background:testRes.ok?`${C.success}10`:`${C.error}10`,
            border:`1px solid ${testRes.ok?C.success:C.error}25`,
            color:testRes.ok?C.success:C.error, fontSize:11 }}>
            {testRes.ok?"✓ ":"⚠ "}{testRes.msg}
          </div>
        )}
      </div>

      <FieldCard title="Gemini · análise de bilhete + leitura tática (gratuito)" field="gemini" placeholder="Cole sua chave do Gemini (opcional)"
        sub="Sem custo, sem cartão em" link="https://aistudio.google.com/apikey" linkLabel="aistudio.google.com/apikey"
        color={C.total}/>

      <FieldCard title="Grok · alternativa ao Gemini (opcional)" field="grok" placeholder="Cole sua chave do Grok (opcional)"
        color={C.home}/>

      <button onClick={save}
        style={{ width:"100%", padding:"13px", border:"none", borderRadius:10, cursor:"pointer",
          background:saved?C.success:`linear-gradient(90deg,${C.home},${C.accent})`,
          color:C.bg, fontWeight:800, fontSize:13, letterSpacing:2, textTransform:"uppercase", fontFamily:mono }}>
        {saved?"✓ SALVO":"💾 SALVAR CONFIGURAÇÕES"}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  NAVIGATION CONFIG
// ════════════════════════════════════════════════════════════════════════════
const NAV = [
  { id:"live",        icon:"🔴", label:"Ao Vivo",   short:"Live"  },
  { id:"analyze",     icon:"⚡", label:"Análise",   short:"Análise"},
  { id:"ticket",      icon:"🎟️", label:"Bilhete",   short:"Bilhete"},
  { id:"leagues",     icon:"🌍", label:"Ligas",     short:"Ligas"  },
  { id:"fbref",       icon:"📊", label:"FBref",     short:"FBref"  },
  { id:"understat",   icon:"📈", label:"Understat", short:"UStat"  },
  { id:"statsbomb",   icon:"🎯", label:"StatsBomb", short:"SBomb"  },
  { id:"calibration", icon:"🧠", label:"Treinar",   short:"Treinar"},
  { id:"settings",    icon:"⚙️", label:"Config",    short:"Config" },
];

// Bottom nav shows top 5 on mobile
const BOTTOM_NAV = ["live","analyze","ticket","calibration","settings"];

// ════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage]           = useState("live");
  const [sidebarOpen, setSidebar] = useState(true);
  const [health, setHealth]       = useState(null);
  const [hasKey, setHasKey]       = useState(!!loadKeys().football);
  const [liveCount, setLiveCount] = useState(0);
  const isMobile                  = useIsMobile();

  useEffect(() => {
    api.health().then(setHealth).catch(()=>{});
    api.liveAll().then(d=>setLiveCount((d.matches||[]).length)).catch(()=>{});
  }, []);

  useEffect(() => { setHasKey(!!loadKeys().football); }, [page]);

  // On mobile: no sidebar. On desktop: sidebar with toggle.
  const showSidebar = !isMobile;
  const sidebarW    = !showSidebar ? 0 : sidebarOpen ? 220 : 64;

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, color:C.text, fontFamily:body }}>

      {/* ── SIDEBAR (desktop only) ────────────────────────────────────────── */}
      {showSidebar && (
      <div style={{
        width:sidebarW, minHeight:"100vh", background:C.sidebar,
        borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column",
        position:"fixed", left:0, top:0, zIndex:100,
        transition:"width 0.2s cubic-bezier(.4,0,.2,1)",
        overflow:"hidden",
      }}>
        {/* Logo */}
        <div style={{ padding:"20px 16px 16px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{
              width:36, height:36, borderRadius:10, flexShrink:0,
              background:`linear-gradient(135deg,${C.home},${C.accent})`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:18, boxShadow:`0 0 20px ${C.accent}30`,
            }}>⚽</div>
            {sidebarOpen && (
              <div>
                <div style={{ fontSize:16, fontWeight:900, fontFamily:display, letterSpacing:1, color:C.text }}>ShotIQ</div>
                <div style={{ fontSize:9, color:C.dim, fontFamily:mono, letterSpacing:2 }}>SHOT ENGINE v4</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex:1, padding:"12px 8px", overflowY:"auto" }}>
          {NAV.map(n => {
            const active = page===n.id;
            return (
              <button key={n.id} onClick={()=>setPage(n.id)}
                title={!sidebarOpen?n.label:undefined}
                style={{
                  width:"100%", padding: sidebarOpen?"10px 12px":"10px",
                  borderRadius:10, border:"none", cursor:"pointer",
                  background:active?C.accentDim:"transparent",
                  display:"flex", alignItems:"center",
                  gap:sidebarOpen?12:0,
                  justifyContent:sidebarOpen?"flex-start":"center",
                  marginBottom:4, transition:"all 0.15s",
                  boxShadow:active?`inset 3px 0 0 ${C.accent}`:"none",
                }}>
                <span style={{ fontSize:18, flexShrink:0, filter:active?"none":"grayscale(0.3)" }}>{n.icon}</span>
                {sidebarOpen && (
                  <span style={{ fontSize:13, fontWeight:active?700:500, color:active?C.accent:C.muted, whiteSpace:"nowrap" }}>
                    {n.label}
                  </span>
                )}
                {sidebarOpen && n.id==="live" && liveCount>0 && (
                  <span style={{ marginLeft:"auto", fontSize:10, background:C.live, color:"#fff",
                    borderRadius:10, padding:"1px 7px", fontFamily:mono, fontWeight:700 }}>
                    {liveCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Status + toggle */}
        <div style={{ padding:"12px 8px", borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
          {health && sidebarOpen && (
            <div style={{ marginBottom:10, padding:"8px 12px", background:C.card, borderRadius:8 }}>
              {Object.entries(health.sources||{}).map(([src,ok])=>(
                <div key={src} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:ok?C.success:C.error, flexShrink:0 }}/>
                  <span style={{ fontSize:10, color:ok?C.success:C.error, fontFamily:mono }}>{src.replace("_","-")}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={()=>setSidebar(p=>!p)}
            style={{ width:"100%", padding:"8px", borderRadius:8, border:"none", background:"transparent",
              cursor:"pointer", color:C.dim, fontSize:18, display:"flex", alignItems:"center",
              justifyContent:sidebarOpen?"flex-end":"center" }}>
            {sidebarOpen?"◀":"▶"}
          </button>
        </div>
      </div>
      )} {/* end showSidebar */}

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <div style={{
        marginLeft:sidebarW,
        flex:1,
        minWidth:0,
        transition:"margin-left 0.2s cubic-bezier(.4,0,.2,1)",
        paddingBottom: isMobile ? 80 : 40,
      }}>
        {/* Top bar */}
        <div style={{
          position:"sticky", top:0, zIndex:50,
          background:`${C.bg}f0`, backdropFilter:"blur(12px)",
          borderBottom:`1px solid ${C.border}`,
          padding: isMobile ? "12px 16px" : "14px 28px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 16 : 18, fontWeight:800, fontFamily:display, color:C.text, margin:0 }}>
              {NAV.find(n=>n.id===page)?.icon} {NAV.find(n=>n.id===page)?.label}
            </h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {!hasKey && page!=="settings" && (
              <button onClick={()=>setPage("settings")}
                style={{ fontSize:11, color:C.warn, background:`${C.warn}12`,
                  border:`1px solid ${C.warn}30`, borderRadius:8, padding:"5px 12px",
                  cursor:"pointer", fontFamily:mono }}>
                ⚠ {isMobile ? "Config" : "Configurar API Key"}
              </button>
            )}
            {liveCount>0 && <Badge color={C.live}>{liveCount} ao vivo</Badge>}
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding: isMobile ? "16px 14px" : "28px" }}>
          {page==="live"        && <LivePage/>}
          {page==="analyze"     && <AnalyzePage/>}
          {page==="ticket"      && <TicketPage/>}
          {page==="leagues"     && <LeaguesPage/>}
          {page==="fbref"       && <FBrefPage/>}
          {page==="understat"   && <UnderstatPage/>}
          {page==="statsbomb"   && <StatsBombPage/>}
          {page==="calibration" && <CalibrationPage/>}
          {page==="settings"    && <SettingsPage/>}
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV (JS controlled — reliable) ─────────────────── */}
      {isMobile && (
      <div style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:200,
        background:`${C.sidebar}fc`, backdropFilter:"blur(20px)",
        borderTop:`1px solid ${C.border}`,
        display:"flex", justifyContent:"space-around", alignItems:"center",
        paddingTop:8,
        paddingBottom:`max(10px, env(safe-area-inset-bottom))`,
      }}>
        {BOTTOM_NAV.map(id => {
          const n = NAV.find(x=>x.id===id);
          const active = page===id;
          return (
            <button key={id} onClick={()=>setPage(id)}
              style={{
                display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                padding:"6px 8px", border:"none", background:"transparent", cursor:"pointer",
                flex:1, position:"relative", minWidth:0,
              }}>
              {active && <div style={{ position:"absolute", top:-1, left:"50%", transform:"translateX(-50%)", width:24, height:3, background:C.accent, borderRadius:2 }}/>}
              <span style={{ fontSize:24, lineHeight:1 }}>{n?.icon}</span>
              <span style={{ fontSize:10, color:active?C.accent:C.dim, fontFamily:mono, fontWeight:active?700:400, marginTop:2 }}>
                {n?.short}
              </span>
              {id==="live" && liveCount>0 && (
                <div style={{ position:"absolute", top:4, right:"calc(50% - 16px)", width:8, height:8, borderRadius:"50%", background:C.live, border:`2px solid ${C.bg}` }}/>
              )}
            </button>
          );
        })}
      </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.4)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:${C.bg}; }
        ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
        button:hover:not(:disabled) { opacity:0.85; }
        input, select { color-scheme:dark; }
        input::placeholder { color:${C.dim}; }
        @media (max-width: 768px) {
          .rg-2 { grid-template-columns: 1fr !important; }
          .rg-3 { grid-template-columns: 1fr 1fr !important; }
        }

      `}</style>
    </div>
  );
}
