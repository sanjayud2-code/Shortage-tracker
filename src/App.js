import { useState, useEffect } from "react";
import {
  collection, onSnapshot, doc,
  setDoc, deleteDoc, orderBy, query
} from "firebase/firestore";
import { db } from "./firebase";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const DEPARTMENTS = ["Hardware", "Connectors", "OPGW"];

const emptyPart  = () => ({ id: uid(), partNumber: "", itemDescription: "", quantity: "" });
const emptySOForm = () => ({
  soRef: "", projectName: "", department: "", dispatchDate: "", dcNumber: "", transport: "",
  parts: [emptyPart()],
});

const inp = (extra = {}) => ({
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8, padding: "9px 12px", color: "#e8eaf6",
  fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  colorScheme: "dark", ...extra,
});
const errInp = { background: "rgba(255,107,107,0.1)", border: "1px solid #ff6b6b" };

export default function App() {
  const [sos,           setSos]           = useState([]);
  const [tab,           setTab]           = useState("add");
  const [form,          setForm]          = useState(emptySOForm());
  const [errors,        setErrors]        = useState({});
  const [editId,        setEditId]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [toast,         setToast]         = useState(null);
  const [search,        setSearch]        = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [expandedSO,    setExpandedSO]    = useState(null);

  // ── Real-time listener from Firestore ──────────────────────────
  useEffect(() => {
    const q = query(collection(db, "shortages"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setSos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Form helpers ───────────────────────────────────────────────
  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };
  const setPartField = (partId, key, val) => {
    setForm(f => ({ ...f, parts: f.parts.map(p => p.id === partId ? { ...p, [key]: val } : p) }));
    setErrors(e => ({ ...e, [`part_${partId}_${key}`]: undefined }));
  };
  const addPart    = () => setForm(f => ({ ...f, parts: [...f.parts, emptyPart()] }));
  const removePart = id  => { if (form.parts.length > 1) setForm(f => ({ ...f, parts: f.parts.filter(p => p.id !== id) })); };

  // ── Validation ─────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.soRef.trim())        e.soRef        = "Required";
    if (!form.projectName.trim())  e.projectName  = "Required";
    form.parts.forEach(p => {
      if (!p.partNumber.trim())    e[`part_${p.id}_partNumber`]    = "Required";
      if (!p.itemDescription.trim()) e[`part_${p.id}_itemDescription`] = "Required";
      if (!p.quantity || isNaN(p.quantity) || Number(p.quantity) <= 0) e[`part_${p.id}_quantity`] = "Required";
    });
    return e;
  };

  // ── Save / Update ──────────────────────────────────────────────
  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    const id  = editId || uid();
    const rec = {
      soRef:        form.soRef,
      projectName:  form.projectName,
      dispatchDate: form.dispatchDate,
      dcNumber:     form.dcNumber,
      transport:    form.transport,
      parts:        form.parts,
      createdAt:    editId
        ? (sos.find(s => s.id === editId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, "shortages", id), rec);
      showToast(editId ? "✅ SO updated" : "✅ SO saved");
      setEditId(null);
      setForm(emptySOForm());
      setTab("list");
      setExpandedSO(id);
    } catch (err) {
      showToast("❌ Save failed – check Firebase config", "error");
    }
  };

  const handleEdit = so => {
    setForm({ ...so, parts: so.parts.map(p => ({ ...p })) });
    setEditId(so.id);
    setTab("add");
  };

  const handleDelete = async id => {
    try {
      await deleteDoc(doc(db, "shortages", id));
      setDeleteConfirm(null);
      showToast("🗑️ Deleted");
    } catch {
      showToast("❌ Delete failed", "error");
    }
  };

  const cancelEdit = () => { setEditId(null); setForm(emptySOForm()); setTab("list"); };

  // ── Derived ────────────────────────────────────────────────────
  const totalParts   = sos.reduce((a, s) => a + s.parts.length, 0);
  const filteredSos  = sos.filter(so =>
    search === "" ||
    [so.soRef, so.projectName, so.dcNumber, so.transport, ...so.parts.flatMap(p => [p.partNumber, p.itemDescription])]
      .some(v => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );

  // ── Exports ────────────────────────────────────────────────────
  const exportCSV = () => {
    const hdrs = ["SO Ref","Project Name","Department","Part Number","Item Description","Qty","Dispatch Date","DC Number","Transport"];
    const rows = [];
    sos.forEach(so => {
      so.parts.forEach(p => {
        rows.push(
          [so.soRef, so.projectName, so.department||"", p.partNumber, p.itemDescription, p.quantity,
           formatDate(so.dispatchDate), so.dcNumber, so.transport]
          .map(v => `"${String(v||"").replace(/"/g,'""')}"`).join(",")
        );
      });
    });
    const csv = [hdrs.join(","), ...rows].join("\n");
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `shortage-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast("📊 CSV downloaded");
  };

  const exportHTML = () => {
    const grouped = sos.map(so => {
      return so.parts.map((p, i) => {
        if (i === 0) return `<tr class="so-row">
          <td class="so" rowspan="${so.parts.length}">${so.soRef}</td>
          <td rowspan="${so.parts.length}">${so.projectName}</td>
          <td rowspan="${so.parts.length}">${so.department||"—"}</td>
          <td class="pn">${p.partNumber}</td><td>${p.itemDescription}</td><td class="qty">${p.quantity}</td>
          <td rowspan="${so.parts.length}">${formatDate(so.dispatchDate)||"—"}</td>
          <td rowspan="${so.parts.length}">${so.dcNumber||"—"}</td>
          <td rowspan="${so.parts.length}">${so.transport||"—"}</td>
        </tr>`;
        return `<tr><td class="pn">${p.partNumber}</td><td>${p.itemDescription}</td><td class="qty">${p.quantity}</td></tr>`;
      }).join("");
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shortage Report</title>
<style>
  body{font-family:Arial,sans-serif;padding:28px;color:#111}
  h1{color:#1a1a2e;margin-bottom:4px}
  p.meta{color:#666;font-size:13px;margin-bottom:24px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th{background:#1a1a2e;color:#fff;padding:10px 14px;text-align:left;white-space:nowrap}
  td{padding:8px 14px;border:1px solid #e5e7eb}
  tr.so-row td{background:#f0f4ff}
  td.so{color:#1a237e;font-weight:800}
  td.qty{text-align:center;font-weight:700}
  td.pn{font-family:monospace}
  @media print{@page{size:A4 landscape;margin:15mm}}
</style></head><body>
<h1>🚨 Project Shortage Report</h1>
<p class="meta">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; ${sos.length} SOs &nbsp;|&nbsp; ${totalParts} part lines</p>
<table><thead><tr>
  <th>SO Ref</th><th>Project Name</th><th>Department</th><th>Part Number</th>
  <th>Item Description</th><th>Qty</th>
  <th>Dispatch Date</th><th>DC Number</th><th>Transport</th>
</tr></thead><tbody>${grouped}</tbody></table>
</body></html>`;
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `shortage-report-${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    showToast("📄 Report downloaded");
  };

  // ── Shared styles ──────────────────────────────────────────────
  const S = {
    page:     { fontFamily:"'DM Sans','Segoe UI',sans-serif", minHeight:"100vh", background:"linear-gradient(135deg,#0f0c29,#1a1a4e,#24243e)", color:"#e8eaf6" },
    card:     { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:20 },
    label:    { display:"block", fontSize:11, fontWeight:700, color:"#9fa8da", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.6px" },
    err:      { color:"#ff6b6b", fontSize:11, marginTop:3 },
    ghostBtn: { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", color:"#c5cae9", borderRadius:8, padding:"8px 16px", fontWeight:600, fontSize:13, cursor:"pointer" },
    iconBtn:  c => ({ background:`rgba(${c},0.12)`, border:`1px solid rgba(${c},0.3)`, color:`rgb(${c})`, borderRadius:6, padding:"4px 11px", fontSize:12, cursor:"pointer" }),
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={{ background:"rgba(255,255,255,0.04)", borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#f7971e,#ffd200)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🚨</div>
          <div>
            <div style={{ fontWeight:800, fontSize:19, color:"#fff" }}>ShortageTracker</div>
            <div style={{ fontSize:11, color:"#9fa8da" }}>Live • Shared • Real-time</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {[["SOs", sos.length, "#ffd200"], ["Part Lines", totalParts, "#90caf9"]].map(([l,v,c]) => (
            <div key={l} style={{ background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"6px 14px", fontSize:13 }}>
              <span style={{ color:c, fontWeight:800 }}>{v}</span>{" "}
              <span style={{ color:"#9fa8da" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px 24px 0" }}>

        {/* ── Tabs ── */}
        <div style={{ display:"flex", gap:2, borderBottom:"1px solid rgba(255,255,255,0.1)", marginBottom:20 }}>
          {[["add", editId ? "✏️ Edit SO" : "➕ New SO"], ["list", `📋 All SOs (${sos.length})`]].map(([k,l]) => (
            <button key={k} onClick={() => { if (k==="list" && editId) cancelEdit(); else setTab(k); }}
              style={{ padding:"10px 20px", border:"none", background:"none", cursor:"pointer", fontWeight:700, fontSize:13,
                color: tab===k ? "#ffd200" : "#9fa8da",
                borderBottom: tab===k ? "2px solid #ffd200" : "2px solid transparent",
                marginBottom:-1 }}>
              {l}
            </button>
          ))}
        </div>

        {/* ══════════════ ADD / EDIT FORM ══════════════ */}
        {tab === "add" && (
          <div style={{ maxWidth:860 }}>

            {/* SO header fields */}
            <div style={{ ...S.card, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14, color:"#ffd200", marginBottom:16 }}>📦 SO Details</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))", gap:14 }}>
                {[
                  { key:"soRef",        label:"SO Ref *",       ph:"SO-2024-001" },
                  { key:"projectName",  label:"Project Name *", ph:"Project Apollo" },
                  { key:"dispatchDate", label:"Dispatch Date",  ph:"", type:"date" },
                  { key:"dcNumber",     label:"DC Number",      ph:"DC-5678" },
                  { key:"transport",    label:"Transport",      ph:"BlueDart / DTDC" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={S.label}>{f.label}</label>
                    <input type={f.type||"text"} value={form[f.key]} placeholder={f.ph}
                      onChange={e => setField(f.key, e.target.value)}
                      style={inp(errors[f.key] ? errInp : {})}
                      onFocus={e  => e.target.style.border = "1px solid #ffd200"}
                      onBlur={e   => e.target.style.border = errors[f.key] ? "1px solid #ff6b6b" : "1px solid rgba(255,255,255,0.15)"}
                    />
                    {errors[f.key] && <div style={S.err}>{errors[f.key]}</div>}
                  </div>
                ))}
                <div>
                  <label style={S.label}>Department</label>
                  <select value={form.department} onChange={e => setField("department", e.target.value)}
                    style={{ ...inp(), cursor:"pointer", appearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239fa8da' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center" }}>
                    <option value="" style={{ background:"#1e1e3f" }}>— Select —</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d} style={{ background:"#1e1e3f" }}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Parts */}
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontWeight:700, fontSize:14, color:"#ffd200" }}>
                  🔩 Part Entries
                  <span style={{ background:"rgba(255,210,0,0.15)", color:"#ffd200", borderRadius:6, padding:"2px 8px", fontSize:12, marginLeft:8 }}>
                    {form.parts.length}
                  </span>
                </div>
                <button onClick={addPart} style={{ ...S.ghostBtn, display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ fontSize:16 }}>+</span> Add Part
                </button>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"2fr 3fr 1fr 32px", gap:8, marginBottom:6, paddingLeft:2 }}>
                {["Part Number *","Item Description *","Qty *",""].map((h,i) => (
                  <div key={i} style={{ fontSize:10, fontWeight:700, color:"#9fa8da", textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</div>
                ))}
              </div>

              {form.parts.map((p, idx) => (
                <div key={p.id} style={{ display:"grid", gridTemplateColumns:"2fr 3fr 1fr 32px", gap:8, marginBottom:8, alignItems:"start" }}>
                  <div>
                    <input value={p.partNumber} placeholder={`PN-${1000+idx}`}
                      onChange={e => setPartField(p.id,"partNumber",e.target.value)}
                      style={inp(errors[`part_${p.id}_partNumber`] ? errInp : {})}
                      onFocus={e => e.target.style.border="1px solid #ffd200"}
                      onBlur={e  => e.target.style.border=errors[`part_${p.id}_partNumber`]?"1px solid #ff6b6b":"1px solid rgba(255,255,255,0.15)"}
                    />
                    {errors[`part_${p.id}_partNumber`] && <div style={S.err}>Required</div>}
                  </div>
                  <div>
                    <input value={p.itemDescription} placeholder="Steel bracket 50mm"
                      onChange={e => setPartField(p.id,"itemDescription",e.target.value)}
                      style={inp(errors[`part_${p.id}_itemDescription`] ? errInp : {})}
                      onFocus={e => e.target.style.border="1px solid #ffd200"}
                      onBlur={e  => e.target.style.border=errors[`part_${p.id}_itemDescription`]?"1px solid #ff6b6b":"1px solid rgba(255,255,255,0.15)"}
                    />
                    {errors[`part_${p.id}_itemDescription`] && <div style={S.err}>Required</div>}
                  </div>
                  <div>
                    <input type="number" value={p.quantity} placeholder="10" min="1"
                      onChange={e => setPartField(p.id,"quantity",e.target.value)}
                      style={inp(errors[`part_${p.id}_quantity`] ? errInp : {})}
                      onFocus={e => e.target.style.border="1px solid #ffd200"}
                      onBlur={e  => e.target.style.border=errors[`part_${p.id}_quantity`]?"1px solid #ff6b6b":"1px solid rgba(255,255,255,0.15)"}
                    />
                    {errors[`part_${p.id}_quantity`] && <div style={S.err}>Req.</div>}
                  </div>
                  <button onClick={() => removePart(p.id)}
                    style={{ background:"rgba(255,107,107,0.1)", border:"1px solid rgba(255,107,107,0.25)", color:"#ff6b6b",
                      borderRadius:7, width:32, height:36, cursor:form.parts.length===1?"not-allowed":"pointer",
                      fontSize:18, display:"flex", alignItems:"center", justifyContent:"center",
                      opacity:form.parts.length===1?0.3:1 }}>×
                  </button>
                </div>
              ))}

              <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)", marginTop:14, paddingTop:14, display:"flex", gap:10 }}>
                <button onClick={handleSubmit}
                  style={{ background:"linear-gradient(135deg,#f7971e,#ffd200)", color:"#1a1a2e", border:"none", borderRadius:9, padding:"11px 28px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                  {editId ? "Update SO" : "Save SO"}
                </button>
                {editId && <button onClick={cancelEdit} style={S.ghostBtn}>Cancel</button>}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ LIST VIEW ══════════════ */}
        {tab === "list" && (
          <div>
            <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center", justifyContent:"space-between" }}>
              <input placeholder="🔍 Search SO, project, part…" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inp(), width:250 }}
              />
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={exportCSV} disabled={sos.length===0}
                  style={{ background:"rgba(99,179,139,0.15)", border:"1px solid rgba(99,179,139,0.4)", color:"#81c995", borderRadius:8, padding:"8px 16px", fontWeight:600, fontSize:13, cursor:sos.length?"pointer":"not-allowed", opacity:sos.length?1:0.5 }}>
                  📊 Export CSV
                </button>
                <button onClick={exportHTML} disabled={sos.length===0}
                  style={{ background:"rgba(100,149,237,0.15)", border:"1px solid rgba(100,149,237,0.4)", color:"#90caf9", borderRadius:8, padding:"8px 16px", fontWeight:600, fontSize:13, cursor:sos.length?"pointer":"not-allowed", opacity:sos.length?1:0.5 }}>
                  📄 Export Report
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign:"center", padding:60, color:"#9fa8da" }}>Connecting to database…</div>
            ) : filteredSos.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, color:"#9fa8da" }}>
                <div style={{ fontSize:40, marginBottom:10 }}>📭</div>
                <div style={{ fontWeight:600 }}>{search ? "No matches found" : "No SOs yet"}</div>
                {!search && <div style={{ fontSize:13, marginTop:6 }}>Click '➕ New SO' to get started</div>}
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {filteredSos.map(so => {
                  const open = expandedSO === so.id;
                  return (
                    <div key={so.id} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, overflow:"hidden" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", cursor:"pointer", background:open?"rgba(255,210,0,0.05)":"transparent" }}
                        onClick={() => setExpandedSO(open ? null : so.id)}>
                        <div style={{ fontSize:13, transition:"transform 0.2s", transform:open?"rotate(90deg)":"rotate(0)", color:"#ffd200", minWidth:14 }}>▶</div>
                        <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1.5fr 1fr 1fr 1fr 1fr", gap:8, alignItems:"center" }}>
                          {[
                            { lbl:"SO Ref",    val:so.soRef,                       gold:true  },
                            { lbl:"Project",   val:so.projectName                             },
                            { lbl:"Dept",      val:so.department||"—"                         },
                            { lbl:"Dispatch",  val:formatDate(so.dispatchDate)||"—"           },
                            { lbl:"DC No.",    val:so.dcNumber||"—"                           },
                            { lbl:"Transport", val:so.transport||"—"                          },
                          ].map(({ lbl, val, gold }) => (
                            <div key={lbl}>
                              <div style={{ fontSize:10, color:"#9fa8da", textTransform:"uppercase", letterSpacing:"0.5px" }}>{lbl}</div>
                              <div style={{ fontWeight:gold?800:600, color:gold?"#ffd200":"#e8eaf6", fontSize:13 }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                          <div style={{ background:"rgba(255,210,0,0.15)", color:"#ffd200", borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700 }}>
                            {so.parts.length} part{so.parts.length!==1?"s":""}
                          </div>
                          <button onClick={e => { e.stopPropagation(); handleEdit(so); }} style={S.iconBtn("100,149,237")}>Edit</button>
                          <button onClick={e => { e.stopPropagation(); setDeleteConfirm(so.id); }} style={S.iconBtn("255,107,107")}>Del</button>
                        </div>
                      </div>

                      {open && (
                        <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)" }}>
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                            <thead>
                              <tr>
                                {["#","Part Number","Item Description","Qty"].map(h => (
                                  <th key={h} style={{ background:"rgba(255,255,255,0.05)", padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#9fa8da", textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {so.parts.map((p,i) => (
                                <tr key={p.id} style={{ background:i%2===0?"rgba(255,255,255,0.02)":"transparent" }}>
                                  <td style={{ padding:"9px 14px", color:"#555", fontSize:12 }}>{i+1}</td>
                                  <td style={{ padding:"9px 14px", fontFamily:"monospace", color:"#c5cae9" }}>{p.partNumber}</td>
                                  <td style={{ padding:"9px 14px" }}>{p.itemDescription}</td>
                                  <td style={{ padding:"9px 14px", fontWeight:700, color:"#ffd200" }}>{p.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {filteredSos.length > 0 && (
              <div style={{ marginTop:10, fontSize:12, color:"#555", textAlign:"right" }}>
                {filteredSos.length} SO{filteredSos.length!==1?"s":""} • {filteredSos.reduce((a,s)=>a+s.parts.length,0)} part lines
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, background:toast.type==="error"?"#b71c1c":"#1b5e20", color:"#fff", padding:"12px 20px", borderRadius:10, fontWeight:600, fontSize:14, boxShadow:"0 8px 32px rgba(0,0,0,0.4)", zIndex:1000 }}>
          {toast.msg}
        </div>
      )}

      {/* ── Delete modal ── */}
      {deleteConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
          <div style={{ background:"#1e1e3f", border:"1px solid rgba(255,255,255,0.15)", borderRadius:16, padding:28, maxWidth:360, textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🗑️</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>Delete this SO?</div>
            <div style={{ color:"#9fa8da", fontSize:14, marginBottom:24 }}>All part entries under this SO will be removed.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ background:"#c62828", color:"#fff", border:"none", borderRadius:8, padding:"10px 24px", fontWeight:700, cursor:"pointer" }}>Delete</button>
              <button onClick={() => setDeleteConfirm(null)} style={{ background:"rgba(255,255,255,0.1)", color:"#e8eaf6", border:"none", borderRadius:8, padding:"10px 24px", fontWeight:600, cursor:"pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
        input::placeholder { color: #4a5280; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
        input[type="number"]::-webkit-inner-spin-button { opacity: 0.4; }
        ::-webkit-scrollbar { height:5px; width:5px; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.2); border-radius:3px; }
      `}</style>
    </div>
  );
}
