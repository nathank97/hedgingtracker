import { useState, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { useFirebaseState } from "./src/useFirebaseState";

// ─── Theme & Constants ───────────────────────────────────────────────
const COLORS = {
  bg: "#0B1120",
  surface: "#111827",
  surfaceAlt: "#1A2332",
  border: "#1E2D3D",
  borderLight: "#2A3A4A",
  text: "#E2E8F0",
  textMuted: "#8B9DB7",
  textDim: "#5A6B7F",
  accent: "#D4A843",
  accentDim: "#A68532",
  green: "#34D399",
  greenDim: "#065F46",
  red: "#F87171",
  redDim: "#7F1D1D",
  blue: "#60A5FA",
  blueDim: "#1E3A5F",
  purple: "#A78BFA",
  purpleDim: "#3B2D6B",
  orange: "#FB923C",
  orangeDim: "#6B3410",
};

const DEFAULT_CROP_YEARS = ["2024", "2025", "2026", "2027"];
const ENTITIES = ["Hog Finishing", "Feedlot", "Farming"];
const CONTRACT_TYPES = ["Futures", "Options", "Cash Position"];
const CONTRACT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DIRECTIONS = ["Long", "Short"];
const CORN_TYPES = ["High Moisture Corn", "Dry Corn", "Silage Corn"];

const fmt = (n) => {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString();
};

const fmtFull = (n) => Number(n).toLocaleString();

// ─── ID Generator ─────────────────────────────────────────────────────
let _id = 0;
const genId = () => `id_${++_id}_${Date.now()}`;

// ─── Default Data ─────────────────────────────────────────────────────
const defaultConsumption = {
  "Hog Finishing": { "2024": 2400000, "2025": 2600000, "2026": 2800000, "2027": 3000000 },
  "Feedlot": { "2024": 1800000, "2025": 1950000, "2026": 2100000, "2027": 2200000 },
};

const defaultProduction = {
  "2024": { "High Moisture Corn": 1200000, "Dry Corn": 2800000, "Silage Corn": 400000 },
  "2025": { "High Moisture Corn": 1300000, "Dry Corn": 3000000, "Silage Corn": 450000 },
  "2026": { "High Moisture Corn": 1400000, "Dry Corn": 3200000, "Silage Corn": 500000 },
  "2027": { "High Moisture Corn": 1500000, "Dry Corn": 3400000, "Silage Corn": 550000 },
};

// Hedges stored as object keyed by ID for Firebase (prevents conflicts)
const defaultHedgesObj = (() => {
  const entries = [
    { entity: "Hog Finishing", cropYear: "2025", contractType: "Futures", contractMonth: "Jul", quantity: 500000, direction: "Long", price: 4.85, dateEntered: "2025-01-15", notes: "Q3 coverage" },
    { entity: "Hog Finishing", cropYear: "2025", contractType: "Options", contractMonth: "Sep", quantity: 300000, direction: "Long", price: 4.92, dateEntered: "2025-02-01", notes: "Put protection" },
    { entity: "Feedlot", cropYear: "2025", contractType: "Futures", contractMonth: "May", quantity: 400000, direction: "Long", price: 4.78, dateEntered: "2025-01-20", notes: "Spring feed lock" },
    { entity: "Feedlot", cropYear: "2025", contractType: "HTA", contractMonth: "Jul", quantity: 250000, direction: "Long", price: 4.90, dateEntered: "2025-02-10", notes: "" },
    { entity: "Farming", cropYear: "2025", contractType: "Futures", contractMonth: "Dec", quantity: 600000, direction: "Short", price: 5.05, dateEntered: "2025-01-10", notes: "Harvest hedge" },
    { entity: "Farming", cropYear: "2025", contractType: "Basis Contract", contractMonth: "Nov", quantity: 350000, direction: "Short", price: -0.15, dateEntered: "2025-02-05", notes: "Basis lock" },
    { entity: "Hog Finishing", cropYear: "2026", contractType: "Futures", contractMonth: "Mar", quantity: 200000, direction: "Long", price: 5.10, dateEntered: "2025-03-01", notes: "Early 2026 coverage" },
    { entity: "Farming", cropYear: "2026", contractType: "Futures", contractMonth: "Dec", quantity: 400000, direction: "Short", price: 5.15, dateEntered: "2025-03-05", notes: "Forward sale" },
  ];
  const obj = {};
  entries.forEach(e => { const id = genId(); obj[id] = e; });
  return obj;
})();

// Convert hedges object from Firebase to array for rendering
const hedgesObjToArray = (obj) => {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([id, data]) => ({ id, ...data }));
};

// ─── Audit Log ────────────────────────────────────────────────────────
const createAuditEntry = (action, entity, details) => ({
  id: genId(),
  timestamp: new Date().toISOString(),
  user: "Current User",
  action,
  entity,
  details,
});

// ─── Subcomponents ────────────────────────────────────────────────────

const Badge = ({ children, color = COLORS.accent, bg }) => (
  <span style={{
    display: "inline-block", padding: "2px 10px", borderRadius: 4,
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
    color: color, background: bg || color + "18", border: `1px solid ${color}30`,
  }}>{children}</span>
);

const KpiCard = ({ label, value, sub, accent = COLORS.accent }) => (
  <div style={{
    background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: "20px 24px", flex: 1, minWidth: 200,
    borderTop: `3px solid ${accent}`,
  }}>
    <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    {sub && <div style={{ fontSize: 13, color: accent, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
  </div>
);

const Tab = ({ active, children, onClick }) => (
  <button onClick={onClick} style={{
    padding: "10px 20px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
    letterSpacing: 0.3, transition: "all 0.2s",
    background: active ? COLORS.accent + "20" : "transparent",
    color: active ? COLORS.accent : COLORS.textMuted,
    borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
    fontFamily: "'JetBrains Mono', monospace",
  }}>{children}</button>
);

const Input = ({ label, value, onChange, type = "text", placeholder, style: extraStyle, ...rest }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...extraStyle }}>
    {label && <label style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{label}</label>}
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{
        background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6,
        padding: "8px 12px", color: COLORS.text, fontSize: 14, outline: "none",
        fontFamily: "'JetBrains Mono', monospace",
      }}
      {...rest}
    />
  </div>
);

const Select = ({ label, value, onChange, options, style: extraStyle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...extraStyle }}>
    {label && <label style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{label}</label>}
    <select value={value} onChange={onChange} style={{
      background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6,
      padding: "8px 12px", color: COLORS.text, fontSize: 14, outline: "none",
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Btn = ({ children, onClick, variant = "primary", style: extraStyle, disabled }) => {
  const styles = {
    primary: { background: COLORS.accent, color: COLORS.bg, fontWeight: 800 },
    secondary: { background: COLORS.surfaceAlt, color: COLORS.text, border: `1px solid ${COLORS.border}` },
    danger: { background: COLORS.redDim, color: COLORS.red, border: `1px solid ${COLORS.red}30` },
    ghost: { background: "transparent", color: COLORS.textMuted },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "8px 18px", borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 13, fontWeight: 700, letterSpacing: 0.3, transition: "all 0.15s",
      opacity: disabled ? 0.5 : 1, fontFamily: "'JetBrains Mono', monospace",
      ...styles[variant], ...extraStyle,
    }}>{children}</button>
  );
};

// ─── Modal ─────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12,
        padding: 32, minWidth: 480, maxWidth: 640, maxHeight: "85vh", overflowY: "auto",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, color: COLORS.accent, fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ─── Loading Screen ──────────────────────────────────────────────────
const LoadingScreen = () => (
  <div style={{
    minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 16,
  }}>
    <div style={{
      width: 56, height: 56, borderRadius: 12,
      background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDim})`,
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
    }}>🌽</div>
    <div style={{ color: COLORS.accent, fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
      CORN HEDGE TRACKER
    </div>
    <div style={{ color: COLORS.textMuted, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
      Loading data...
    </div>
    <div style={{
      width: 200, height: 4, background: COLORS.surfaceAlt, borderRadius: 2, overflow: "hidden", marginTop: 8,
    }}>
      <div style={{
        width: "40%", height: "100%", background: COLORS.accent, borderRadius: 2,
        animation: "loading 1.2s ease-in-out infinite alternate",
      }} />
    </div>
    <style>{`
      @keyframes loading {
        from { margin-left: 0; }
        to { margin-left: 60%; }
      }
    `}</style>
  </div>
);

// ─── Main App ──────────────────────────────────────────────────────────
export default function CornHedgingTracker() {
  // ── Local-only UI state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedYear, setSelectedYear] = useState("2025");
  const [hedgeModalOpen, setHedgeModalOpen] = useState(false);
  const [editingHedge, setEditingHedge] = useState(null);
  const [entityFilter, setEntityFilter] = useState("All");
  const [showYearManager, setShowYearManager] = useState(false);
  const [newYear, setNewYear] = useState("");

  // ── Firebase-synced state ────────────────────────────────────────────
  const [consumption, setConsumption, consLoading] = useFirebaseState("consumption", defaultConsumption, { debounce: 500 });
  const [production, setProduction, prodLoading] = useFirebaseState("production", defaultProduction, { debounce: 500 });
  const [hedgesObj, setHedgesObj, hedgesLoading] = useFirebaseState("hedges", defaultHedgesObj);
  const [cropYears, setCropYears, yearsLoading] = useFirebaseState("cropYears", DEFAULT_CROP_YEARS);
  const [auditLog, setAuditLog, auditLoading] = useFirebaseState("auditLog", []);

  const isLoading = consLoading || prodLoading || hedgesLoading || yearsLoading || auditLoading;

  // Convert hedges object to array for all rendering/calculation
  const hedges = useMemo(() => hedgesObjToArray(hedgesObj), [hedgesObj]);

  const addCropYear = () => {
    const y = newYear.trim();
    if (!y || cropYears.includes(y) || !/^\d{4}$/.test(y)) return;
    const updated = [...cropYears, y].sort();
    setCropYears(updated);
    setNewYear("");
    addAudit("Year Added", "System", `Crop year ${y} added`);
  };

  const removeCropYear = (y) => {
    if (cropYears.length <= 1) return;
    if (!confirm(`Remove crop year ${y}? This will not delete existing hedge data.`)) return;
    setCropYears(prev => prev.filter(yr => yr !== y));
    if (selectedYear === y) setSelectedYear(cropYears.find(yr => yr !== y));
    addAudit("Year Removed", "System", `Crop year ${y} removed`);
  };

  const addAudit = useCallback((action, entity, details) => {
    setAuditLog(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return [createAuditEntry(action, entity, details), ...arr];
    });
  }, [setAuditLog]);

  // ── Calculations ───────────────────────────────────────────────────
  const calc = useMemo(() => {
    const y = selectedYear;
    const hogCons = (consumption?.["Hog Finishing"]?.[y]) || 0;
    const feedCons = (consumption?.["Feedlot"]?.[y]) || 0;
    const totalCons = hogCons + feedCons;

    const prod = production?.[y] || {};
    const totalProd = Object.values(prod).reduce((s, v) => s + (v || 0), 0);

    const netCash = totalProd - totalCons;

    const yearHedges = hedges.filter(h => h.cropYear === y);

    const hedgeByEntity = (entity) => {
      return yearHedges.filter(h => h.entity === entity).reduce((sum, h) => {
        const qty = h.quantity || 0;
        return sum + (h.direction === "Long" ? qty : -qty);
      }, 0);
    };

    const hogHedge = hedgeByEntity("Hog Finishing");
    const feedHedge = hedgeByEntity("Feedlot");
    const farmHedge = hedgeByEntity("Farming");
    const totalHedge = hogHedge + feedHedge + farmHedge;

    const hogNetCash = -hogCons;
    const feedNetCash = -feedCons;
    const farmNetCash = totalProd;

    const hogNet = hogNetCash + hogHedge;
    const feedNet = feedNetCash + feedHedge;
    const farmNet = farmNetCash + farmHedge;

    const netPosition = netCash + totalHedge;

    const hogHedgePct = hogCons > 0 ? Math.abs(hogHedge) / hogCons * 100 : 0;
    const feedHedgePct = feedCons > 0 ? Math.abs(feedHedge) / feedCons * 100 : 0;
    const farmHedgePct = totalProd > 0 ? Math.abs(farmHedge) / totalProd * 100 : 0;

    return {
      hogCons, feedCons, totalCons, totalProd, netCash,
      hogHedge, feedHedge, farmHedge, totalHedge,
      hogNetCash, feedNetCash, farmNetCash,
      hogNet, feedNet, farmNet, netPosition,
      hogHedgePct, feedHedgePct, farmHedgePct,
      yearHedges, prod,
    };
  }, [selectedYear, consumption, production, hedges]);

  // ── Hedge Form ─────────────────────────────────────────────────────
  const emptyHedge = { entity: "Hog Finishing", cropYear: selectedYear, contractType: "Futures", contractMonth: "Jul", quantity: "", direction: "Long", price: "", dateEntered: new Date().toISOString().slice(0, 10), notes: "" };
  const [hedgeForm, setHedgeForm] = useState(emptyHedge);

  const openNewHedge = () => {
    setEditingHedge(null);
    setHedgeForm({ ...emptyHedge, cropYear: selectedYear });
    setHedgeModalOpen(true);
  };

  const openEditHedge = (h) => {
    setEditingHedge(h.id);
    setHedgeForm({ ...h, quantity: String(h.quantity), price: String(h.price || "") });
    setHedgeModalOpen(true);
  };

  const saveHedge = () => {
    const qty = parseInt(hedgeForm.quantity);
    if (!qty || qty <= 0) return;
    const { id: _formId, ...formData } = hedgeForm;
    const entry = { ...formData, quantity: qty, price: hedgeForm.price ? parseFloat(hedgeForm.price) : null };

    if (editingHedge) {
      setHedgesObj(prev => ({ ...prev, [editingHedge]: entry }));
      addAudit("Hedge Modified", entry.entity, `${entry.direction} ${fmtFull(qty)} bu ${entry.contractType} ${entry.contractMonth} ${entry.cropYear}`);
    } else {
      const newId = genId();
      setHedgesObj(prev => ({ ...prev, [newId]: entry }));
      addAudit("Hedge Created", entry.entity, `${entry.direction} ${fmtFull(qty)} bu ${entry.contractType} ${entry.contractMonth} ${entry.cropYear}`);
    }
    setHedgeModalOpen(false);
  };

  const deleteHedge = (h) => {
    if (!confirm("Delete this hedge position?")) return;
    setHedgesObj(prev => {
      const next = { ...prev };
      delete next[h.id];
      return next;
    });
    addAudit("Hedge Deleted", h.entity, `${h.direction} ${fmtFull(h.quantity)} bu ${h.contractType} ${h.contractMonth} ${h.cropYear}`);
  };

  // ── Consumption / Production update helpers (no per-keystroke audit) ─
  const updateConsumption = (entity, year, val) => {
    const v = parseInt(val) || 0;
    setConsumption(prev => ({
      ...prev,
      [entity]: { ...(prev?.[entity] || {}), [year]: v }
    }));
  };

  const updateProduction = (year, type, val) => {
    const v = parseInt(val) || 0;
    setProduction(prev => ({
      ...prev,
      [year]: { ...(prev?.[year] || {}), [type]: v }
    }));
  };

  // ── Chart Data ─────────────────────────────────────────────────────
  const exposureChartData = useMemo(() => {
    return (cropYears || []).map(y => {
      const hc = consumption?.["Hog Finishing"]?.[y] || 0;
      const fc = consumption?.["Feedlot"]?.[y] || 0;
      const p = Object.values(production?.[y] || {}).reduce((s, v) => s + (v || 0), 0);
      const yh = hedges.filter(h => h.cropYear === y);
      const th = yh.reduce((s, h) => s + (h.direction === "Long" ? h.quantity : -h.quantity), 0);
      return {
        year: y,
        Production: p,
        Consumption: -(hc + fc),
        "Net Cash": p - hc - fc,
        "Hedge Position": th,
        "Net Position": (p - hc - fc) + th,
      };
    });
  }, [consumption, production, hedges, cropYears]);

  // ── Filtered Hedges ────────────────────────────────────────────────
  const filteredHedges = useMemo(() => {
    let h = hedges.filter(x => x.cropYear === selectedYear);
    if (entityFilter !== "All") h = h.filter(x => x.entity === entityFilter);
    return h;
  }, [hedges, selectedYear, entityFilter]);

  // ── Loading Screen ─────────────────────────────────────────────────
  if (isLoading) return <LoadingScreen />;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${COLORS.bg}; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        select option { background: ${COLORS.surface}; color: ${COLORS.text}; }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
      `}</style>

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header style={{
        background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`,
        padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDim})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🌽</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent, letterSpacing: 0.5 }}>
              CORN HEDGE TRACKER
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              ENTERPRISE RISK MANAGEMENT
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} options={cropYears || DEFAULT_CROP_YEARS} />
          <Btn variant="secondary" onClick={() => setShowYearManager(p => !p)} style={{ padding: "8px 12px", fontSize: 12 }}>
            {showYearManager ? "✕" : "± Years"}
          </Btn>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: COLORS.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: COLORS.bg,
          }}>CU</div>
        </div>
      </header>

      {/* ─── Year Manager Bar ────────────────────────────────────── */}
      {showYearManager && (
        <div style={{
          background: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.border}`,
          padding: "12px 32px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>CROP YEARS:</span>
          {(cropYears || []).map(y => (
            <div key={y} style={{
              display: "flex", alignItems: "center", gap: 6, background: COLORS.surface,
              border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 10px",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }}>{y}</span>
              <button onClick={() => removeCropYear(y)} style={{
                background: "none", border: "none", color: COLORS.red, cursor: "pointer",
                fontSize: 14, lineHeight: 1, padding: "0 2px", fontWeight: 700,
              }}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="text" value={newYear} onChange={e => setNewYear(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCropYear()}
              placeholder="e.g. 2028" maxLength={4}
              style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6,
                padding: "6px 10px", color: COLORS.text, fontSize: 13, width: 90, outline: "none",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <Btn onClick={addCropYear} style={{ padding: "6px 14px", fontSize: 12 }}>+ Add</Btn>
          </div>
        </div>
      )}

      {/* ─── Navigation ─────────────────────────────────────────── */}
      <nav style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "0 32px", display: "flex", gap: 0 }}>
        {[
          ["dashboard", "Executive Summary"],
          ["hedges", "Hedge Positions"],
          ["hog", "Hog Finishing"],
          ["feedlot", "Feedlot"],
          ["farming", "Farming"],
          ["audit", "Audit Log"],
          ["changelog", "Changelog"],
        ].map(([key, label]) => (
          <Tab key={key} active={activeTab === key} onClick={() => setActiveTab(key)}>{label}</Tab>
        ))}
      </nav>

      <main style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ═══════ DASHBOARD ═══════ */}
        {activeTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                Crop Year {selectedYear} — Enterprise Summary
              </h2>
              <Badge color={calc.netPosition >= 0 ? COLORS.green : COLORS.red} bg={calc.netPosition >= 0 ? COLORS.greenDim : COLORS.redDim}>
                Net {calc.netPosition >= 0 ? "Long" : "Short"}: {fmt(Math.abs(calc.netPosition))} bu
              </Badge>
            </div>

            {/* KPIs */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <KpiCard label="Total Consumption" value={fmt(calc.totalCons) + " bu"} sub={`Hog: ${fmt(calc.hogCons)} · Feed: ${fmt(calc.feedCons)}`} accent={COLORS.red} />
              <KpiCard label="Total Production" value={fmt(calc.totalProd) + " bu"} sub={CORN_TYPES.map(t => `${t.split(" ")[0]}: ${fmt(calc.prod[t] || 0)}`).join(" · ")} accent={COLORS.green} />
              <KpiCard label="Net Cash Position" value={fmt(calc.netCash) + " bu"} sub={calc.netCash >= 0 ? "Net Long (Cash)" : "Net Short (Cash)"} accent={calc.netCash >= 0 ? COLORS.green : COLORS.red} />
              <KpiCard label="Total Hedge Position" value={fmt(calc.totalHedge) + " bu"} sub={`${calc.yearHedges.length} active contracts`} accent={COLORS.blue} />
            </div>

            {/* Entity Breakdown Table */}
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "16px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent }}>ENTITY BREAKDOWN</h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: COLORS.surfaceAlt }}>
                    {["Entity", "Physical (bu)", "Hedged (bu)", "Net Position", "Hedge %", "Status"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: COLORS.textMuted, fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Hog Finishing", cash: calc.hogNetCash, hedge: calc.hogHedge, net: calc.hogNet, pct: calc.hogHedgePct },
                    { name: "Feedlot", cash: calc.feedNetCash, hedge: calc.feedHedge, net: calc.feedNet, pct: calc.feedHedgePct },
                    { name: "Farming", cash: calc.farmNetCash, hedge: calc.farmHedge, net: calc.farmNet, pct: calc.farmHedgePct },
                  ].map(row => (
                    <tr key={row.name} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "12px 16px", fontWeight: 700 }}>{row.name}</td>
                      <td style={{ padding: "12px 16px", color: row.cash >= 0 ? COLORS.green : COLORS.red }}>{fmtFull(row.cash)}</td>
                      <td style={{ padding: "12px 16px", color: COLORS.blue }}>{fmtFull(row.hedge)}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: row.net >= 0 ? COLORS.green : COLORS.red }}>{fmtFull(row.net)}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 60, height: 6, background: COLORS.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(row.pct, 100)}%`, height: "100%", background: row.pct >= 80 ? COLORS.green : row.pct >= 50 ? COLORS.accent : COLORS.red, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: COLORS.textMuted }}>{row.pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge color={row.net >= 0 ? COLORS.green : COLORS.red} bg={row.net >= 0 ? COLORS.greenDim : COLORS.redDim}>
                          {row.net >= 0 ? "Long" : "Short"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: COLORS.surfaceAlt }}>
                    <td style={{ padding: "12px 16px", fontWeight: 800, color: COLORS.accent }}>ENTERPRISE TOTAL</td>
                    <td style={{ padding: "12px 16px", fontWeight: 800, color: calc.netCash >= 0 ? COLORS.green : COLORS.red }}>{fmtFull(calc.netCash)}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 800, color: COLORS.blue }}>{fmtFull(calc.totalHedge)}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 800, color: calc.netPosition >= 0 ? COLORS.green : COLORS.red }}>{fmtFull(calc.netPosition)}</td>
                    <td style={{ padding: "12px 16px" }}>—</td>
                    <td style={{ padding: "12px 16px" }}>
                      <Badge color={calc.netPosition >= 0 ? COLORS.green : COLORS.red} bg={calc.netPosition >= 0 ? COLORS.greenDim : COLORS.redDim}>
                        Net {calc.netPosition >= 0 ? "Long" : "Short"}
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Chart */}
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent, marginBottom: 16 }}>MULTI-YEAR EXPOSURE OVERVIEW</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={exposureChartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="year" stroke={COLORS.textDim} tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
                  <YAxis stroke={COLORS.textDim} tickFormatter={fmt} tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                    formatter={(v) => fmtFull(v) + " bu"}
                  />
                  <Legend wrapperStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
                  <ReferenceLine y={0} stroke={COLORS.textDim} />
                  <Bar dataKey="Production" fill={COLORS.green} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Consumption" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Hedge Position" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Net Position" radius={[4, 4, 0, 0]}>
                    {exposureChartData.map((e, i) => (
                      <Cell key={i} fill={e["Net Position"] >= 0 ? COLORS.green : COLORS.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ═══════ HEDGE POSITIONS ═══════ */}
        {activeTab === "hedges" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>Hedge Positions — {selectedYear}</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} options={["All", ...ENTITIES]} />
                <Btn onClick={openNewHedge}>+ New Position</Btn>
              </div>
            </div>

            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, minWidth: 900 }}>
                <thead>
                  <tr style={{ background: COLORS.surfaceAlt }}>
                    {["Entity", "Type", "Month", "Direction", "Quantity (bu)", "Price", "Date", "Notes", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: COLORS.textMuted, fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHedges.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: COLORS.textDim }}>No hedge positions for {selectedYear}{entityFilter !== "All" ? ` (${entityFilter})` : ""}.</td></tr>
                  )}
                  {filteredHedges.map(h => (
                    <tr key={h.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{h.entity}</td>
                      <td style={{ padding: "10px 14px" }}>{h.contractType}</td>
                      <td style={{ padding: "10px 14px" }}>{h.contractMonth}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <Badge color={h.direction === "Long" ? COLORS.green : COLORS.red} bg={h.direction === "Long" ? COLORS.greenDim : COLORS.redDim}>{h.direction}</Badge>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{fmtFull(h.quantity)}</td>
                      <td style={{ padding: "10px 14px", color: COLORS.accent }}>{h.price ? `$${h.price.toFixed(2)}` : "—"}</td>
                      <td style={{ padding: "10px 14px", color: COLORS.textMuted }}>{h.dateEntered}</td>
                      <td style={{ padding: "10px 14px", color: COLORS.textDim, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes || "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <Btn variant="ghost" onClick={() => openEditHedge(h)} style={{ marginRight: 4 }}>Edit</Btn>
                        <Btn variant="danger" onClick={() => deleteHedge(h)}>Del</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Hedge summary cards */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {ENTITIES.map(e => {
                const eHedges = hedges.filter(h => h.cropYear === selectedYear && h.entity === e);
                const net = eHedges.reduce((s, h) => s + (h.direction === "Long" ? h.quantity : -h.quantity), 0);
                return (
                  <div key={e} style={{ flex: 1, minWidth: 240, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 20 }}>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: 0.5 }}>{e.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>{eHedges.length} contract(s)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: net >= 0 ? COLORS.green : COLORS.red }}>
                      {net >= 0 ? "+" : ""}{fmtFull(net)} bu
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════ HOG FINISHING ═══════ */}
        {activeTab === "hog" && (
          <EntityView
            title="Hog Finishing Operations"
            subtitle="Corn consumption for hog finishing"
            entity="Hog Finishing"
            type="consumer"
            consumption={consumption}
            updateConsumption={updateConsumption}
            hedges={hedges}
            selectedYear={selectedYear}
            calc={calc}
            cropYears={cropYears}
            openNewHedge={openNewHedge}
            openEditHedge={openEditHedge}
            deleteHedge={deleteHedge}
          />
        )}

        {/* ═══════ FEEDLOT ═══════ */}
        {activeTab === "feedlot" && (
          <EntityView
            title="Feedlot Operations"
            subtitle="Corn consumption for feedlot operations"
            entity="Feedlot"
            type="consumer"
            consumption={consumption}
            updateConsumption={updateConsumption}
            hedges={hedges}
            selectedYear={selectedYear}
            calc={calc}
            cropYears={cropYears}
            openNewHedge={openNewHedge}
            openEditHedge={openEditHedge}
            deleteHedge={deleteHedge}
          />
        )}

        {/* ═══════ FARMING ═══════ */}
        {activeTab === "farming" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>Farming Operations</h2>
                <p style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>Corn production by type — Crop Year {selectedYear}</p>
              </div>
              <Btn onClick={openNewHedge}>+ New Position</Btn>
            </div>

            {/* Production inputs */}
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent, marginBottom: 20 }}>PLANNED PRODUCTION — {selectedYear}</h3>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {CORN_TYPES.map(t => (
                  <Input
                    key={t} label={t} type="number" style={{ flex: 1, minWidth: 200 }}
                    value={production?.[selectedYear]?.[t] || ""}
                    onChange={e => updateProduction(selectedYear, t, e.target.value)}
                    placeholder="Bushels"
                  />
                ))}
              </div>
              <div style={{ marginTop: 16, padding: "12px 16px", background: COLORS.surfaceAlt, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.textMuted }}>TOTAL PRODUCTION</span>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: COLORS.green }}>{fmtFull(calc.totalProd)} bu</span>
              </div>
            </div>

            {/* Multi-year production table */}
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "16px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent }}>PRODUCTION BY YEAR</h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: COLORS.surfaceAlt }}>
                    {["Year", ...CORN_TYPES, "Total"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: COLORS.textMuted, fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(cropYears || []).map(y => {
                    const p = production?.[y] || {};
                    const total = Object.values(p).reduce((s, v) => s + (v || 0), 0);
                    return (
                      <tr key={y} style={{ borderBottom: `1px solid ${COLORS.border}`, background: y === selectedYear ? COLORS.accent + "08" : "transparent" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: y === selectedYear ? COLORS.accent : COLORS.text }}>{y}</td>
                        {CORN_TYPES.map(t => (
                          <td key={t} style={{ padding: "4px 8px" }}>
                            <input
                              type="number"
                              value={p[t] || ""}
                              onChange={e => updateProduction(y, t, e.target.value)}
                              placeholder="0"
                              style={{
                                background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6,
                                padding: "6px 10px", color: COLORS.text, fontSize: 13, outline: "none", width: "100%",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: COLORS.green }}>{fmtFull(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Farming hedges */}
            <HedgeTable
              hedges={hedges.filter(h => h.cropYear === selectedYear && h.entity === "Farming")}
              openEditHedge={openEditHedge}
              deleteHedge={deleteHedge}
            />

            {/* Net position */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <KpiCard label="Physical Position (Long)" value={fmtFull(calc.farmNetCash) + " bu"} accent={COLORS.green} />
              <KpiCard label="Hedge Position" value={fmtFull(calc.farmHedge) + " bu"} accent={COLORS.blue} />
              <KpiCard label="Net Position" value={fmtFull(calc.farmNet) + " bu"} sub={calc.farmNet >= 0 ? "Net Long" : "Net Short"} accent={calc.farmNet >= 0 ? COLORS.green : COLORS.red} />
              <KpiCard label="Hedged %" value={calc.farmHedgePct.toFixed(1) + "%"} accent={COLORS.purple} />
            </div>
          </div>
        )}

        {/* ═══════ AUDIT LOG ═══════ */}
        {activeTab === "audit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>Audit Log</h2>
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: COLORS.surfaceAlt }}>
                    {["Timestamp", "User", "Action", "Entity", "Details"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: COLORS.textMuted, fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(!auditLog || auditLog.length === 0) && (
                    <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: COLORS.textDim }}>No changes recorded yet. Make edits to see the audit trail.</td></tr>
                  )}
                  {(auditLog || []).slice(0, 50).map(a => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "10px 16px", color: COLORS.textMuted, whiteSpace: "nowrap", fontSize: 12 }}>{new Date(a.timestamp).toLocaleString()}</td>
                      <td style={{ padding: "10px 16px" }}>{a.user}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <Badge color={
                          a.action.includes("Created") ? COLORS.green :
                          a.action.includes("Deleted") ? COLORS.red :
                          COLORS.accent
                        }>{a.action}</Badge>
                      </td>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{a.entity}</td>
                      <td style={{ padding: "10px 16px", color: COLORS.textMuted, fontSize: 12 }}>{a.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════ CHANGELOG ═══════ */}
        {activeTab === "changelog" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>Changelog</h2>

            {[
              {
                version: "2.0.0", date: "2026-02-18",
                changes: [
                  "Added Firebase Realtime Database for real-time multi-user sync",
                  "All shared data (consumption, production, hedges, crop years, audit log) now persists and syncs across browsers",
                  "Debounced writes for consumption/production inputs (500ms) to avoid flooding Firebase",
                  "Hedges stored as object keyed by ID for conflict-free concurrent editing",
                  "Added loading screen while Firebase data loads",
                  "Removed per-keystroke audit entries for consumption/production changes",
                  "Deployed to Vercel for public access",
                ],
              },
              {
                version: "1.3.0", date: "2026-02-18",
                changes: [
                  "Added ability to add and remove crop years dynamically",
                  "Added this Changelog tab for version tracking",
                ],
              },
              {
                version: "1.2.0", date: "2026-02-18",
                changes: [
                  "Made production-by-year table editable for all years (not just selected year)",
                ],
              },
              {
                version: "1.1.0", date: "2026-02-18",
                changes: [
                  "Added Vite project scaffolding (package.json, vite.config.js, index.html, src/main.jsx)",
                  "Added inline favicon to fix 404 error",
                ],
              },
              {
                version: "1.0.0", date: "2026-02-18",
                changes: [
                  "Initial release of Corn Hedging Tracker",
                  "Executive Summary dashboard with KPIs and multi-year exposure chart",
                  "Hedge position management (create, edit, delete) with audit logging",
                  "Entity views for Hog Finishing, Feedlot, and Farming operations",
                  "Consumption and production tracking by crop year",
                  "Recharts-powered bar chart for multi-year exposure overview",
                ],
              },
            ].map(release => (
              <div key={release.version} style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 24,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent }}>v{release.version}</span>
                  <Badge color={COLORS.textMuted}>{release.date}</Badge>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {release.changes.map((c, i) => (
                    <li key={i} style={{ color: COLORS.text, fontSize: 14, marginBottom: 6, lineHeight: 1.5 }}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ─── Hedge Modal ──────────────────────────────────────────── */}
      <Modal open={hedgeModalOpen} onClose={() => setHedgeModalOpen(false)} title={editingHedge ? "Edit Position" : "New Position"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Select label="Entity" value={hedgeForm.entity} onChange={e => setHedgeForm(p => ({ ...p, entity: e.target.value }))} options={ENTITIES} style={{ flex: 1 }} />
            <Select label="Crop Year" value={hedgeForm.cropYear} onChange={e => setHedgeForm(p => ({ ...p, cropYear: e.target.value }))} options={cropYears || DEFAULT_CROP_YEARS} style={{ flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Select label="Contract Type" value={hedgeForm.contractType} onChange={e => setHedgeForm(p => ({ ...p, contractType: e.target.value }))} options={CONTRACT_TYPES} style={{ flex: 1 }} />
            <Select label="Contract Month" value={hedgeForm.contractMonth} onChange={e => setHedgeForm(p => ({ ...p, contractMonth: e.target.value }))} options={CONTRACT_MONTHS} style={{ flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Select label="Direction" value={hedgeForm.direction} onChange={e => setHedgeForm(p => ({ ...p, direction: e.target.value }))} options={DIRECTIONS} style={{ flex: 1 }} />
            <Input label="Quantity (bushels)" type="number" value={hedgeForm.quantity} onChange={e => setHedgeForm(p => ({ ...p, quantity: e.target.value }))} placeholder="e.g. 500000" style={{ flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="Hedge Price ($/bu)" type="number" step="0.01" value={hedgeForm.price} onChange={e => setHedgeForm(p => ({ ...p, price: e.target.value }))} placeholder="Optional" style={{ flex: 1 }} />
            <Input label="Date Entered" type="date" value={hedgeForm.dateEntered} onChange={e => setHedgeForm(p => ({ ...p, dateEntered: e.target.value }))} style={{ flex: 1 }} />
          </div>
          <Input label="Notes" value={hedgeForm.notes} onChange={e => setHedgeForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional comments" />
          <div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setHedgeModalOpen(false)}>Cancel</Btn>
            <Btn onClick={saveHedge} disabled={!hedgeForm.quantity || parseInt(hedgeForm.quantity) <= 0}>
              {editingHedge ? "Update Position" : "Add Position"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Entity Detail View (Consumer) ────────────────────────────────────
function EntityView({ title, subtitle, entity, consumption, updateConsumption, hedges, selectedYear, calc, cropYears, openNewHedge, openEditHedge, deleteHedge }) {
  const cons = consumption?.[entity] || {};
  const entityHedges = hedges.filter(h => h.cropYear === selectedYear && h.entity === entity);
  const netCash = entity === "Hog Finishing" ? calc.hogNetCash : calc.feedNetCash;
  const hedge = entity === "Hog Finishing" ? calc.hogHedge : calc.feedHedge;
  const net = entity === "Hog Finishing" ? calc.hogNet : calc.feedNet;
  const hedgePct = entity === "Hog Finishing" ? calc.hogHedgePct : calc.feedHedgePct;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{title}</h2>
          <p style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>{subtitle}</p>
        </div>
        <Btn onClick={openNewHedge}>+ New Position</Btn>
      </div>

      {/* Consumption inputs by year */}
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent, marginBottom: 20 }}>PLANNED CONSUMPTION BY YEAR</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(cropYears || []).map(y => (
            <Input
              key={y} label={`Crop Year ${y}`} type="number" style={{ flex: 1, minWidth: 180 }}
              value={cons[y] || ""}
              onChange={e => updateConsumption(entity, y, e.target.value)}
              placeholder="Bushels"
            />
          ))}
        </div>
      </div>

      {/* Hedges */}
      <HedgeTable hedges={entityHedges} openEditHedge={openEditHedge} deleteHedge={deleteHedge} />

      {/* KPIs */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <KpiCard label="Consumption (Short)" value={fmtFull(netCash) + " bu"} accent={COLORS.red} />
        <KpiCard label="Hedge Position" value={fmtFull(hedge) + " bu"} accent={COLORS.blue} />
        <KpiCard label="Net Position" value={fmtFull(net) + " bu"} sub={net >= 0 ? "Net Long" : "Net Short"} accent={net >= 0 ? COLORS.green : COLORS.red} />
        <KpiCard label="Hedged %" value={hedgePct.toFixed(1) + "%"} accent={COLORS.purple} />
      </div>
    </div>
  );
}

// ─── Hedge Table Subcomponent ──────────────────────────────────────────
function HedgeTable({ hedges, openEditHedge, deleteHedge }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "auto" }}>
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.accent }}>HEDGE POSITIONS</h3>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, minWidth: 700 }}>
        <thead>
          <tr style={{ background: COLORS.surfaceAlt }}>
            {["Type", "Month", "Direction", "Quantity", "Price", "Date", "Actions"].map(h => (
              <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: COLORS.textMuted, fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hedges.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: COLORS.textDim }}>No hedge positions.</td></tr>
          )}
          {hedges.map(h => (
            <tr key={h.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: "10px 14px" }}>{h.contractType}</td>
              <td style={{ padding: "10px 14px" }}>{h.contractMonth}</td>
              <td style={{ padding: "10px 14px" }}>
                <Badge color={h.direction === "Long" ? COLORS.green : COLORS.red} bg={h.direction === "Long" ? COLORS.greenDim : COLORS.redDim}>{h.direction}</Badge>
              </td>
              <td style={{ padding: "10px 14px", fontWeight: 700 }}>{fmtFull(h.quantity)}</td>
              <td style={{ padding: "10px 14px", color: COLORS.accent }}>{h.price ? `$${h.price.toFixed(2)}` : "—"}</td>
              <td style={{ padding: "10px 14px", color: COLORS.textMuted }}>{h.dateEntered}</td>
              <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                <Btn variant="ghost" onClick={() => openEditHedge(h)} style={{ marginRight: 4 }}>Edit</Btn>
                <Btn variant="danger" onClick={() => deleteHedge(h)}>Del</Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
