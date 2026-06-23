import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════════════════════
// URL do backend: em produção (Vercel), defina VITE_API_URL nas env vars do
// projeto apontando para o seu serviço no Render, ex:
//   VITE_API_URL=https://shotiq-backend.onrender.com/api/v1
// Em dev local, cai automaticamente em localhost:8000.
const API = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL)
  || "http://localhost:8000/api/v1";

const LIVE_INTERVAL = 30000;

// ── Armazenamento local das chaves (cada usuário usa a própria) ─────────────
const STORAGE_KEY = "shotiq_keys_v1";

function loadKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { football: "", gemini: "", grok: "" };
  } catch { return { football: "", gemini: "", grok: "" }; }
}
function saveKeys(keys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

// ════════════════════════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ════════════════════════════════════════════════════════════════════════════
const C = {
  bg:          "#03070f",
  surface:     "#060d1a",
  card:        "#091422",
  cardHover:   "#0c1a2e",
  border:      "#0e2035",
  borderBright:"#1a3a6b",
  text:        "#ddeeff",
  muted:       "#6a8ab0",
  dim:         "#2a4060",
  accent:      "#00f0b5",
  accentDim:   "#00f0b512",
  home:        "#38b6ff",
  homeDim:     "#38b6ff10",
  away:        "#ff5f87",
  awayDim:     "#ff5f8710",
  total:       "#a78bfa",
  totalDim:    "#a78bfa10",
  live:        "#ff3d3d",
  success:     "#3dffaa",
  warn:        "#ffcc00",
  gold:        "#ffd700",
};
const mono = "'JetBrains Mono', 'Fira Code', monospace";
const display = "'Barlow Condensed', 'Rajdhani', sans-serif";
const body = "'Inter', 'DM Sans', sans-serif";

// ════════════════════════════════════════════════════════════════════════════
//  API CLIENT
// ════════════════════════════════════════════════════════════════════════════
function authHeaders() {
  const keys = loadKeys();
  const h = {};
  if (keys.football) h["X-Football-Key"] = keys.football;
  if (keys.gemini)   h["X-Gemini-Key"] = keys.gemini;
  if (keys.grok)     h["X-Grok-Key"] = keys.grok;
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
  health:          ()              => fetch(API.replace("/api/v1","") + "/health").then(r=>r.json()),
  usage:           ()              => apiFetch("/usage"),
  leagues:         (tier)          => apiFetch(`/leagues${tier ? `?tier=${tier}` : ""}`),
  liveAll:         ()              => apiFetch("/live/all"),
  liveLeague:      (id)            => apiFetch(`/leagues/${id}/live`),
  fixtures:        (id, days=7)    => apiFetch(`/leagues/${id}/fixtures?days_ahead=${days}`),
  standings:       (id)            => apiFetch(`/leagues/${id}/standings`),
  analyze:         (body)          => apiFetch("/analyze", { method:"POST", body: JSON.stringify(body) }),
  analyzeQuick:    (p)             => apiFetch(`/analyze/quick?home=${p.home}&away=${p.away}&league_id=${p.league_id}&home_sog=${p.home_sog||5.2}&away_sog=${p.away_sog||4.8}`),
  analyzeLive:     (body)          => apiFetch("/analyze/live", { method:"POST", body: JSON.stringify(body) }),
  analyzeInsight:  (body)          => apiFetch("/analyze/insight", { method:"POST", body: JSON.stringify(body) }),
  understatTeams:  (slug, season)  => apiFetch(`/understat/${slug}/${season}/teams`),
  understatMatches:(slug, season)  => apiFetch(`/understat/${slug}/${season}/matches`),
  sbCompetitions:  ()              => apiFetch("/statsbomb/competitions"),
  sbMatches:       (cid, sid)      => apiFetch(`/statsbomb/matches/${cid}/${sid}`),
  fbrefShooting:   (key, season)   => apiFetch(`/fbref/${key}/${season}/shooting`),
  fbrefPlayers:    (key, season)   => apiFetch(`/fbref/${key}/${season}/players`),
  fbrefLeagues:    ()              => apiFetch("/fbref/leagues"),
};

// ════════════════════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════════════════════
function pct(v, d=1) { return `${(v*100).toFixed(d)}%`; }
function num(v, d=2) { return typeof v === "number" ? v.toFixed(d) : "—"; }
function useInterval(fn, ms) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => { const t = setInterval(() => ref.current(), ms); return () => clearInterval(t); }, [ms]);
}

// ════════════════════════════════════════════════════════════════════════════
//  UI PRIMITIVES
// ════════════════════════════════════════════════════════════════════════════
function LiveDot() {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:C.live,
        boxShadow:`0 0 8px ${C.live}`, animation:"pulse 1.2s infinite" }} />
      <span style={{ fontSize:10, color:C.live, fontFamily:mono, letterSpacing:2 }}>AO VIVO</span>
    </span>
  );
}

function Tag({ children, color=C.accent, size=10 }) {
  return <span style={{ fontSize:size, fontFamily:mono, letterSpacing:1.5, color,
    background:`${color}18`, border:`1px solid ${color}35`,
    padding:"2px 8px", borderRadius:4, textTransform:"uppercase", whiteSpace:"nowrap" }}>{children}</span>;
}

function Card({ children, style={}, glow, onClick }) {
  return <div onClick={onClick} style={{ background:C.card, border:`1px solid ${C.border}`,
    borderRadius:12, padding:20, boxShadow: glow ? `0 0 24px ${glow}18` : "none",
    cursor: onClick ? "pointer" : "default", transition:"border-color 0.2s",
    ...style }}>{children}</div>;
}

function SectionLabel({ children }) {
  return <div style={{ fontSize:10, fontFamily:mono, letterSpacing:3, color:C.dim,
    textTransform:"uppercase", marginBottom:12 }}>{children}</div>;
}

function PBar({ value, max=1, color, h=5 }) {
  return <div style={{ height:h, background:C.border, borderRadius:h, overflow:"hidden" }}>
    <div style={{ height:"100%", width:`${Math.min(value/max*100,100)}%`, background:color,
      borderRadius:h, boxShadow:`0 0 6px ${color}70`, transition:"width 1s ease" }} />
  </div>;
}

function Spinner({ size=32 }) {
  return <div style={{ width:size, height:size, border:`3px solid ${C.border}`,
    borderTop:`3px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />;
}

function ErrorBox({ msg }) {
  return <div style={{ background:"#1a0a0a", border:`1px solid ${C.away}40`, borderRadius:10,
    padding:"14px 18px", color:C.away, fontSize:12, fontFamily:mono }}>⚠ {msg}</div>;
}

function StatDuel({ label, homeVal, awayVal, homeColor=C.home, awayColor=C.away }) {
  const h = parseFloat(homeVal) || 0, a = parseFloat(awayVal) || 0, t = h + a || 1;
  return <div style={{ marginBottom:10 }}>
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:11 }}>
      <span style={{ fontFamily:mono, color:homeColor, fontWeight:700 }}>{homeVal}</span>
      <span style={{ color:C.dim, fontSize:10 }}>{label}</span>
      <span style={{ fontFamily:mono, color:awayColor, fontWeight:700 }}>{awayVal}</span>
    </div>
    <div style={{ height:6, background:C.border, borderRadius:6, display:"flex", overflow:"hidden" }}>
      <div style={{ width:`${h/t*100}%`, background:homeColor, transition:"width 1s ease" }} />
      <div style={{ flex:1, background:awayColor }} />
    </div>
  </div>;
}

function MiniDist({ dist, color, mode, max=16 }) {
  const slice = dist?.slice(0,max) || [];
  const maxP = Math.max(...slice.map(d=>d.p), 0.001);
  return <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:56 }}>
    {slice.map(({k,p}) => (
      <div key={k} title={`P(${k})=${pct(p)}`}
        style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
        <div style={{ width:"100%", height:`${Math.max(2,(p/maxP)*48)}px`,
          background: k===mode ? color : `${color}35`, borderRadius:"2px 2px 0 0",
          boxShadow: k===mode ? `0 -2px 8px ${color}` : "none", transition:"height 0.8s ease" }} />
        {k%4===0 && <span style={{ fontSize:8, color:C.dim, marginTop:2, fontFamily:mono }}>{k}</span>}
      </div>
    ))}
  </div>;
}

function LoadingCard({ label }) {
  return <Card style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:40 }}>
    <Spinner />
    <span style={{ fontSize:11, color:C.dim, fontFamily:mono }}>{label || "Carregando..."}</span>
  </Card>;
}

// ════════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════════════════════
const PAGES = [
  { id:"live",      icon:"🔴", label:"Ao Vivo" },
  { id:"analyze",   icon:"⚡", label:"Análise" },
  { id:"leagues",   icon:"🌍", label:"Ligas" },
  { id:"fbref",     icon:"📊", label:"FBref" },
  { id:"understat", icon:"📈", label:"Understat" },
  { id:"statsbomb", icon:"🎯", label:"StatsBomb" },
  { id:"settings",  icon:"⚙️", label:"Config" },
];

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: LIVE
// ════════════════════════════════════════════════════════════════════════════
function LivePage() {
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [err, setErr] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const sseRef = useRef(null);

  const loadLive = useCallback(async () => {
    try {
      const data = await api.liveAll();
      setMatches(data.matches || []);
      setLastSync(new Date());
      setErr("");
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLive(); }, []);
  // Lista de jogos ainda usa polling leve (10s) — só o jogo selecionado usa SSE
  useInterval(loadLive, LIVE_INTERVAL);

  // Fecha a conexão SSE ao desmontar o componente
  useEffect(() => () => sseRef.current?.close(), []);

  const selectMatch = (m) => {
    setSelected(m);
    setLiveData(null);
    setLoadingAnalysis(true);
    setSseConnected(false);

    // Fecha stream anterior antes de abrir um novo
    sseRef.current?.close();

    const params = new URLSearchParams({
      home_team_id: m.home?.id || 0,
      away_team_id: m.away?.id || 0,
      home_team_name: m.home?.name || "",
      away_team_name: m.away?.name || "",
      league_id: m.league_id || 71,
      football_key: loadKeys().football || "",
    });

    const es = new EventSource(`${API}/sse/live/${m.fixture_id}?${params}`);
    sseRef.current = es;

    es.addEventListener("update", (e) => {
      try {
        const data = JSON.parse(e.data);
        setLiveData(data);
        setLoadingAnalysis(false);
        setSseConnected(true);
      } catch {}
    });
    es.addEventListener("heartbeat", () => setSseConnected(true));
    es.addEventListener("ended", () => { es.close(); setSseConnected(false); });
    es.onerror = () => {
      setSseConnected(false);
      setLoadingAnalysis(false);
      // EventSource reconecta sozinho; só avisamos visualmente
    };
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"320px 1fr", gap:20, alignItems:"start" }}>
      {/* Match list */}
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <SectionLabel>{matches.length} partidas ao vivo</SectionLabel>
          {lastSync && <span style={{ fontSize:9, color:C.dim, fontFamily:mono }}>
            {lastSync.toLocaleTimeString("pt-BR")}
          </span>}
        </div>
        {loading ? <LoadingCard label="Buscando partidas ao vivo..." /> :
         err ? <ErrorBox msg={err} /> :
         matches.length === 0 ?
          <Card style={{ textAlign:"center", padding:40, color:C.dim }}>
            <div style={{ fontSize:32, marginBottom:10 }}>📡</div>
            <div style={{ fontFamily:display, fontSize:15 }}>Nenhuma partida ao vivo agora</div>
            <div style={{ fontSize:11, fontFamily:mono, marginTop:6 }}>Atualiza a cada 30s</div>
          </Card> :
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {matches.map((m, i) => {
              const sel = selected?.fixture_id === m.fixture_id;
              const isLive = ["1H","2H","HT"].includes(m.status_short);
              return <div key={i} onClick={() => selectMatch(m)} style={{
                background: sel ? `${C.home}10` : C.card,
                border:`1px solid ${sel ? C.home : isLive ? C.live+"40" : C.border}`,
                borderRadius:10, padding:"12px 14px", cursor:"pointer",
                boxShadow: sel ? `0 0 16px ${C.home}20` : "none", transition:"all 0.2s",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  {isLive ? <LiveDot /> : <Tag color={C.warn}>{m.status_short}</Tag>}
                  <span style={{ fontSize:10, fontFamily:mono, color:C.dim }}>{m.elapsed}'</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.home, fontFamily:display, flex:1 }}>{m.home?.name}</span>
                  <span style={{ fontSize:20, fontWeight:900, fontFamily:mono, color:C.text, padding:"0 10px" }}>
                    {m.score_home ?? "–"} — {m.score_away ?? "–"}
                  </span>
                  <span style={{ fontSize:13, fontWeight:700, color:C.away, fontFamily:display, flex:1, textAlign:"right" }}>{m.away?.name}</span>
                </div>
                {m.league_name && <div style={{ fontSize:9, color:C.dim, fontFamily:mono, marginTop:6 }}>
                  {m.league_country} · {m.league_name}
                </div>}
              </div>;
            })}
          </div>
        }
      </div>

      {/* Analysis panel */}
      <div>
        {!selected ? <Card style={{ textAlign:"center", padding:60, color:C.dim }}>
            <div style={{ fontSize:40, marginBottom:12, opacity:0.4 }}>⚡</div>
            <div style={{ fontFamily:display, fontSize:16 }}>Selecione uma partida ao vivo</div>
          </Card> :
          loadingAnalysis ? <LoadingCard label="Conectando stream ao vivo (SSE)..." /> :
          liveData ? <LiveAnalysisView data={liveData} match={selected} sseConnected={sseConnected} /> :
          <ErrorBox msg="Análise indisponível para esta partida" />
        }
      </div>
    </div>
  );
}

function LiveAnalysisView({ data, match, sseConnected }) {
  const ls = data.live_stats || {};
  const hls = ls.home || {};
  const als = ls.away || {};
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${C.homeDim},${C.card},${C.awayDim})`,
        border:`1px solid ${C.live}30`, borderRadius:12, padding:"16px 20px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
          <LiveDot />
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {sseConnected && <Tag color={C.success}>⚡ SSE conectado</Tag>}
            <Tag color={C.accent}>{match.status_long || "AO VIVO"} · {match.elapsed}'</Tag>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:C.home, fontFamily:display }}>{match.home?.name}</div>
            <div style={{ fontSize:10, color:C.dim, fontFamily:mono }}>MANDANTE</div>
          </div>
          <div style={{ fontSize:36, fontWeight:900, fontFamily:mono, color:C.text, letterSpacing:4 }}>
            {data.score?.home ?? 0} — {data.score?.away ?? 0}
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:20, fontWeight:900, color:C.away, fontFamily:display }}>{match.away?.name}</div>
            <div style={{ fontSize:10, color:C.dim, fontFamily:mono }}>VISITANTE</div>
          </div>
        </div>
      </div>

      {/* Lambda cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        {[
          { label:match.home?.name, val:data.lambdas?.home, proj:data.projected_final?.home, color:C.home },
          { label:"Total", val:data.lambdas?.total, proj:data.projected_final?.total, color:C.total },
          { label:match.away?.name, val:data.lambdas?.away, proj:data.projected_final?.away, color:C.away },
        ].map(({label,val,proj,color}) => (
          <Card key={label} glow={color} style={{ textAlign:"center", padding:14 }}>
            <div style={{ fontSize:9, color:C.dim, fontFamily:mono, letterSpacing:2, marginBottom:4, textTransform:"uppercase" }}>{label}</div>
            <div style={{ fontSize:28, fontWeight:900, color, fontFamily:mono }}>{num(val)}</div>
            <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>Proj: {num(proj,1)}</div>
          </Card>
        ))}
      </div>

      {/* Momentum */}
      <Card>
        <SectionLabel>Momentum · Ritmo atual vs esperado</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {[
            { team:match.home?.name, m:data.momentum?.home, color:C.home },
            { team:match.away?.name, m:data.momentum?.away, color:C.away },
          ].map(({team,m,color}) => {
            const label = m>1.2 ? "🔥 ALTO" : m>0.8 ? "⚡ NORMAL" : "❄️ BAIXO";
            const lc = m>1.2 ? C.success : m>0.8 ? C.accent : C.away;
            return <div key={team} style={{ background:C.surface, borderRadius:8, padding:"12px 14px" }}>
              <div style={{ fontSize:11, color, fontFamily:display, fontWeight:700, marginBottom:6 }}>{team}</div>
              <div style={{ fontSize:24, fontWeight:900, fontFamily:mono, color }}>{num(m)}×</div>
              <Tag color={lc} size={9}>{label}</Tag>
            </div>;
          })}
        </div>
      </Card>

      {/* Live stats */}
      {(hls.shots_on_target !== undefined) && (
        <Card>
          <SectionLabel>Estatísticas em Tempo Real</SectionLabel>
          <StatDuel label="Chutes ao Gol 🎯" homeVal={hls.shots_on_target} awayVal={als.shots_on_target} />
          <StatDuel label="Chutes Totais" homeVal={hls.shots_total} awayVal={als.shots_total} />
          <StatDuel label="Posse de Bola" homeVal={hls.possession} awayVal={als.possession} />
          <StatDuel label="Escanteios" homeVal={hls.corners} awayVal={als.corners} />
          <StatDuel label="Defesas" homeVal={hls.saves} awayVal={als.saves} />
        </Card>
      )}

      {/* Probabilities */}
      <Card>
        <SectionLabel>Probabilidades Projetadas</SectionLabel>
        {[
          { label:`${match.home?.name} terminará com +5 chutes`, p:data.probabilities?.home_over_5, color:C.home },
          { label:`${match.away?.name} terminará com +5 chutes`, p:data.probabilities?.away_over_5, color:C.away },
          { label:"Total ultrapassará 10 chutes", p:data.probabilities?.total_over_10, color:C.total },
          { label:`${match.home?.name} domina chutes`, p:data.probabilities?.home_dominates, color:C.accent },
        ].map(({label,p,color}) => (
          <div key={label} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:11, color:C.muted }}>{label}</span>
              <span style={{ fontSize:12, fontFamily:mono, color, fontWeight:700 }}>{pct(p||0)}</span>
            </div>
            <PBar value={p||0} color={color} />
          </div>
        ))}
      </Card>

      {/* Sources */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        <Tag color={C.accent}>API-Football Live</Tag>
        <Tag color={C.home}>Poisson + Momentum</Tag>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: ANALYZE
// ════════════════════════════════════════════════════════════════════════════
function AnalyzePage() {
  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState(71);
  const [homeId, setHomeId] = useState("");
  const [awayId, setAwayId] = useState("");
  const [homeName, setHomeName] = useState("Flamengo");
  const [awayName, setAwayName] = useState("Vasco");
  const [homeSog, setHomeSog] = useState(6.8);
  const [awaySog, setAwaySog] = useState(4.5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    api.leagues().then(d => setLeagues(d.leagues || [])).catch(()=>{});
  }, []);

  const run = async () => {
    setLoading(true); setErr(""); setResult(null);
    try {
      const data = await api.analyzeQuick({
        home: homeName, away: awayName,
        league_id: leagueId,
        home_sog: homeSog, away_sog: awaySog,
      });
      setResult(data);
      setTab("overview");
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const TABS = ["overview","distribuição","tempos","mercado"];

  return (
    <div>
      <Card style={{ marginBottom:20 }}>
        <SectionLabel>Configurar Partida</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>LIGA</label>
            <select value={leagueId} onChange={e=>setLeagueId(+e.target.value)}
              style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${C.borderBright}`,
                borderRadius:8, color:C.text, fontSize:12, outline:"none", cursor:"pointer" }}>
              {leagues.map(l => <option key={l.id} value={l.id} style={{ background:C.card }}>{l.country} · {l.name}</option>)}
              {leagues.length === 0 && <option value={71}>🇧🇷 Brasileirão Série A</option>}
            </select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>SOG/JOGO CASA</label>
              <input type="number" step="0.1" value={homeSog} onChange={e=>setHomeSog(+e.target.value)}
                style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${C.home}40`,
                  borderRadius:8, color:C.home, fontSize:12, outline:"none", fontFamily:mono }} />
            </div>
            <div>
              <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>SOG/JOGO FORA</label>
              <input type="number" step="0.1" value={awaySog} onChange={e=>setAwaySog(+e.target.value)}
                style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${C.away}40`,
                  borderRadius:8, color:C.away, fontSize:12, outline:"none", fontFamily:mono }} />
            </div>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 32px 1fr", gap:10, alignItems:"end", marginBottom:16 }}>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>🏠 MANDANTE</label>
            <input value={homeName} onChange={e=>setHomeName(e.target.value)}
              style={{ width:"100%", padding:"10px 14px", background:C.surface, border:`1px solid ${C.home}50`,
                borderRadius:8, color:C.home, fontSize:14, fontWeight:700, outline:"none" }} />
          </div>
          <div style={{ textAlign:"center", color:C.dim, fontWeight:900, paddingBottom:8 }}>✕</div>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>✈️ VISITANTE</label>
            <input value={awayName} onChange={e=>setAwayName(e.target.value)}
              style={{ width:"100%", padding:"10px 14px", background:C.surface, border:`1px solid ${C.away}50`,
                borderRadius:8, color:C.away, fontSize:14, fontWeight:700, outline:"none" }} />
          </div>
        </div>

        <button onClick={run} disabled={loading}
          style={{ width:"100%", padding:"13px", border:"none", borderRadius:8, cursor:"pointer",
            background: loading ? C.border : `linear-gradient(90deg,${C.home},${C.total},${C.away})`,
            color: loading ? C.muted : C.bg, fontWeight:800, fontSize:12, letterSpacing:2,
            textTransform:"uppercase", fontFamily:mono }}>
          {loading ? "⟳ CALCULANDO..." : "⚡ ANALISAR"}
        </button>
        {err && <div style={{ marginTop:10 }}><ErrorBox msg={err} /></div>}
      </Card>

      {result && <>
        {/* Tabs + Export */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:16, borderBottom:`1px solid ${C.border}`, paddingBottom:10, flexWrap:"wrap", gap:10 }}>
          <div style={{ display:"flex", gap:6 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding:"5px 14px", borderRadius:6, border:"none", cursor:"pointer",
                  background: tab===t ? C.accentDim : "transparent",
                  color: tab===t ? C.accent : C.muted,
                  fontWeight:700, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", fontFamily:mono }}>
                {t}
              </button>
            ))}
          </div>
          <ExportButtons homeName={homeName} awayName={awayName} leagueId={leagueId} />
        </div>

        {tab === "overview" && <AnalysisOverview r={result} homeName={homeName} awayName={awayName} />}
        {tab === "distribuição" && <AnalysisDist r={result} homeName={homeName} awayName={awayName} />}
        {tab === "tempos" && <AnalysisTimes r={result} homeName={homeName} awayName={awayName} />}
        {tab === "mercado" && <AnalysisMercado r={result} homeName={homeName} awayName={awayName} />}
      </>}
    </div>
  );
}

function ExportButtons({ homeName, awayName, leagueId }) {
  const [busy, setBusy] = useState("");

  const download = async (kind) => {
    setBusy(kind);
    try {
      const r = await fetch(`${API}/export/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          home_team_id: 0, away_team_id: 0,
          home_team_name: homeName, away_team_name: awayName,
          league_id: leagueId,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shotiq_${homeName}_vs_${awayName}.${kind === "excel" ? "xlsx" : "pdf"}`.replace(/\s/g,"_");
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert("Erro ao exportar: " + e.message); }
    finally { setBusy(""); }
  };

  return (
    <div style={{ display:"flex", gap:6 }}>
      <button onClick={() => download("excel")} disabled={busy==="excel"}
        style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${C.success}40`,
          background: busy==="excel" ? C.border : `${C.success}12`, color:C.success,
          fontSize:10, fontFamily:mono, cursor:"pointer", letterSpacing:1 }}>
        {busy==="excel" ? "⟳" : "📊"} EXCEL
      </button>
      <button onClick={() => download("pdf")} disabled={busy==="pdf"}
        style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${C.away}40`,
          background: busy==="pdf" ? C.border : `${C.away}12`, color:C.away,
          fontSize:10, fontFamily:mono, cursor:"pointer", letterSpacing:1 }}>
        {busy==="pdf" ? "⟳" : "📄"} PDF
      </button>
    </div>
  );
}

function AnalysisOverview({ r, homeName, awayName }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
      {[
        { label:homeName, val:r.lambdas?.home, ci:r.confidence_intervals?.home, mode:r.modes?.home, color:C.home },
        { label:"Total", val:r.lambdas?.total, ci:r.confidence_intervals?.total, mode:r.modes?.total, color:C.total },
        { label:awayName, val:r.lambdas?.away, ci:r.confidence_intervals?.away, mode:r.modes?.away, color:C.away },
      ].map(({label,val,ci,mode,color}) => (
        <Card key={label} glow={color} style={{ textAlign:"center" }}>
          <div style={{ fontSize:9, color:C.dim, fontFamily:mono, letterSpacing:2, marginBottom:6, textTransform:"uppercase" }}>{label}</div>
          <div style={{ fontSize:34, fontWeight:900, color, fontFamily:mono, textShadow:`0 0 20px ${color}50` }}>{num(val)}</div>
          <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:4 }}>Moda: {mode}</div>
          {ci && <div style={{ fontSize:9, color:C.dim, marginTop:2 }}>IC95: [{num(ci[0],1)}, {num(ci[1],1)}]</div>}
        </Card>
      ))}
    </div>
    <Card>
      <SectionLabel>Probabilidades-Chave</SectionLabel>
      {Object.entries(r.key_probabilities || {}).map(([k,v]) => (
        <div key={k} style={{ marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontSize:11, color:C.muted }}>{k.replace(/_/g," ")}</span>
            <span style={{ fontSize:12, fontFamily:mono, color:C.accent, fontWeight:700 }}>{pct(v)}</span>
          </div>
          <PBar value={v} color={C.accent} />
        </div>
      ))}
    </Card>
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {(r.model?.sources || []).map(s => <Tag key={s} color={C.accent}>{s}</Tag>)}
    </div>
  </div>;
}

function AnalysisDist({ r, homeName, awayName }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
    {[
      { label:homeName, dist:r.distributions?.home, color:C.home, lam:r.lambdas?.home, mode:r.modes?.home },
      { label:awayName, dist:r.distributions?.away, color:C.away, lam:r.lambdas?.away, mode:r.modes?.away },
      { label:"Total", dist:r.distributions?.total, color:C.total, lam:r.lambdas?.total, mode:r.modes?.total },
    ].map(({label,dist,color,lam,mode}) => (
      <Card key={label} glow={color}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
          <div style={{ fontSize:13, color, fontWeight:700, fontFamily:display }}>{label}</div>
          <div style={{ fontSize:11, color:C.dim, fontFamily:mono }}>λ={num(lam)} · Moda={mode}</div>
        </div>
        <MiniDist dist={dist} color={color} mode={mode} max={label==="Total"?22:16} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:4, marginTop:12 }}>
          {(dist||[]).slice(0,16).map(({k,p}) => (
            <div key={k} style={{ background:k===mode?`${color}20`:C.surface,
              border:`1px solid ${k===mode?color+"50":C.border}`, borderRadius:6, padding:"5px 4px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:C.dim, fontFamily:mono }}>{k}</div>
              <div style={{ fontSize:10, color:k===mode?color:C.text, fontWeight:k===mode?700:400, fontFamily:mono }}>
                {pct(p)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    ))}
  </div>;
}

function AnalysisTimes({ r, homeName, awayName }) {
  const hs = r.half_splits || {};
  return <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
    <Card>
      <SectionLabel>Projeção por Tempo · Proporção 45% / 55%</SectionLabel>
      {[
        { label:homeName, h1:hs.home?.h1, h2:hs.home?.h2, color:C.home },
        { label:awayName, h1:hs.away?.h1, h2:hs.away?.h2, color:C.away },
        { label:"Total", h1:(hs.home?.h1||0)+(hs.away?.h1||0), h2:(hs.home?.h2||0)+(hs.away?.h2||0), color:C.total },
      ].map(({label,h1,h2,color}) => (
        <div key={label} style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color, fontWeight:700, fontFamily:display, marginBottom:8 }}>{label}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[{t:"1º Tempo",v:h1,pct:h1/(h1+h2)},{t:"2º Tempo",v:h2,pct:h2/(h1+h2)}].map(({t,v,pct:p}) => (
              <div key={t} style={{ background:C.surface, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:C.dim, fontFamily:mono, marginBottom:4 }}>{t}</div>
                <div style={{ fontSize:22, fontWeight:900, color, fontFamily:mono }}>{num(v)}</div>
                <PBar value={p||0} color={color} h={3} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Card>
  </div>;
}

function AnalysisMercado({ r, homeName, awayName }) {
  return <Card>
    <SectionLabel>Linhas de Mercado · Over/Under</SectionLabel>
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:mono }}>
        <thead>
          <tr style={{ borderBottom:`1px solid ${C.border}` }}>
            {["Linha","Home Over","Away Over","Total Over","Home Exato","Away Exato"].map(h => (
              <th key={h} style={{ padding:"8px 10px", color:C.dim, textAlign:"center", fontSize:10, letterSpacing:1 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(r.market_table||[]).map(m => (
            <tr key={m.line} style={{ borderBottom:`1px solid ${C.border}20` }}>
              <td style={{ padding:"7px 10px", color:C.text, fontWeight:700, textAlign:"center" }}>{m.line}</td>
              {[{v:m.home_over,c:C.home},{v:m.away_over,c:C.away},{v:m.total_over,c:C.total},
                {v:m.home_exact,c:C.home},{v:m.away_exact,c:C.away}].map(({v,c},i) => (
                <td key={i} style={{ padding:"7px 10px", textAlign:"center" }}>
                  <span style={{ color:v>0.6?c:v>0.4?C.text:C.dim, fontWeight:v>0.6?700:400 }}>
                    {pct(v)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>;
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: LEAGUES
// ════════════════════════════════════════════════════════════════════════════
function LeaguesPage() {
  const [leagues, setLeagues] = useState([]);
  const [tier, setTier] = useState("");
  const [selected, setSelected] = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const [standing, setStanding] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.leagues(tier).then(d => setLeagues(d.leagues||[])).catch(()=>{});
  }, [tier]);

  const selectLeague = async (l) => {
    setSelected(l); setLoading(true); setFixtures([]); setStanding([]);
    try {
      const [fx, st] = await Promise.allSettled([api.fixtures(l.id), api.standings(l.id)]);
      if (fx.status === "fulfilled") setFixtures(fx.value?.fixtures || []);
      if (st.status === "fulfilled") setStanding(st.value?.standings?.[0]?.[0]?.league?.standings?.[0] || []);
    } catch {}
    finally { setLoading(false); }
  };

  const TIERS = ["","top5","south_america","europe","global","international"];
  const TIER_LABELS = { "":"Todas","top5":"Top 5","south_america":"América do Sul","europe":"Europa","global":"Global","international":"Internacional" };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:20 }}>
      <div>
        <SectionLabel>Filtrar por região</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:16 }}>
          {TIERS.map(t => (
            <button key={t} onClick={() => setTier(t)}
              style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${tier===t?C.accent:C.border}`,
                background:tier===t?C.accentDim:"transparent", color:tier===t?C.accent:C.muted,
                cursor:"pointer", textAlign:"left", fontSize:12, fontFamily:mono }}>
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>
        <SectionLabel>{leagues.length} ligas</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {leagues.map(l => (
            <div key={l.id} onClick={() => selectLeague(l)}
              style={{ padding:"10px 14px", borderRadius:8, cursor:"pointer",
                background: selected?.id===l.id ? C.accentDim : C.card,
                border:`1px solid ${selected?.id===l.id ? C.accent : C.border}`,
                transition:"all 0.15s" }}>
              <div style={{ fontSize:13, fontWeight:600, color: selected?.id===l.id?C.accent:C.text }}>{l.name}</div>
              <div style={{ fontSize:10, color:C.dim, fontFamily:mono, marginTop:2 }}>
                {l.country} · ID:{l.id}
                {l.has_understat && " · UST"} {l.has_statsbomb && " · SB"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {!selected ? <Card style={{ textAlign:"center", padding:60, color:C.dim }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🌍</div>
            <div style={{ fontFamily:display, fontSize:16 }}>Selecione uma liga</div>
          </Card> :
          loading ? <LoadingCard label="Carregando dados da liga..." /> :
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:22, fontWeight:900, fontFamily:display, color:C.text }}>{selected.name}</div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{selected.country} · ID {selected.id}</div>
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {selected.has_understat && <Tag color={C.total}>Understat</Tag>}
                  {selected.has_statsbomb && <Tag color={C.home}>StatsBomb</Tag>}
                  <Tag color={C.accent}>API-Football</Tag>
                  <Tag color={C.warn}>FBref</Tag>
                </div>
              </div>
            </Card>

            {fixtures.length > 0 && <Card>
              <SectionLabel>Próximos Jogos (7 dias)</SectionLabel>
              {fixtures.slice(0,6).map((f,i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"10px 0", borderBottom:i<5?`1px solid ${C.border}20`:"none" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.home }}>{f.home?.name}</div>
                    <div style={{ fontSize:9, color:C.dim, fontFamily:mono }}>{f.expected_sog?.home || "—"} SOG exp.</div>
                  </div>
                  <div style={{ textAlign:"center", padding:"0 12px" }}>
                    <div style={{ fontSize:11, color:C.dim, fontFamily:mono }}>vs</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                      {f.date ? new Date(f.date).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}) : "—"}
                    </div>
                  </div>
                  <div style={{ flex:1, textAlign:"right" }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.away }}>{f.away?.name}</div>
                    <div style={{ fontSize:9, color:C.dim, fontFamily:mono }}>{f.expected_sog?.away || "—"} SOG exp.</div>
                  </div>
                </div>
              ))}
            </Card>}
          </div>
        }
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: FBREF
// ════════════════════════════════════════════════════════════════════════════
function FBrefPage() {
  const [leagues, setLeagues] = useState([]);
  const [selKey, setSelKey] = useState("brasileirao");
  const [season, setSeason] = useState(2024);
  const [shooting, setShooting] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("teams");

  useEffect(() => {
    api.fbrefLeagues().then(d => setLeagues(d.leagues||[])).catch(()=>{});
  }, []);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const [sh, pl] = await Promise.all([
        api.fbrefShooting(selKey, season),
        api.fbrefPlayers(selKey, season),
      ]);
      setShooting(sh.teams||[]);
      setPlayers(pl.players||[]);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <Card style={{ marginBottom:20 }}>
        <SectionLabel>FBref · fbref.com (StatsBomb/Opta) · Gratuito</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:10, alignItems:"end" }}>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>LIGA</label>
            <select value={selKey} onChange={e=>setSelKey(e.target.value)}
              style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${C.borderBright}`,
                borderRadius:8, color:C.text, fontSize:12, outline:"none", cursor:"pointer" }}>
              {leagues.map(l => <option key={l.key} value={l.key} style={{ background:C.card }}>{l.country} · {l.name}</option>)}
              <option value="brasileirao">🇧🇷 Brasileirão Série A</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>TEMPORADA</label>
            <input type="number" value={season} onChange={e=>setSeason(+e.target.value)}
              style={{ width:90, padding:"9px 12px", background:C.surface, border:`1px solid ${C.borderBright}`,
                borderRadius:8, color:C.text, fontSize:12, outline:"none", fontFamily:mono }} />
          </div>
          <button onClick={load} disabled={loading}
            style={{ padding:"9px 20px", background:loading?C.border:`linear-gradient(90deg,${C.home},${C.accent})`,
              border:"none", borderRadius:8, color:loading?C.muted:C.bg, fontWeight:800,
              fontSize:12, cursor:"pointer", fontFamily:mono, letterSpacing:1 }}>
            {loading ? "⟳" : "BUSCAR"}
          </button>
        </div>
        {err && <div style={{ marginTop:10 }}><ErrorBox msg={err} /></div>}
      </Card>

      {(shooting.length > 0 || players.length > 0) && <>
        <div style={{ display:"flex", gap:6, marginBottom:16 }}>
          {["teams","players"].map(t => (
            <button key={t} onClick={()=>setTab(t)}
              style={{ padding:"5px 14px", borderRadius:6, border:"none", cursor:"pointer",
                background:tab===t?C.accentDim:"transparent", color:tab===t?C.accent:C.muted,
                fontWeight:700, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", fontFamily:mono }}>
              {t==="teams"?"Times":"Jogadores"}
            </button>
          ))}
        </div>

        {tab==="teams" && <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
            <SectionLabel>Shooting Stats por Time · {selKey} {season}</SectionLabel>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:mono }}>
              <thead>
                <tr style={{ background:C.surface }}>
                  {["#","Time","SOT/J","Chutes/J","xG/J","SOT%","Dist.méd"].map(h => (
                    <th key={h} style={{ padding:"10px 12px", color:C.dim, textAlign:"left", fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shooting.map((t,i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}20` }}>
                    <td style={{ padding:"8px 12px", color:C.dim }}>{i+1}</td>
                    <td style={{ padding:"8px 12px", color:C.text, fontWeight:600 }}>{t.team}</td>
                    <td style={{ padding:"8px 12px", color:C.home, fontWeight:700 }}>{num(t.sot_pg)}</td>
                    <td style={{ padding:"8px 12px", color:C.muted }}>{num(t.shots_pg)}</td>
                    <td style={{ padding:"8px 12px", color:C.accent, fontWeight:700 }}>{num(t.xG_pg,3)}</td>
                    <td style={{ padding:"8px 12px", color:C.muted }}>{num(t.sot_pct)}%</td>
                    <td style={{ padding:"8px 12px", color:C.dim }}>{num(t.avg_shot_dist)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>}

        {tab==="players" && <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
            <SectionLabel>Top Jogadores por xG · {selKey} {season}</SectionLabel>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:mono }}>
              <thead>
                <tr style={{ background:C.surface }}>
                  {["#","Jogador","Time","Pos","SOT","xG","xG/90","Dist."].map(h => (
                    <th key={h} style={{ padding:"10px 12px", color:C.dim, textAlign:"left", fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p,i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}20` }}>
                    <td style={{ padding:"8px 12px", color:C.dim }}>{i+1}</td>
                    <td style={{ padding:"8px 12px", color:C.text, fontWeight:600 }}>{p.player}</td>
                    <td style={{ padding:"8px 12px", color:C.muted }}>{p.squad}</td>
                    <td style={{ padding:"8px 12px", color:C.dim }}>{p.pos}</td>
                    <td style={{ padding:"8px 12px", color:C.home }}>{p.sot}</td>
                    <td style={{ padding:"8px 12px", color:C.gold, fontWeight:700 }}>{num(p.xG)}</td>
                    <td style={{ padding:"8px 12px", color:C.accent }}>{num(p.xG_per90,3)}</td>
                    <td style={{ padding:"8px 12px", color:C.dim }}>{num(p.dist)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>}
      </>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: UNDERSTAT
// ════════════════════════════════════════════════════════════════════════════
const UST_SLUGS = [
  { slug:"EPL", label:"Premier League 🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { slug:"La_liga", label:"La Liga 🇪🇸" },
  { slug:"Bundesliga", label:"Bundesliga 🇩🇪" },
  { slug:"Serie_A", label:"Serie A 🇮🇹" },
  { slug:"Ligue_1", label:"Ligue 1 🇫🇷" },
  { slug:"RFPL", label:"Liga Russa 🇷🇺" },
];

function UnderstatPage() {
  const [slug, setSlug] = useState("EPL");
  const [season, setSeason] = useState(2024);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("teams");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const [td, md] = await Promise.all([
        api.understatTeams(slug, season),
        api.understatMatches(slug, season),
      ]);
      setTeams(td.teams||[]);
      setMatches(md.matches||[]);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <Card style={{ marginBottom:20 }}>
        <SectionLabel>Understat · xG desde 2014/15 · Big 5 + RFPL · Gratuito</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:10, alignItems:"end" }}>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>LIGA</label>
            <select value={slug} onChange={e=>setSlug(e.target.value)}
              style={{ width:"100%", padding:"9px 12px", background:C.surface, border:`1px solid ${C.borderBright}`,
                borderRadius:8, color:C.text, fontSize:12, outline:"none", cursor:"pointer" }}>
              {UST_SLUGS.map(s => <option key={s.slug} value={s.slug} style={{ background:C.card }}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:10, color:C.dim, fontFamily:mono, letterSpacing:2, display:"block", marginBottom:5 }}>TEMPORADA</label>
            <input type="number" value={season} onChange={e=>setSeason(+e.target.value)}
              style={{ width:90, padding:"9px 12px", background:C.surface, border:`1px solid ${C.borderBright}`,
                borderRadius:8, color:C.text, fontSize:12, outline:"none", fontFamily:mono }} />
          </div>
          <button onClick={load} disabled={loading}
            style={{ padding:"9px 20px", background:loading?C.border:`linear-gradient(90deg,${C.total},${C.accent})`,
              border:"none", borderRadius:8, color:loading?C.muted:C.bg, fontWeight:800,
              fontSize:12, cursor:"pointer", fontFamily:mono, letterSpacing:1 }}>
            {loading ? "⟳" : "BUSCAR"}
          </button>
        </div>
        {err && <div style={{ marginTop:10 }}><ErrorBox msg={err} /></div>}
      </Card>

      {(teams.length > 0 || matches.length > 0) && <>
        <div style={{ display:"flex", gap:6, marginBottom:16 }}>
          {["teams","matches"].map(t => (
            <button key={t} onClick={()=>setTab(t)}
              style={{ padding:"5px 14px", borderRadius:6, border:"none", cursor:"pointer",
                background:tab===t?C.accentDim:"transparent", color:tab===t?C.accent:C.muted,
                fontWeight:700, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", fontFamily:mono }}>
              {t==="teams"?"Times":"Partidas"}
            </button>
          ))}
        </div>

        {tab==="teams" && <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
            <SectionLabel>xG por Time · {slug} {season}</SectionLabel>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:mono }}>
              <thead>
                <tr style={{ background:C.surface }}>
                  {["#","Time","PJ","xG/J","xGA/J","W","D","L","Pts"].map(h => (
                    <th key={h} style={{ padding:"10px 12px", color:C.dim, textAlign:"left", fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t,i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}20` }}>
                    <td style={{ padding:"8px 12px", color:C.dim }}>{i+1}</td>
                    <td style={{ padding:"8px 12px", color:C.text, fontWeight:600 }}>{t.team_name}</td>
                    <td style={{ padding:"8px 12px", color:C.muted }}>{t.matches}</td>
                    <td style={{ padding:"8px 12px", color:C.accent, fontWeight:700 }}>{num(t.xG_avg)}</td>
                    <td style={{ padding:"8px 12px", color:C.away }}>{num(t.xGA_avg)}</td>
                    <td style={{ padding:"8px 12px", color:C.success }}>{t.wins}</td>
                    <td style={{ padding:"8px 12px", color:C.warn }}>{t.draws}</td>
                    <td style={{ padding:"8px 12px", color:C.away }}>{t.losses}</td>
                    <td style={{ padding:"8px 12px", color:C.gold, fontWeight:700 }}>{t.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>}

        {tab==="matches" && <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
            <SectionLabel>Partidas com xG · {slug} {season}</SectionLabel>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:mono }}>
              <thead>
                <tr style={{ background:C.surface }}>
                  {["Data","Casa","xG","Res","xG","Fora"].map(h => (
                    <th key={h} style={{ padding:"10px 12px", color:C.dim, textAlign:"center", fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.slice(0,30).map((m,i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}20` }}>
                    <td style={{ padding:"8px 12px", color:C.dim }}>{m.date?.slice(0,10)}</td>
                    <td style={{ padding:"8px 12px", color:C.home, fontWeight:600 }}>{m.home_team}</td>
                    <td style={{ padding:"8px 12px", color:C.accent, textAlign:"center" }}>{num(m.home_xG)}</td>
                    <td style={{ padding:"8px 12px", color:C.text, fontWeight:700, textAlign:"center" }}>
                      {m.home_goals}–{m.away_goals}
                    </td>
                    <td style={{ padding:"8px 12px", color:C.accent, textAlign:"center" }}>{num(m.away_xG)}</td>
                    <td style={{ padding:"8px 12px", color:C.away, fontWeight:600 }}>{m.away_team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>}
      </>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: STATSBOMB
// ════════════════════════════════════════════════════════════════════════════
function StatsBombPage() {
  const [competitions, setCompetitions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.sbCompetitions()
      .then(d => setCompetitions(d.competitions||[]))
      .catch(e => setErr(e.message));
  }, []);

  const selectComp = async (c) => {
    setSelected(c); setMatches([]); setLoading(true);
    try {
      const d = await api.sbMatches(c.competition_id, c.season_id);
      setMatches(d.matches||[]);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:20 }}>
      <div>
        <SectionLabel>StatsBomb Open Data · Gratuito · GitHub</SectionLabel>
        {err && <ErrorBox msg={err} />}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {competitions.map((c,i) => (
            <div key={i} onClick={() => selectComp(c)}
              style={{ padding:"10px 14px", borderRadius:8, cursor:"pointer",
                background:selected?.key===c.key ? C.accentDim : C.card,
                border:`1px solid ${selected?.key===c.key ? C.accent : C.border}`,
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
        {!selected ? <Card style={{ textAlign:"center", padding:60, color:C.dim }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🎯</div>
            <div style={{ fontFamily:display, fontSize:16 }}>Selecione uma competição</div>
            <div style={{ fontSize:11, fontFamily:mono, marginTop:6 }}>Dados com xG por chute, posição exata no campo</div>
          </Card> :
          loading ? <LoadingCard label="Carregando partidas StatsBomb..." /> :
          <Card style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
              <SectionLabel>{selected.key} · {matches.length} partidas</SectionLabel>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:mono }}>
                <thead>
                  <tr style={{ background:C.surface }}>
                    {["Data","Casa","Res","Fora","Estádio"].map(h => (
                      <th key={h} style={{ padding:"10px 12px", color:C.dim, textAlign:"left", fontSize:10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m,i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}20` }}>
                      <td style={{ padding:"8px 12px", color:C.dim }}>{m.date}</td>
                      <td style={{ padding:"8px 12px", color:C.home, fontWeight:600 }}>{m.home_team}</td>
                      <td style={{ padding:"8px 12px", color:C.text, fontWeight:700 }}>
                        {m.home_score}–{m.away_score}
                      </td>
                      <td style={{ padding:"8px 12px", color:C.away, fontWeight:600 }}>{m.away_team}</td>
                      <td style={{ padding:"8px 12px", color:C.dim }}>{m.stadium || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        }
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE: SETTINGS
// ════════════════════════════════════════════════════════════════════════════
function SettingsPage() {
  const [keys, setKeys] = useState(loadKeys());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const update = (field, value) => {
    setKeys(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const save = () => {
    saveKeys(keys);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const testFootballKey = async () => {
    setTesting(true);
    setTestResult(null);
    saveKeys(keys); // salva antes de testar, pra usar a chave atual
    try {
      const data = await api.usage();
      setTestResult({ ok: true, msg: `Conectado! Plano: ${data.plan} · ${data.remaining} análises restantes hoje.` });
    } catch (e) {
      setTestResult({ ok: false, msg: "Não foi possível validar — verifique a chave ou tente novamente." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, fontFamily: display, color: C.text, margin: "0 0 6px" }}>
          ⚙️ Configurações
        </h2>
        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
          Suas chaves ficam salvas apenas neste dispositivo (localStorage) — nunca são enviadas a nenhum lugar além do seu próprio backend.
        </p>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>API-Football · obrigatória para dados reais</SectionLabel>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.6 }}>
          Crie sua chave gratuita (100 req/dia) em{" "}
          <a href="https://www.api-football.com" target="_blank" rel="noreferrer" style={{ color: C.accent }}>
            api-football.com
          </a>.
        </p>
        <input
          type="password"
          value={keys.football}
          onChange={e => update("football", e.target.value)}
          placeholder="Cole sua chave da API-Football"
          style={{ width:"100%", padding:"11px 14px", background:C.surface, border:`1px solid ${C.borderBright}`,
            borderRadius:8, color:C.text, fontSize:13, outline:"none", fontFamily:mono, marginBottom:10 }}
        />
        <button onClick={testFootballKey} disabled={testing || !keys.football}
          style={{ padding:"8px 16px", borderRadius:8, border:"none", cursor: keys.football?"pointer":"not-allowed",
            background: testing ? C.border : `${C.accent}20`, color:C.accent,
            fontSize:11, fontFamily:mono, letterSpacing:1, fontWeight:700 }}>
          {testing ? "⟳ TESTANDO..." : "🔌 TESTAR CONEXÃO"}
        </button>
        {testResult && (
          <div style={{ marginTop:10, padding:"10px 14px", borderRadius:8,
            background: testResult.ok ? `${C.success}12` : `${C.away}12`,
            border:`1px solid ${testResult.ok ? C.success : C.away}30`,
            color: testResult.ok ? C.success : C.away, fontSize:11 }}>
            {testResult.ok ? "✓ " : "⚠ "}{testResult.msg}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Gemini · opcional, leitura tática por IA (gratuito)</SectionLabel>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.6 }}>
          Sem custo, sem cartão. Crie em{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: C.accent }}>
            aistudio.google.com/apikey
          </a>. Sem essa chave, a leitura tática usa um resumo automático simples.
        </p>
        <input
          type="password"
          value={keys.gemini}
          onChange={e => update("gemini", e.target.value)}
          placeholder="Cole sua chave do Gemini (opcional)"
          style={{ width:"100%", padding:"11px 14px", background:C.surface, border:`1px solid ${C.borderBright}`,
            borderRadius:8, color:C.text, fontSize:13, outline:"none", fontFamily:mono }}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Grok · alternativa opcional ao Gemini</SectionLabel>
        <input
          type="password"
          value={keys.grok}
          onChange={e => update("grok", e.target.value)}
          placeholder="Cole sua chave do Grok (opcional)"
          style={{ width:"100%", padding:"11px 14px", background:C.surface, border:`1px solid ${C.borderBright}`,
            borderRadius:8, color:C.text, fontSize:13, outline:"none", fontFamily:mono }}
        />
      </Card>

      <button onClick={save}
        style={{ width:"100%", padding:"13px", border:"none", borderRadius:8, cursor:"pointer",
          background: saved ? C.success : `linear-gradient(90deg,${C.home},${C.accent})`,
          color: C.bg, fontWeight:800, fontSize:12, letterSpacing:2,
          textTransform:"uppercase", fontFamily:mono }}>
        {saved ? "✓ SALVO" : "💾 SALVAR CONFIGURAÇÕES"}
      </button>

      <div style={{ marginTop:20, display:"flex", gap:6, flexWrap:"wrap" }}>
        <Tag color={C.accent}>Armazenado localmente</Tag>
        <Tag color={C.total}>Nunca enviado a terceiros</Tag>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("live");
  const [health, setHealth] = useState(null);
  const [hasKey, setHasKey] = useState(!!loadKeys().football);

  useEffect(() => {
    api.health().then(setHealth).catch(()=>{});
  }, []);

  // Reavalia se a chave existe sempre que voltamos da página de Config
  useEffect(() => {
    setHasKey(!!loadKeys().football);
  }, [page]);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:body }}>
      {/* Ambient glow */}
      <div style={{ position:"fixed", top:-150, left:"15%", width:500, height:400,
        background:`radial-gradient(ellipse,${C.home}06 0%,transparent 70%)`,
        pointerEvents:"none", zIndex:0 }} />
      <div style={{ position:"fixed", bottom:-100, right:"10%", width:400, height:300,
        background:`radial-gradient(ellipse,${C.live}05 0%,transparent 70%)`,
        pointerEvents:"none", zIndex:0 }} />

      {/* Topbar */}
      <div style={{ position:"sticky", top:0, zIndex:100,
        background:`${C.bg}f2`, backdropFilter:"blur(16px)",
        borderBottom:`1px solid ${C.border}`,
        padding:"0 24px", display:"flex", alignItems:"center", height:54 }}>

        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:32 }}>
          <div style={{ width:30, height:30, borderRadius:8,
            background:`linear-gradient(135deg,${C.home},${C.accent})`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>⚽</div>
          <div>
            <div style={{ fontSize:15, fontWeight:900, fontFamily:display, letterSpacing:2 }}>ShotIQ</div>
            <div style={{ fontSize:8, color:C.dim, fontFamily:mono, letterSpacing:2 }}>GLOBAL SHOT ENGINE v3</div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ display:"flex", gap:2 }}>
          {PAGES.map(p => (
            <button key={p.id} onClick={() => setPage(p.id)}
              style={{ padding:"5px 13px", borderRadius:6, border:"none", cursor:"pointer",
                background: page===p.id ? C.accentDim : "transparent",
                color: page===p.id ? C.accent : C.muted,
                fontWeight:600, fontSize:11, fontFamily:mono, letterSpacing:1,
                transition:"all 0.15s" }}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>

        {/* Health indicators */}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          {health && <>
            {Object.entries(health.sources||{}).map(([src,ok]) => (
              <div key={src} title={src} style={{ display:"flex", alignItems:"center", gap:3 }}>
                <div style={{ width:6, height:6, borderRadius:"50%",
                  background: ok ? C.success : C.away,
                  boxShadow: ok ? `0 0 5px ${C.success}` : "none" }} />
                <span style={{ fontSize:9, color:ok?C.success:C.away, fontFamily:mono }}>
                  {src.replace("_","-")}
                </span>
              </div>
            ))}
          </>}
          <div style={{ width:1, height:20, background:C.border, margin:"0 4px" }} />
          <Tag color={C.accent}>4 FONTES</Tag>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 20px 60px", position:"relative", zIndex:1 }}>
        {!hasKey && page !== "settings" && (
          <div onClick={() => setPage("settings")} style={{
            background:`${C.warn}12`, border:`1px solid ${C.warn}40`, borderRadius:10,
            padding:"12px 16px", marginBottom:20, cursor:"pointer",
            display:"flex", alignItems:"center", gap:10,
          }}>
            <span style={{ fontSize:16 }}>⚠️</span>
            <span style={{ fontSize:12, color:C.warn, flex:1 }}>
              Nenhuma chave da API-Football configurada — os dados não vão carregar.
            </span>
            <span style={{ fontSize:11, color:C.warn, fontFamily:mono, textDecoration:"underline" }}>
              Configurar agora →
            </span>
          </div>
        )}
        {page === "live"      && <LivePage />}
        {page === "analyze"   && <AnalyzePage />}
        {page === "leagues"   && <LeaguesPage />}
        {page === "fbref"     && <FBrefPage />}
        {page === "understat" && <UnderstatPage />}
        {page === "statsbomb" && <StatsBombPage />}
        {page === "settings"  && <SettingsPage />}
      </div>

      {/* Footer */}
      <div style={{ borderTop:`1px solid ${C.border}`, padding:"14px 24px",
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:10, color:C.dim, fontFamily:mono }}>
          ShotIQ v3 · API-Football · Understat · StatsBomb · FBref
        </span>
        <span style={{ fontSize:10, color:C.dim, fontFamily:mono }}>
          Motor: Poisson · Dixon-Coles · xSOT · Ensemble
        </span>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:${C.bg}; }
        ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
        button:hover:not(:disabled) { filter:brightness(1.12); }
        input, select { color-scheme:dark; }
        input::placeholder { color:${C.dim}; }
      `}</style>
    </div>
  );
}
