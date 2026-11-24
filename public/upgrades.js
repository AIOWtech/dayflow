const style = document.createElement("style");
style.textContent = `
#dfUpgradeLauncher{border:1px solid #31415e;background:#15233a;color:#dce7ff;border-radius:10px;padding:9px 12px;font-size:11px}
#dfUpgradePanel{position:fixed;inset:0;z-index:1000;background:#050914cc;display:none;align-items:center;justify-content:center;padding:18px}
#dfUpgradePanel.open{display:flex}
.df-card{width:min(860px,100%);max-height:90vh;overflow:auto;background:#101a2c;border:1px solid #34435e;border-radius:18px;padding:22px;box-shadow:0 30px 100px #000b;color:#edf3ff}
.df-head{display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:-22px;background:#101a2c;padding:8px 0 14px;z-index:2}
.df-head h2{margin:0;font:700 21px Manrope, sans-serif}
.df-close,.df-btn{border:1px solid #34435e;background:#1b2a42;color:#eaf0ff;border-radius:9px;padding:9px 12px;font-size:11px}
.df-btn.primary{background:#718eff;border:0;color:white;font-weight:700}
.df-tabs{display:flex;flex-wrap:wrap;gap:7px;margin:5px 0 18px}
.df-tab{border:1px solid #34435e;background:#142239;color:#aebbd2;border-radius:9px;padding:8px 11px;font-size:11px}
.df-tab.active{background:#283c61;color:white;border-color:#819dff}
.df-section{display:none}.df-section.active{display:block}
.df-item{border:1px solid #2c3b55;border-radius:12px;padding:13px;margin:9px 0;background:#131f33}
.df-item p,.df-muted{color:#9cabc4;font-size:11px;line-height:1.6}
.df-item b{font-size:12px}
.df-row{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:9px 0}
.df-input,.df-select,.df-area{width:100%;background:#0b1424;border:1px solid #34435e;color:#edf3ff;border-radius:9px;padding:10px;font:12px 'DM Sans',sans-serif}
.df-area{min-height:110px;resize:vertical}
.df-field{display:block;font-size:11px;color:#b9c6dc;margin:10px 0}
.df-field input,.df-field select,.df-field textarea{display:block;margin-top:6px}
.df-empty{padding:20px;text-align:center;color:#9cabc4;border:1px dashed #34435e;border-radius:12px;font-size:12px}
.df-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.df-check{display:flex;gap:9px;align-items:center;font-size:12px;color:#dce7ff;margin:12px 0}
.df-status{font-size:10px;color:#94a6c5;margin:8px 0}
@media(max-width:600px){#dfUpgradePanel{padding:7px}.df-card{max-height:96vh;padding:14px}.df-grid{grid-template-columns:1fr}}
`;
document.head.append(style);

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $ = id => document.getElementById(id);
let currentTasks = [];
let currentWorkspaces = [];
let activeTab = "notifications";

function ensurePanel() {
  if ($("dfUpgradePanel")) return;
  const top = document.querySelector(".top-right");
  if (top) {
    const launcher = document.createElement("button");
    launcher.id = "dfUpgradeLauncher";
    launcher.type = "button";
    launcher.textContent = "✦ Tools";
    launcher.addEventListener("click", openPanel);
    top.insertBefore(launcher, $("topAvatar"));
  }
  const panel = document.createElement("div");
  panel.id = "dfUpgradePanel";
  panel.innerHTML = `
    <section class="df-card" role="dialog" aria-modal="true" aria-labelledby="dfTitle">
      <header class="df-head"><div><small class="kicker">DAYFLOW WORKSPACE</small><h2 id="dfTitle">Workspace tools</h2></div><button class="df-close" id="dfClose">Close ×</button></header>
      <nav class="df-tabs">
        <button class="df-tab active" data-tab="notifications">Notifications</button>
        <button class="df-tab" data-tab="tasks">Task controls</button>
        <button class="df-tab" data-tab="exports">Exports</button>
        <button class="df-tab" data-tab="drive">Google Drive</button>
        <button class="df-tab" data-tab="teams">Team workspace</button>
        <button class="df-tab" data-tab="guide">Getting started</button>
      </nav>
      <section class="df-section active" id="df-notifications"><div class="df-row"><button class="df-btn" id="dfRefreshNotifications">Refresh</button><button class="df-btn" id="dfReadAll">Mark all as read</button></div><div id="dfNotificationList" class="df-muted">Loading notifications…</div></section>
      <section class="df-section" id="df-tasks"><p class="df-muted">Retry is limited to failed/cancelled non-email tasks. Running tasks cannot be cancelled safely yet.</p><label class="df-field">Choose a task<select id="dfTaskControl" class="df-select"></select></label><div class="df-row"><button class="df-btn" id="dfRetry">Retry task</button><button class="df-btn" id="dfCancel">Cancel task</button></div><p id="dfTaskStatus" class="df-status"></p></section>
      <section class="df-section" id="df-exports"><p class="df-muted">Choose a completed task or a task with saved output. PDF uses your browser's print-to-PDF dialog; DOCX creates a Word-compatible document.</p><label class="df-field">Task<select id="dfExportTask" class="df-select"></select></label><label class="df-field">Document content<textarea id="dfExportContent" class="df-area" placeholder="Saved task output will appear here. You can edit it before exporting."></textarea></label><div class="df-row"><button class="df-btn" id="dfPdf">Export PDF</button><button class="df-btn" id="dfDocx">Export DOCX</button></div></section>
      <section class="df-section" id="df-drive"><p class="df-muted">Save a task's result to the connected Google Drive account. Dayflow only uploads after you press the button.</p><label class="df-field">Task<select id="dfDriveTask" class="df-select"></select></label><div class="df-row"><button class="df-btn primary" id="dfDriveUpload">Upload selected result to Drive</button></div><p id="dfDriveStatus" class="df-status"></p></section>
      <section class="df-section" id="df-teams"><p class="df-muted">Create a shared workspace and invite collaborators. Invitations expire after seven days and can only be accepted by the invited email address.</p><div class="df-grid"><label class="df-field">Workspace name<input id="dfWorkspaceName" class="df-input" maxlength="80" placeholder="Product team"></label><div class="df-field" style="align-self:end"><button class="df-btn primary" id="dfCreateWorkspace">Create workspace</button></div></div><label class="df-field">Your workspaces<select id="dfWorkspaceSelect" class="df-select"></select></label><div class="df-row"><button class="df-btn" id="dfActivateWorkspace">Switch to selected workspace</button></div><div class="df-grid"><label class="df-field">Invite email<input id="dfInviteEmail" class="df-input" type="email" placeholder="teammate@example.com"></label><label class="df-field">Role<select id="dfInviteRole" class="df-select"><option value="member">Member</option><option value="admin">Admin</option></select></label></div><div class="df-row"><button class="df-btn" id="dfInvite">Create invitation link</button></div><p id="dfTeamStatus" class="df-status"></p></section>
      <section class="df-section" id="df-guide"><p class="df-muted">A quick first-run guide. Complete each step as you explore Dayflow.</p><label class="df-check"><input type="checkbox" data-guide="profile"> Review your profile and timezone</label><label class="df-check"><input type="checkbox" data-guide="task"> Create your first task</label><label class="df-check"><input type="checkbox" data-guide="result"> Open and review a completed result</label><label class="df-check"><input type="checkbox" data-guide="integration"> Connect an integration when you need it</label><div class="df-row"><button class="df-btn primary" id="dfFinishGuide">Finish onboarding</button><button class="df-btn" id="dfDismissGuide">Dismiss guide</button></div><p id="dfGuideStatus" class="df-status"></p></section>
    </section>`;
  document.body.append(panel);
  $("dfClose").onclick = closePanel;
  panel.addEventListener("click", e => { if (e.target === panel) closePanel(); });
  panel.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("dfRefreshNotifications").onclick = loadNotifications;
  $("dfReadAll").onclick = async () => { await window.Dayflow.api("/api/notifications/read-all",{method:"POST"}); await loadNotifications(); };
  $("dfRetry").onclick = () => taskAction("retry");
  $("dfCancel").onclick = () => taskAction("cancel");
  $("dfExportTask").onchange = fillExportContent;
  $("dfDriveTask").onchange = () => {};
  $("dfPdf").onclick = exportPdf;
  $("dfDocx").onclick = exportDocx;
  $("dfDriveUpload").onclick = uploadDrive;
  $("dfCreateWorkspace").onclick = createWorkspace;
  $("dfInvite").onclick = inviteMember;
  $("dfActivateWorkspace").onclick = activateWorkspace;
  $("dfFinishGuide").onclick = () => saveOnboarding(true,false);
  $("dfDismissGuide").onclick = () => saveOnboarding(false,true);
}

function openPanel() {
  ensurePanel();
  $("dfUpgradePanel").classList.add("open");
  refreshAll();
}
function closePanel() { $("dfUpgradePanel")?.classList.remove("open"); }
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".df-tab").forEach(b => b.classList.toggle("active",b.dataset.tab===tab));
  document.querySelectorAll(".df-section").forEach(s => s.classList.toggle("active",s.id==="df-"+tab));
}
async function refreshAll() {
  if (!window.Dayflow?.api) return;
  await Promise.allSettled([loadNotifications(),loadTasks(),loadWorkspaces(),loadOnboarding()]);
}
async function loadNotifications() {
  const rows = await window.Dayflow.api("/api/notifications");
  $("dfNotificationList").innerHTML = rows.length ? rows.map(n => `
    <article class="df-item"><div class="df-row"><b>${escapeHtml(n.title)}</b><span class="tag ${escapeHtml(n.kind)}">${n.read_at?"Read":"New"}</span><span class="df-status">${new Date(n.created_at).toLocaleString()}</span></div><p>${escapeHtml(n.message)}</p>${!n.read_at?`<button class="df-btn" data-read="${escapeHtml(n.id)}">Mark read</button>`:""}</article>`).join("") : '<div class="df-empty">You are all caught up. New task activity will appear here.</div>';
  $("dfNotificationList").querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{await window.Dayflow.api("/api/notifications/"+b.dataset.read+"/read",{method:"POST"});await loadNotifications();});
}
async function loadTasks() {
  currentTasks = await window.Dayflow.api("/api/tasks");
  const opts = currentTasks.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml((t.instruction||"Task").slice(0,70))} · ${escapeHtml(t.status)}</option>`).join("");
  for(const id of ["dfTaskControl","dfExportTask","dfDriveTask"]) $(id).innerHTML = opts || '<option value="">No tasks yet</option>';
  fillExportContent();
}
function selectedTask(id) { return currentTasks.find(t=>t.id===$(id).value); }
function resultText(task) {
  if(!task)return "";
  const result=task.result;
  if(typeof result==="string")return result;
  if(result?.content)return String(result.content);
  if(result?.markdown)return String(result.markdown);
  if(result?.body)return String(result.body);
  if(result?.summary)return String(result.summary);
  return task.internalPlan?.summary||task.instruction||"";
}
function fillExportContent() { $("dfExportContent").value=resultText(selectedTask("dfExportTask")); }
async function taskAction(action) {
  const id=$("dfTaskControl").value;if(!id)return;
  const status=$("dfTaskStatus");status.textContent="Working…";
  try { const result=await window.Dayflow.api("/api/tasks/"+id+"/"+action,{method:"POST"});status.textContent=action==="retry"?"Task reset and ready for a new attempt. Open the task and run it again.":"Task cancelled.";await loadTasks(); }
  catch(e){status.textContent=e.message;}
}
function printableHtml(text) {
  const escaped=escapeHtml(text);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dayflow export</title><style>body{font:14px/1.7 Arial,sans-serif;color:#202838;max-width:850px;margin:45px auto;padding:0 28px;white-space:pre-wrap}h1{font-size:24px}</style></head><body><h1>Dayflow document</h1>${escaped}</body></html>`;
}
function exportPdf() {
  const text=$("dfExportContent").value.trim();if(!text)return;
  const win=window.open("","_blank");if(!win){alert("Allow pop-ups to export this document.");return;}
  win.document.open();win.document.write(printableHtml(text));win.document.close();win.focus();win.onload=()=>win.print();
}
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipStore(files) {
  const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;
  for(const [name,value] of files){const nb=enc.encode(name),data=typeof value==="string"?enc.encode(value):value,crc=crc32(data);
    const local=new Uint8Array(30+nb.length+data.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,nb.length,true);local.set(nb,30);local.set(data,30+nb.length);locals.push(local);
    const central=new Uint8Array(46+nb.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,nb.length,true);cv.setUint32(42,offset,true);central.set(nb,46);centrals.push(central);offset+=local.length;
  }
  const centralSize=centrals.reduce((s,a)=>s+a.length,0),end=new Uint8Array(22),dv=new DataView(end.buffer);dv.setUint32(0,0x06054b50,true);dv.setUint16(8,files.length,true);dv.setUint16(10,files.length,true);dv.setUint32(12,centralSize,true);dv.setUint32(16,offset,true);
  return new Blob([...locals,...centrals,end],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
function xmlEscape(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function exportDocx() {
  const text=$("dfExportContent").value.trim();if(!text)return;
  const paragraphs=text.split(/\r?\n/).map(line=>'<w:p><w:r><w:t xml:space="preserve">'+xmlEscape(line)+'</w:t></w:r></w:p>').join("");
  const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraphs+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
  const files=[
    ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ["word/document.xml",documentXml]
  ];
  const blob=zipStore(files),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="dayflow-document.docx";a.click();URL.revokeObjectURL(url);
}
async function uploadDrive() {
  const task=selectedTask("dfDriveTask");if(!task)return;
  const status=$("dfDriveStatus");status.textContent="Uploading after your approval…";
  try {const content=resultText(task);const result=await window.Dayflow.api("/api/connectors/google/drive/upload",{method:"POST",body:JSON.stringify({name:(task.instruction||"Dayflow result").slice(0,140)+".md",mimeType:"text/markdown",content})});status.textContent="Uploaded: "+result.name+(result.webViewLink?" · "+result.webViewLink:"");}
  catch(e){status.textContent=e.message;}
}
async function loadWorkspaces() {
  currentWorkspaces=await window.Dayflow.api("/api/workspaces");
  $("dfWorkspaceSelect").innerHTML=currentWorkspaces.map(w=>'<option value="'+escapeHtml(w.id)+'" '+(w.active?"selected":"")+' >'+escapeHtml(w.name)+' · '+escapeHtml(w.role)+(w.active?" · Active":"")+'</option>').join("")||'<option value="">No workspaces</option>';
}
async function activateWorkspace() {
  const id=$("dfWorkspaceSelect").value;if(!id)return;
  try{await window.Dayflow.api("/api/workspaces/"+id+"/activate",{method:"POST"});$("dfTeamStatus").textContent="Workspace switched. Refreshing your workspace…";location.reload();}
  catch(e){$("dfTeamStatus").textContent=e.message;}
}
async function createWorkspace() {
  const name=$("dfWorkspaceName").value.trim();if(!name)return;
  try{await window.Dayflow.api("/api/workspaces",{method:"POST",body:JSON.stringify({name})});$("dfTeamStatus").textContent="Workspace created. Reloading into the new workspace…";location.reload();}
  catch(e){$("dfTeamStatus").textContent=e.message;}
}
async function inviteMember() {
  const id=$("dfWorkspaceSelect").value,email=$("dfInviteEmail").value.trim();if(!id||!email)return;
  try{const r=await window.Dayflow.api("/api/workspaces/"+id+"/invitations",{method:"POST",body:JSON.stringify({email,role:$("dfInviteRole").value})});$("dfTeamStatus").innerHTML="Invitation created. Share this link: <a href='"+escapeHtml(r.inviteUrl)+"' target='_blank' rel='noopener'>Open invitation</a> <button class='df-btn' id='dfCopyInvite'>Copy link</button>";$("dfCopyInvite").onclick=()=>navigator.clipboard.writeText(r.inviteUrl);}
  catch(e){$("dfTeamStatus").textContent=e.message;}
}
async function loadOnboarding() {
  try{const status=await window.Dayflow.api("/api/onboarding");if(status.completed_at||status.dismissed_at)$("dfGuideStatus").textContent=status.completed_at?"Onboarding completed.":"Guide dismissed.";}
  catch(e){$("dfGuideStatus").textContent=e.message;}
}
async function saveOnboarding(completed,dismissed) {
  const checked=[...document.querySelectorAll("[data-guide]")].every(el=>el.checked);
  if(completed&&!checked){$("dfGuideStatus").textContent="Tick all four steps before completing onboarding.";return;}
  try{await window.Dayflow.api("/api/onboarding",{method:"POST",body:JSON.stringify({completed,dismissed})});$("dfGuideStatus").textContent=completed?"Welcome aboard. Onboarding completed.":"Guide dismissed.";}
  catch(e){$("dfGuideStatus").textContent=e.message;}
}
async function acceptInviteFromUrl() {
  const token=new URL(location.href).searchParams.get("invite");if(!token||!window.Dayflow?.api)return;
  try{const result=await window.Dayflow.api("/api/invitations/accept",{method:"POST",body:JSON.stringify({token})});const url=new URL(location.href);url.searchParams.delete("invite");history.replaceState({}, "", url);alert("You joined the shared workspace.");}
  catch(e){alert("Invitation: "+e.message);}
}
window.addEventListener("dayflow:ready", async () => {
  ensurePanel();
  try { await refreshAll(); await acceptInviteFromUrl(); } catch(e) { console.warn("Dayflow upgrades:",e.message); }
});
