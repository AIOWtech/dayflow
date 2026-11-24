let createClient;
async function loadSupabaseClient(){
  if(createClient)return createClient;
  const sources=[
    "https://esm.sh/@supabase/supabase-js@2",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
  ];
  let lastError;
  for(const source of sources){
    try{const mod=await import(source);if(typeof mod.createClient==="function"){createClient=mod.createClient;return createClient;}}
    catch(error){lastError=error;console.warn("Supabase client source unavailable:",source,error);}
  }
  throw lastError||new Error("Unable to load the Supabase browser client.");
}
const $=id=>document.getElementById(id);
const S={supabase:null,session:null,config:null,tasks:[],projects:[],memories:[],workflows:[],active:null,page:"overview",authMode:"signin",filter:"all",query:"",activityFilter:"all",settingsTab:"Profile",health:{},google:{connected:false,email:null,configured:false}};
const names={overview:["Overview","A clear view of what you're working on."],tasks:["My tasks","Your tasks, progress, and finished outcomes."],projects:["Projects","Group related tasks into meaningful outcomes."],inbox:["Inbox","Your review queue for things that need a decision."],research:["Research studio","Turn questions into structured research tasks."],documents:["Documents","Create useful documents from a clear brief."],email:["Email studio","Draft carefully and review before sending."],browser:["Browser tasks","Inspect webpages and review useful findings."],analytics:["Analytics","Understand your activity and progress."],integrations:["Integrations","Connect services that power your workflow."],activity:["Activity log","A timeline of task updates and outcomes."],billing:["Plans & billing","Understand your plan and subscription status."],settings:["Settings","Manage your account and workspace preferences."],workflows:["Workflows","Save repeatable instructions and run them whenever you need."]};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pretty=s=>String(s||"unknown").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const date=s=>s?new Date(s).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—";
const icon=m=>({document:"▤",email:"✉",browser:"◉",research:"⌕",plan:"✦"}[m]||"✦");
function toast(msg,type=""){const n=document.createElement("div");n.className=`toast ${type}`;n.textContent=msg;$("toastRegion").append(n);setTimeout(()=>n.remove(),4000)}
async function loadConfig(){try{await loadSupabaseClient();const r=await fetch("/api/config",{cache:"no-store"});if(!r.ok)throw Error("Configuration endpoint returned "+r.status);S.config=await r.json();if(!S.config.supabaseUrl||!S.config.supabasePublishableKey){$("authMessage").textContent="Supabase is not configured. Add the URL and publishable key in Vercel.";return}S.supabase=createClient(S.config.supabaseUrl,S.config.supabasePublishableKey);S.supabase.auth.onAuthStateChange((event,session)=>{if(session){queueMicrotask(()=>{if(S.session?.access_token!==session.access_token)void enter(session)});return}if(event==="SIGNED_OUT"&&S.session){S.session=null;$("appShell").hidden=true;$("landingPage").hidden=true;$("authGate").hidden=false;$("authMessage").textContent="Your session ended. Please sign in again.";}});const {data,error}=await S.supabase.auth.getSession();if(error)throw error;if(data.session){if(S.session?.access_token!==data.session.access_token)await enter(data.session)}else $("authMessage").textContent="Secure sign-in is ready."}catch(e){$("authMessage").textContent="Dayflow authentication could not initialize: "+String(e?.message||"Unknown error");console.error("Authentication initialization:",e)}}
async function enter(session){S.session=session;$("landingPage").hidden=true;$("authGate").hidden=true;$("appShell").hidden=false;const user=session.user||{};const email=user.email||user.phone||"Your account";const meta=user.user_metadata||{};const displayName=meta.full_name||meta.name||email.split("@")[0];$("userName").textContent=displayName;$("userEmail").textContent=email;$("userAvatar").textContent=$("topAvatar").textContent=(displayName[0]||"U").toUpperCase();await Promise.all([loadHealth(),loadTasks(),loadGoogleStatus(),loadProjects(),loadMemories(),loadWorkflows()]);
render();window.dispatchEvent(new CustomEvent("dayflow:ready"));
                             }
window.Dayflow={api:(url,opt)=>api(url,opt),getSession:()=>S.session,getTasks:()=>S.tasks};
async function api(url,opt={}){const h={...(opt.headers||{})};if(S.session?.access_token)h.Authorization=`Bearer ${S.session.access_token}`;if(opt.body)h["Content-Type"]="application/json";const r=await fetch(url,{...opt,headers:h});const t=await r.text();let data={};try{data=t?JSON.parse(t):{}}catch{data={error:t}}if(!r.ok)throw Error(data.error||`Request failed (${r.status})`);return data}
async function loadHealth(){try{S.health=await api("/api/health");$("systemDot").className=S.health.authConfigured?"ok":"bad";$("systemStatus").textContent=S.health.authConfigured?"Workspace connected":"Setup needed"}catch{$("systemDot").className="bad";$("systemStatus").textContent="Service unavailable"}}
async function loadProjects(){try{S.projects=await api("/api/projects")}catch(e){console.warn(e.message)}}
async function loadMemories(){try{S.memories=await api("/api/memories")}catch(e){console.warn(e.message)}}
async function loadWorkflows(){try{S.workflows=await api("/api/workflows")}catch(e){console.warn(e.message)}}
async function loadGoogleStatus(){
  try{
    S.google=await api("/api/connectors/google/status");
  }catch(e){
    S.google={connected:false,email:null,configured:false};
    console.error("Google status:",e.message);
  }
}
async function loadTasks(){try{const r=await api("/api/tasks");S.tasks=Array.isArray(r)?r:[];$("taskCount").textContent=S.tasks.length}catch(e){if(!/sign in|session/i.test(e.message))toast(e.message,"error")}}
function heading(key,action=""){const [title,desc]=names[key]||names.overview;return `<div class="heading"><div><small class="kicker">✦ DAYFLOW WORKSPACE</small><h1>${title}</h1><p>${desc}</p></div>${action}</div>`}
function tag(s){return `<span class="tag ${esc(s)}">${esc(pretty(s))}</span>`}
function row(t){return `<div class="task-row" data-task="${esc(t.id)}" tabindex="0" role="button"><span class="task-icon">${icon(t.mode)}</span><div class="task-main"><b>${esc(t.plan?.[0]?.title||t.instruction||"Untitled task")}</b><p>${esc(t.mode)} · Updated ${date(t.updatedAt||t.createdAt)}</p></div>${tag(t.status)}</div>`}
function empty(title,desc,btn="Create a task"){return `<div class="empty"><i>✳</i><h3>${title}</h3><p>${desc}</p><button class="btn primary" data-new-task>${btn} ↗</button></div>`}
function localGreeting(){
 const now=new Date(),hour=now.getHours(),meta=S.session?.user?.user_metadata||{},email=S.session?.user?.email||S.session?.user?.phone||"";
 const greeting=hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";
 const name=(meta.full_name||meta.name||email.split("@")[0]||"there").trim().split(/\s+/)[0];
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||"Local time";
 const dateLabel=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(now);
 return {greeting,name,zone,dateLabel};
}
const dailyFacts=[
 "A day on Venus is longer than its year: it rotates once every 243 Earth days, but orbits the Sun in about 225.",
 "Honeybees communicate the direction and distance of food through a movement known as the waggle dance.",
 "Octopuses have three hearts, and their blood contains a copper-based protein that helps carry oxygen.",
 "Sharks have been around longer than trees; their evolutionary history stretches back more than 400 million years.",
 "The first computer bug was an actual moth found in a computer relay in 1947.",
 "A group of flamingos is called a flamboyance.",
 "The Moon is moving away from Earth by roughly 3.8 centimetres each year.",
 "Some bamboo species can grow close to a metre in a single day under ideal conditions.",
 "Your brain uses roughly one-fifth of the body's energy, despite making up only a small fraction of its mass.",
 "The word 'robot' comes from a Czech word, robota, associated with forced labour."
];
function dailyFact(){const d=new Date(),key=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();return dailyFacts[key%dailyFacts.length]}
function updateWelcomeClock(){
 const now=new Date(),time=$("welcomeTime");if(!time)return;
 time.textContent=new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(now);
 const zone=$("welcomeZone");if(zone)zone.textContent=Intl.DateTimeFormat().resolvedOptions().timeZone||"Local time";
 const date=$("welcomeDate");if(date)date.textContent=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(now);
 const greeting=$("welcomeGreeting");if(greeting)greeting.textContent=now.getHours()<12?"Good morning":now.getHours()<17?"Good afternoon":"Good evening";
}
function overview(){
 let done=S.tasks.filter(t=>t.status==="completed").length,pending=S.tasks.filter(t=>["planned","planning","awaiting_approval","running"].includes(t.status)).length;
 const w=localGreeting();
 return `<section class="welcome-grid">
 <div class="welcome-card"><div class="welcome-copy"><small class="kicker">YOUR DAY, IN FLOW</small><h1><span id="welcomeGreeting">${w.greeting}</span>, ${esc(w.name)}.</h1><p>Here's what's happening in your workspace. Let's make today count.</p><div class="welcome-date" id="welcomeDate">${esc(w.dateLabel)}</div></div><div class="welcome-clock"><div class="clock-orbit"><span>✳</span></div><strong id="welcomeTime">--:--</strong><small id="welcomeZone">${esc(w.zone)}</small></div></div>
 <aside class="daily-spark"><div class="spark-top"><span>✦ A LITTLE SPARK</span><span class="spark-pill">DAILY DISCOVERY</span></div><div class="spark-icon">✧</div><h3>Did you know?</h3><p>${esc(dailyFact())}</p><small>A fresh curiosity, every day.</small></aside>
 </section>
 <section class="hero"><div><small class="kicker">✦ YOUR AI, READY WHEN YOU ARE</small><h2>Make progress on<br><em>what matters.</em></h2><p>Tell Dayflow the outcome you want. It can research, create, and organize the work, then save the result for you.</p><div class="hero-buttons"><button class="btn light-btn" data-new-task>✦ Create something ↗</button><button class="btn ghost-btn" data-go="projects">Explore projects</button></div></div><div class="hero-orbit"><span class="hero-core">✳</span></div></section>
 <div class="stats"><div class="stat"><div class="stat-label">Total tasks <span class="stat-icon">☷</span></div><div class="stat-value">${S.tasks.length}</div><small>Across your workspace</small></div><div class="stat"><div class="stat-label">Completed <span class="stat-icon">✓</span></div><div class="stat-value">${done}</div><small>Work successfully finished</small></div><div class="stat"><div class="stat-label">In progress <span class="stat-icon">◷</span></div><div class="stat-value">${pending}</div><small>Tasks needing attention</small></div><div class="stat"><div class="stat-label">Projects <span class="stat-icon">▦</span></div><div class="stat-value">0</div><small>Start your next big idea</small></div></div>
 <div class="columns"><section class="panel"><div class="panel-head"><div><h3>Recent work</h3><p>Your latest tasks and finished outcomes</p></div><button class="link-btn" data-go="tasks">View all ↗</button></div>${S.tasks.slice(0,5).map(row).join("")||empty("Your next good idea starts here","Create your first task and Dayflow will do the work.")}</section><section class="panel"><div class="panel-head"><div><h3>Quick start</h3><p>Pick a starting point</p></div></div><div class="quick-grid"><button class="quick" data-mode="auto" data-prompt="Create a project called "><i>✦</i><b>Create a project</b><p>Turn your idea into a real project brief.</p></button><button class="quick" data-mode="document"><i>▤</i><b>Create a document</b><p>Write a complete document from a brief.</p></button><button class="quick" data-go="research"><i>⌕</i><b>Explore a question</b><p>Research a topic and collect sources.</p></button><button class="quick" data-go="email"><i>✉</i><b>Draft an email</b><p>Prepare a message for your review.</p></button></div></section></div>`;
}
function detail(t){return `<div class="detail-grid"><section class="panel detail-card"><small class="kicker">TASK WORKSPACE</small><h2>${esc(t.plan?.[0]?.title||t.instruction)}</h2><p class="muted">${esc(t.internalPlan?.summary||t.summary||t.instruction||"")}</p><h3>Work & progress</h3><ol class="steps">${(t.plan||[]).map((s,i)=>`<li><span class="step-no">${i+1}</span><div><b>${esc(s.title||"Task step")}</b><p>${esc(s.description||"")}</p></div></li>`).join("")}</ol>${t.mode==="email"&&t.status==="awaiting_approval"&&t.result?.kind==="email"?`<div class="result"><b>Review email before sending</b><p><strong>To:</strong> ${esc(t.result.to||"No recipient supplied")}</p><p><strong>Subject:</strong> ${esc(t.result.subject||"")}</p><pre class="result-content">${esc(t.result.body||"")}</pre><p class="muted">Review the recipient and message. Clicking Execute task will ask for confirmation before sending.</p></div>`:""}<div class="actions">${`<button class="btn primary" id="runTask">Execute task ↗</button>`}<button class="btn secondary" id="refreshTask">Refresh</button></div>${t.result?`<div class="result"><b>Result</b><p>${esc(t.result.summary||"")}</p>${t.result.content?`<pre class="result-content">${esc(t.result.content)}</pre>`:""}${t.result.kind==="document"?`<button class="btn secondary" id="downloadDocument">Download Markdown</button>`:""}${t.result.sources?.length?`<ol>${t.result.sources.map((x,i)=>`<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title||x.url)}</a></li>`).join("")}</ol>`:""}</div>`:""}</section><aside class="panel meta"><h3>Task details</h3><div class="meta-row"><span>Status</span>${tag(t.status)}</div><div class="meta-row"><span>Type</span><b>${esc(pretty(t.mode))}</b></div><div class="meta-row"><span>Created</span><b>${date(t.createdAt)}</b></div><h3>Activity</h3>${(t.events||[]).slice().reverse().map(e=>`<div class="event"><i>✦</i><div><b>${esc(e.message)}</b><p>${date(e.at)}</p></div></div>`).join("")}</aside></div>`}
function tasksPage(){let ts=S.tasks.filter(t=>(S.filter==="all"||t.status===S.filter)&&(`${t.plan?.[0]?.title||""} ${t.instruction||""}`).toLowerCase().includes(S.query.toLowerCase()));return `${heading("tasks",`<button class="btn primary" data-new-task>＋ New task</button>`)}<div class="toolbar"><div class="filters">${[["all","All tasks"],["planned","Planned"],["completed","Completed"],["failed","Failed"]].map(([v,l])=>`<button class="filter ${S.filter===v?"active":""}" data-filter="${v}">${l}</button>`).join("")}</div><input class="search-input" id="taskSearch" value="${esc(S.query)}" placeholder="Search tasks…"></div><section class="panel">${ts.map(row).join("")||empty("No matching tasks","Create a task or try another filter.")}</section>${S.active?detail(S.active):""}`}
function feature(k){if(k==="research")return `${heading(k)}<section class="feature-banner"><small class="kicker">RESEARCH, WITH INTENTION</small><h2>Start with a question. Finish with clarity.</h2><p>Dayflow searches the web, analyzes useful sources, and saves a readable report.</p></section><section class="panel form-panel"><h3>Research brief</h3><label>What do you want to find out?</label><textarea id="researchPrompt" placeholder="Compare three approaches to…"></textarea><button class="btn primary" id="researchStart">Start research ↗</button></section><section class="panel">${S.tasks.filter(t=>t.mode==="research").map(row).join("")}</section>`;
if(k==="documents")return `${heading(k,`<button class="btn primary" data-mode="document">＋ New document</button>`)}<section class="feature-banner"><small class="kicker">DOCUMENT STUDIO</small><h2>From a rough brief to a document you can use.</h2><p>Generate a complete Markdown document, keep it in your workspace, and download it when ready.</p></section><section class="panel">${S.tasks.filter(t=>t.mode==="document").map(row).join("")||empty("No documents yet","Create a document task to get started.","Create a document")}</section>`;
if(k==="browser")return `${heading(k)}<section class="feature-banner"><small class="kicker">BROWSER TASKS</small><h2>Get useful answers from public webpages.</h2><p>Inspect a public HTTPS webpage in an isolated Browserbase session.</p></section><section class="panel form-panel"><h3>Browser task</h3><label>What should the browser help with?</label><textarea id="browserPrompt" placeholder="Open a public webpage and summarize the main points…"></textarea><button class="btn primary" id="browserStart">Run browser task ↗</button></section>`;
if(k==="email")return `${heading(k)}<section class="feature-banner"><small class="kicker">EMAIL STUDIO</small><h2>Write it, review it, send it.</h2><p>Connect Gmail once, generate a draft, then send it when you are satisfied.</p></section><section class="panel form-panel"><h3>Compose an email</h3><label>Recipient email</label><input id="emailTo" type="email" placeholder="name@example.com" autocomplete="email"><label>What should the email say?</label><textarea id="emailInstruction" placeholder="Write a polite email asking about…"></textarea><button class="btn primary" id="emailDraftButton">✦ Generate draft</button><br><br><label>Subject</label><input id="emailSubject" placeholder="Email subject"><label>Message</label><textarea id="emailBody" placeholder="Your draft appears here. Edit it before sending."></textarea><div class="actions"><button class="btn secondary" id="copyEmail">Copy draft</button><button class="btn primary" id="sendEmail" ${S.google.connected?"":"disabled"}>Send email ↗</button></div><div class="callout">${S.google.connected?`Connected to ${esc(S.google.email||"Gmail")}. Review the recipient, subject and message before sending.`:"Connect your Google account in Integrations to enable sending."}</div></section>`; 
if(k==="integrations")return `${heading(k)}<section class="panel form-panel"><h3>Service status</h3>${integration("Supabase authentication","Sign-up and account sessions","◈",S.health.authConfigured)}${integration("OpenRouter AI","Task execution and email drafting","✦",S.health.aiConfigured)}${integration("Tavily research","Web research","⌕",S.health.researchConfigured)}${integration("Browserbase","Browser automation","◉",S.health.browserConfigured)}${integration("Google OAuth",S.google.email||"Connect your Google account","G",S.google.connected)}<div class="actions">${S.google.connected?'<button class="btn secondary" id="googleDisconnect">Disconnect Google</button>':'<button class="btn primary" id="googleConnect">Connect Google ↗</button>'}<button class="btn secondary" id="googleRefresh">Refresh status</button></div><div class="callout">Google connection requests Gmail send and Google Drive file access. Dayflow will not send emails or upload files without your approval.</div><div class="callout">Add secrets through Vercel Environment Variables, not frontend code.</div></section>`;
if(k==="projects")return `${heading(k)}<section class="panel form-panel"><h3>Create a project</h3><form id="projectForm"><label>Project name<input id="projectName" required maxlength="100"></label><label>Description<textarea id="projectDescription" maxlength="1000"></textarea></label><button class="btn primary">Create project ↗</button></form></section><section class="feature-grid">${S.projects.map(p=>`<article class="panel form-panel"><h3>${esc(p.name)}</h3><p>${esc(p.description||"No description yet.")}</p>${tag(p.status)}</article>`).join("")||"<p class=\"muted\">No projects yet.</p>"}</section>`;
if(k==="workflows")return `${heading(k)}<section class="panel form-panel"><h3>Save a reusable workflow</h3><form id="workflowForm"><label>Name<input id="workflowName" required maxlength="100"></label><label>Description<input id="workflowDescription" maxlength="500"></label><label>Instructions<textarea id="workflowInstruction" required minlength="8" maxlength="4000"></textarea></label><label>Type<select id="workflowMode"><option value="auto">Automatic</option><option value="research">Research</option><option value="document">Document</option><option value="plan">Plan</option></select></label><button class="btn primary">Save workflow ↗</button></form></section><section class="panel"><h3>Saved workflows</h3>${S.workflows.map(w=>`<div class="task-row"><div class="task-main"><b>${esc(w.name)}</b><p>${esc(w.description||w.instruction)}</p></div><button class="btn secondary" data-run-workflow="${esc(w.id)}">Run</button><button class="btn ghost-btn" data-delete-workflow="${esc(w.id)}">Delete</button></div>`).join("")||"<p class=\"muted\">No saved workflows.</p>"}</section>`;
if(k==="inbox")return `${heading(k)}<section class="panel">${S.tasks.filter(t=>["awaiting_approval","failed"].includes(t.status)).map(row).join("")||empty("You're all caught up","Approvals and errors will appear here when supported.")}</section>`;
if(k==="analytics"){let done=S.tasks.filter(t=>t.status==="completed").length;return `${heading(k)}<div class="stats"><div class="stat"><div class="stat-label">Total tasks</div><div class="stat-value">${S.tasks.length}</div></div><div class="stat"><div class="stat-label">Completed</div><div class="stat-value">${done}</div></div><div class="stat"><div class="stat-label">Completion rate</div><div class="stat-value">${S.tasks.length?Math.round(done/S.tasks.length*100):0}%</div></div><div class="stat"><div class="stat-label">AI plans</div><div class="stat-value">${S.health.aiConfigured?"On":"Off"}</div></div></div><section class="panel form-panel"><h3>Activity overview</h3><p class="muted">These figures reflect tasks available to this server instance. Persistent analytics are not enabled.</p></section>`}
if(k==="billing")return `${heading(k)}<section class="feature-banner"><small class="kicker">DAYFLOW PLANS</small><h2>Simple plans, no pretend checkout.</h2><p>Billing UI is a preview. No subscription is being charged or activated in this starter build.</p></section><div class="feature-grid"><section class="panel form-panel"><small class="kicker">STARTER</small><h3>Free workspace</h3><h2>₦0 <small class="muted">/ month</small></h2><p class="muted">Explore the workspace, create plans, and test the core flow.</p>${tag("completed")}</section><section class="panel form-panel"><small class="kicker">PRO</small><h3>Dayflow Pro</h3><h2>Coming next</h2><p class="muted">Usage limits, secure payments, webhook-based entitlement checks, and invoices must be implemented before selling subscriptions.</p><button class="btn secondary" id="billingInfo">What needs building?</button></section></div>`;
return settings()}
function integration(n,d,i,ok){return `<div class="integration"><i>${i}</i><div><b>${n}</b><p>${d}</p></div><span class="tag ${ok?"completed":""}">${ok?"Connected":"Not connected"}</span></div>`}
function settings(){const tabs=["Profile","Workspace","Assistant memory","Security","API & services","Privacy & data"];let body=S.settingsTab==="Profile"?`<h3>Your profile</h3><p class="muted">Dayflow uses these details to personalize your workspace and assistant responses.</p><form id="profileForm" class="profile-form"><label>Full name<input id="profileName" value="${esc(S.session?.user?.user_metadata?.full_name||S.session?.user?.user_metadata?.name||"")}" maxlength="100" required></label><label>Phone number<input id="profilePhone" type="tel" value="${esc(S.session?.user?.user_metadata?.phone||S.session?.user?.phone||"")}" placeholder="+2348012345678"></label><label>Role or occupation<input id="profileRole" value="${esc(S.session?.user?.user_metadata?.role||"")}" placeholder="e.g. Student, developer, founder"></label><label>Timezone<input id="profileTimezone" value="${esc(S.session?.user?.user_metadata?.timezone||"")}" placeholder="Africa/Lagos"></label><label>What do you mainly use Dayflow for?<textarea id="profileFocus" placeholder="Projects, research, writing, daily planning…">${esc(S.session?.user?.user_metadata?.work_focus||"")}</textarea></label><button class="btn primary" id="saveProfile">Save profile ↗</button></form><div class="setting-row"><div><b>Signed-in account</b><p>${esc(S.session?.user?.email||S.session?.user?.phone||"Not available")}</p></div>${tag("completed")}</div><div class="setting-row"><div><b>Signed-in email</b><p>${esc(S.session?.user?.email||"Not available")}</p></div>${tag("completed")}</div><div class="setting-row"><div><b>Account ID</b><p>${esc(S.session?.user?.id||"")}</p></div><button class="btn secondary" id="copyUserId">Copy ID</button></div><div class="setting-row"><div><b>Sign out</b><p>End this browser session.</p></div><button class="btn secondary" id="settingsSignOut">Sign out</button></div>`:S.settingsTab==="Workspace"?`<h3>Workspace preferences</h3><div class="setting-row"><div><b>Workspace name</b><p>Personal workspace</p></div></div><div class="setting-row"><div><b>Task approvals</b><p>Review consequential actions before they happen.</p></div>${tag("completed")}</div>`:S.settingsTab==="Assistant memory"?`<h3>Assistant memory</h3><p class="muted">Save preferences and project instructions for future work. Never save passwords or API keys.</p><form id="memoryForm"><label>Type<select id="memoryCategory"><option value="preference">Preference</option><option value="instruction">Instruction</option><option value="project">Project context</option><option value="decision">Decision</option></select></label><label>Memory<textarea id="memoryContent" required maxlength="2000"></textarea></label><button class="btn primary">Save memory ↗</button></form>${S.memories.map(m=>`<div class="setting-row"><div><b>${esc(pretty(m.category))}</b><p>${esc(m.content)}</p></div><button class="btn secondary" data-delete-memory="${esc(m.id)}">Delete</button></div>`).join("")||"<p class=\"muted\">No saved memories.</p>"}`:S.settingsTab==="Security"?`<h3>Security</h3><p class="muted">Authentication and session checks are handled by Supabase.</p>${integration("Supabase Auth","Email and password sessions","◈",S.health.authConfigured)}<div class="callout">Configure provider redirects and password policies in your Supabase project.</div>`:S.settingsTab==="API & services"?`<h3>API & service configuration</h3>${integration("Supabase","Authentication","◈",S.health.authConfigured)}${integration("OpenRouter","AI task execution","✦",S.health.aiConfigured)}${integration("Tavily","Web research","⌕",S.health.researchConfigured)}<div class="callout">Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and optional service keys in Vercel environment variables.</div>`:`<h3>Privacy & data</h3><p class="muted">Know where your work lives.</p><div class="setting-row"><div><b>Task storage</b><p>Your tasks are saved to your signed-in Supabase workspace.</p></div>${tag("awaiting_approval")}</div><div class="callout">Keep your sign-in secure and review connected services from time to time.</div>`;return `${heading("settings")}<div class="settings-layout"><nav class="panel settings-tabs">${tabs.map(t=>`<button class="${S.settingsTab===t?"active":""}" data-setting="${t}">${t}</button>`).join("")}</nav><section class="panel settings-content">${body}</section></div>`}
function render(){S.page=names[location.hash.slice(1)]?location.hash.slice(1):"overview";document.querySelectorAll("[data-page]").forEach(a=>a.classList.toggle("active",a.dataset.page===S.page));$("pageCrumb").textContent=names[S.page][0];$("pageContainer").innerHTML=S.page==="overview"?overview():S.page==="tasks"?tasksPage():["projects","workflows","inbox","research","documents","email","browser","analytics","integrations","activity","billing"].includes(S.page)?feature(S.page):settings();wire();updateWelcomeClock()}
function go(p){location.hash="#"+p;render()}
function taskCreateLabel(prompt,mode){
 if(mode==="plan")return "Save plan";
 if(mode==="research")return "Start research";
 if(mode==="document")return "Create document";
 if(mode==="email")return "Create email draft";
 if(mode==="browser")return "Run browser task";
 if(/^create\s+(?:a\s+)?project(?:\s+(?:called|named))?\s*$/i.test(prompt.trim()))return "Create project";
 const named=prompt.match(/\b(?:called|named|titled)\s+([^,.!?\n]+)/i);
 if(named)return "Create "+named[1].trim().slice(0,32);
 const object=prompt.match(/\b(?:create|build|make|develop|launch)\s+(?:a|an|the)?\s*([a-z][a-z0-9 -]{1,24})/i);
 if(object)return "Create "+object[1].trim().split(/\s+(?:for|with|that|to|using)\b/i)[0].slice(0,28);
 return "Create";
}
function updateTaskCreateLabel(){const b=$("createTaskButton");if(b)b.textContent=taskCreateLabel($("taskInstruction").value,$("taskMode").value)+" ↗"}
function openModal(mode="auto",prompt=""){$("taskModal").hidden=false;$("taskMode").value=mode;$("taskInstruction").value=prompt;updateTaskCreateLabel();setTimeout(()=>{$("taskInstruction").focus();updateTaskCreateLabel()},20)}
async function makeTask(instruction,mode){let task=await api("/api/tasks",{method:"POST",body:JSON.stringify({instruction,mode})});if(mode!=="plan"){try{task=await api("/api/tasks/"+encodeURIComponent(task.id)+"/run",{method:"POST",body:JSON.stringify({})});}catch(error){toast("Task saved, but execution failed: "+error.message,"error");}}S.active=task;await loadTasks();$("taskModal").hidden=true;location.hash="#tasks";render();toast(task.status==="awaiting_approval"?"Draft ready. Review it before approving.":task.status==="completed"?"Task completed. Your result is saved.":"Task saved. Review the result and activity.","success")}
function wire(){if(S.page==="projects")$("projectForm")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/projects",{method:"POST",body:JSON.stringify({name:$("projectName").value.trim(),description:$("projectDescription").value.trim()})});await loadProjects();render();toast("Project created.","success")}catch(x){toast(x.message,"error")}});if(S.page==="workflows"){$("workflowForm")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/workflows",{method:"POST",body:JSON.stringify({name:$("workflowName").value.trim(),description:$("workflowDescription").value.trim(),instruction:$("workflowInstruction").value.trim(),mode:$("workflowMode").value})});await loadWorkflows();render();toast("Workflow saved.","success")}catch(x){toast(x.message,"error")}});document.querySelectorAll("[data-run-workflow]").forEach(b=>b.onclick=async()=>{let w=S.workflows.find(x=>x.id===b.dataset.runWorkflow);if(w)try{await makeTask(w.instruction,w.mode)}catch(x){toast(x.message,"error")}});document.querySelectorAll("[data-delete-workflow]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this workflow?"))return;try{await api("/api/workflows/"+b.dataset.deleteWorkflow,{method:"DELETE"});await loadWorkflows();render()}catch(x){toast(x.message,"error")}})}if(S.page==="settings"&&S.settingsTab==="Assistant memory"){$("memoryForm")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/memories",{method:"POST",body:JSON.stringify({category:$("memoryCategory").value,content:$("memoryContent").value.trim()})});await loadMemories();render();toast("Memory saved.","success")}catch(x){toast(x.message,"error")}});document.querySelectorAll("[data-delete-memory]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete saved memory?"))return;try{await api("/api/memories/"+b.dataset.deleteMemory,{method:"DELETE"});await loadMemories();render()}catch(x){toast(x.message,"error")}})}document.querySelectorAll("[data-new-task]").forEach(b=>b.onclick=()=>openModal());document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>openModal(b.dataset.mode));document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));document.querySelectorAll("[data-task]").forEach(el=>{const open=async()=>{try{S.active=await api(`/api/tasks/${encodeURIComponent(el.dataset.task)}`);go("tasks")}catch(e){toast(e.message,"error")}};el.onclick=open;el.onkeydown=e=>{if(e.key==="Enter")open()}});document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{S.filter=b.dataset.filter;render()});document.querySelectorAll("[data-setting]").forEach(b=>b.onclick=()=>{S.settingsTab=b.dataset.setting;render()});document.querySelectorAll("[data-prompt]").forEach(b=>b.onclick=()=>{$("taskInstruction").value=b.dataset.prompt;if(b.dataset.mode)$("taskMode").value=b.dataset.mode;updateTaskCreateLabel()});$("taskInstruction").oninput=updateTaskCreateLabel;$("taskMode").onchange=updateTaskCreateLabel;if(S.page==="tasks")$("taskSearch").oninput=e=>{S.query=e.target.value;let p=e.target.selectionStart;render();$("taskSearch").focus();$("taskSearch").setSelectionRange(p,p)};if(S.page==="research")$("researchStart").onclick=()=>{let q=$("researchPrompt").value.trim();if(q.length<8)return toast("Add more detail to your question.","error");openModal("research",q)};if(S.page==="browser")$("browserStart").onclick=()=>{let q=$("browserPrompt").value.trim();if(q.length<8)return toast("Describe the browser task first.","error");openModal("browser",q)};if(S.page==="email"){$("emailDraftButton").onclick=async()=>{let instruction=$("emailInstruction").value.trim(),to=$("emailTo").value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))return toast("Enter a valid recipient email address.","error");if(instruction.length<8)return toast("Describe the email you want drafted.","error");try{let d=await api("/api/email/draft",{method:"POST",body:JSON.stringify({instruction,to})});$("emailTo").value=d.to||to;$("emailSubject").value=d.subject||"";$("emailBody").value=d.body||"";toast("Draft ready. Review it before sending.","success")}catch(e){toast(e.message,"error")}};$("sendEmail").onclick=async()=>{const to=$("emailTo").value.trim(),subject=$("emailSubject").value.trim(),body=$("emailBody").value.trim();if(!to||!subject||!body)return toast("Recipient, subject and message are required.","error");if(!confirm(`Send this email to ${to}?`))return;const b=$("sendEmail");b.disabled=true;b.textContent="Sending…";try{await api("/api/email/send",{method:"POST",body:JSON.stringify({to,subject,body})});toast("Email sent successfully.","success");$("emailInstruction").value="";$("emailSubject").value="";$("emailBody").value=""}catch(e){toast(e.message,"error")}finally{b.disabled=!S.google.connected;b.textContent="Send email ↗"}};$("copyEmail").onclick=async()=>{try{await navigator.clipboard.writeText(`To: ${$("emailTo").value}\nSubject: ${$("emailSubject").value}\n\n${$("emailBody").value}`);toast("Draft copied.","success")}catch{toast("Clipboard unavailable.","error")}}}if(S.page==="integrations"){
  $("googleConnect")?.addEventListener("click",async()=>{
    const b=$("googleConnect");
    b.disabled=true;
    b.textContent="Connecting…";
    try{
      const result=await api("/api/connectors/google/start",{
        method:"POST",
        body:JSON.stringify({})
      });
      if(!result.authUrl)throw Error("Google authorization URL was not returned.");
      window.location.assign(result.authUrl);
    }catch(e){
      toast(e.message,"error");
      b.disabled=false;
      b.textContent="Connect Google ↗";
    }
  });

  $("googleDisconnect")?.addEventListener("click",async()=>{
    if(!confirm("Disconnect your Google account from Dayflow?"))return;
    try{
      await api("/api/connectors/google/disconnect",{
        method:"POST",
        body:JSON.stringify({})
      });
      await loadGoogleStatus();
      render();
      toast("Google disconnected.","success");
    }catch(e){
      toast(e.message,"error");
    }
  });

  $("googleRefresh")?.addEventListener("click",async()=>{
    await loadGoogleStatus();
    render();
    toast("Google status refreshed.","success");
  });
}if(S.page==="settings"){$("profileForm")?.addEventListener("submit",async e=>{e.preventDefault();const b=$("saveProfile");b.disabled=true;try{const {data,error}=await S.supabase.auth.updateUser({data:{full_name:$("profileName").value.trim(),phone:$("profilePhone").value.trim(),role:$("profileRole").value.trim(),timezone:$("profileTimezone").value.trim(),work_focus:$("profileFocus").value.trim()}});if(error)throw error;S.session={...S.session,user:data.user};$("userName").textContent=data.user.user_metadata.full_name||"Your account";toast("Profile saved.","success");}catch(error){toast(error.message,"error")}finally{b.disabled=false}});$("copyUserId")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(S.session?.user?.id||"");toast("Copied.","success")}catch{toast("Clipboard unavailable.","error")}});$("settingsSignOut")?.addEventListener("click",()=>$("signOutButton").click())}if(S.page==="billing")$("billingInfo").onclick=()=>toast("Payments need a provider, server-side checkout, verified webhooks, and entitlement checks.");wireDetail(S.active)}
function wireDetail(t){if(!t)return;$("runTask")?.addEventListener("click",async()=>{try{if(t.mode==="email"&&t.status==="awaiting_approval"){if(!confirm("Approve and send this email through your connected Google account?"))return;await api("/api/tasks/"+encodeURIComponent(t.id)+"/approve",{method:"POST",body:JSON.stringify({approved:true})})}S.active=await api("/api/tasks/"+encodeURIComponent(t.id)+"/run",{method:"POST",body:JSON.stringify({})});await loadTasks();render();toast(S.active.status==="awaiting_approval"?"Email draft ready for approval.":"Task execution finished.","success")}catch(e){toast(e.message,"error")}});$("downloadDocument")?.addEventListener("click",()=>{const blob=new Blob([t.result?.content||""],{type:"text/markdown;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="DayFlow-document.md";a.click();URL.revokeObjectURL(url)});$("refreshTask")?.addEventListener("click",async()=>{try{S.active=await api("/api/tasks/"+encodeURIComponent(t.id));render()}catch(e){toast(e.message,"error")}})}
$("forgotPasswordButton").onclick=async()=>{let email=$("authEmail").value.trim();if(!email)return $("authMessage").textContent="Enter your email first.";try{if(!S.supabase)throw Error("Authentication is still initializing. Please try again.");let {error}=await S.supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});if(error)throw error;$("authMessage").textContent="If the account exists, reset instructions have been sent."}catch(e){$("authMessage").textContent=e.message}};
$("signOutButton").onclick=async()=>{await S.supabase?.auth.signOut();S.tasks=[];S.active=null;$("appShell").hidden=true;$("authGate").hidden=true;$("landingPage").hidden=false};
$("profileButton").onclick=()=>$("profileMenu").hidden=!$("profileMenu").hidden;
$("mobileMenu").onclick=()=>$("sidebar").classList.add("mobile-open");$("mobileClose").onclick=()=>$("sidebar").classList.remove("mobile-open");
$("helpButton").onclick=()=>toast("Tell Dayflow the outcome you want. It will do the work and save the result.");
$("searchOpen").onclick=()=>{$("searchModal").hidden=false;$("globalSearch").value="";drawSearch("");$("globalSearch").focus()};
document.querySelectorAll("[data-close-modal]").forEach(b=>b.onclick=()=>$("taskModal").hidden=true);document.querySelectorAll("[data-close-search]").forEach(b=>b.onclick=()=>$("searchModal").hidden=true);$("searchModal").onclick=e=>{if(e.target===$("searchModal"))$("searchModal").hidden=true};$("globalSearch").oninput=e=>drawSearch(e.target.value);
function drawSearch(q){let arr=[...Object.entries(names).map(([k,v])=>({key:k,title:v[0],desc:v[1],type:"page"})),...S.tasks.map(t=>({key:t.id,title:t.plan?.[0]?.title||t.instruction,desc:pretty(t.status),type:"task"}))].filter(x=>(x.title+" "+x.desc).toLowerCase().includes(q.toLowerCase())).slice(0,10);$("searchResults").innerHTML=arr.map(x=>`<button class="search-result" data-search-type="${x.type}" data-search-key="${esc(x.key)}">↗ &nbsp; <span><b>${esc(x.title)}</b><br><small>${esc(x.desc)}</small></span></button>`).join("")||'<p class="muted">No results.</p>';document.querySelectorAll("[data-search-key]").forEach(b=>b.onclick=async()=>{$("searchModal").hidden=true;if(b.dataset.searchType==="page")go(b.dataset.searchKey);else{try{S.active=await api(`/api/tasks/${encodeURIComponent(b.dataset.searchKey)}`);go("tasks")}catch(e){toast(e.message,"error")}}})}
$("taskForm").onsubmit=async e=>{e.preventDefault();let q=$("taskInstruction").value.trim(),mode=$("taskMode").value;if(q.length<8)return toast("Add more detail to your goal.","error");let b=$("createTaskButton");b.disabled=true;b.textContent="Working…";try{await makeTask(q,mode)}catch(err){toast(err.message,"error")}finally{b.disabled=false;updateTaskCreateLabel()}};
document.addEventListener("click",e=>{let l=e.target.closest("[data-page-link]");if(l)go(l.dataset.pageLink)});
document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("searchModal").hidden? $("searchOpen").click():$("searchModal").hidden=true}if(e.key==="Escape"){$("searchModal").hidden=true;$("taskModal").hidden=true;$("sidebar").classList.remove("mobile-open")}});
window.addEventListener("hashchange",render);setInterval(updateWelcomeClock,30000);

/* Landing, phone OTP and onboarding profile */
S.authChannel="email";S.phoneOtpSent=false;
function syncAuthForm(){
 const phone=S.authChannel==="phone",signup=S.authMode==="signup";
 $("emailAuthTab").classList.toggle("active",!phone);$("phoneAuthTab").classList.toggle("active",phone);
 $("authNameWrap").hidden=!(signup||phone);$("authRoleWrap").hidden=!(signup||phone);$("authTimezoneWrap").hidden=!(signup||phone);$("authProfilePhoneWrap").hidden=!(signup&&!phone);
 $("authEmailWrap").hidden=phone;$("authPasswordWrap").hidden=phone;$("authPhoneWrap").hidden=!phone;$("authOtpWrap").hidden=!phone||!S.phoneOtpSent;
 $("forgotPasswordButton").hidden=phone||signup;
 $("authSubmit").textContent=phone?(S.phoneOtpSent?"Verify code & continue":"Send SMS code ↗"):(signup?"Create account ↗":"Sign in ↗");
 $("authTitle").textContent=phone?"Continue with your phone":(signup?"Create your account":"Welcome back");
 $("authSubtitle").textContent=phone?"We’ll send a one-time code to verify your number.":(signup?"Set up your personal Dayflow workspace.":"Sign in to continue where your ideas left off.");
}
function showAuth(mode="signin"){S.authMode=mode;S.authChannel="email";S.phoneOtpSent=false;$("landingPage").hidden=true;$("authGate").hidden=false;$("appShell").hidden=true;syncAuthForm();$("authModeButton").textContent=mode==="signup"?"Sign in instead":"Create an account";$("switchText").textContent=mode==="signup"?"Already have an account?":"New to Dayflow?";}
window.addEventListener("dayflow:open-auth",event=>showAuth(event.detail?.mode==="signup"?"signup":"signin"));
$("emailAuthTab").onclick=()=>{S.authChannel="email";S.phoneOtpSent=false;syncAuthForm()};
$("phoneAuthTab").onclick=()=>{S.authChannel="phone";S.phoneOtpSent=false;syncAuthForm()};
$("authModeButton").onclick=()=>{S.authMode=S.authMode==="signin"?"signup":"signin";S.phoneOtpSent=false;syncAuthForm();$("authModeButton").textContent=S.authMode==="signup"?"Sign in instead":"Create an account";$("switchText").textContent=S.authMode==="signup"?"Already have an account?":"New to Dayflow?";};
$("authForm").onsubmit=async e=>{
 e.preventDefault();if(!S.supabase)return $("authMessage").textContent="Supabase isn't ready yet.";
 const profile={full_name:$("authName").value.trim(),role:$("authRole").value,timezone:$("authTimezone").value.trim(),phone:S.authChannel==="phone"?$("authPhone").value.trim():$("authProfilePhone").value.trim()};
 const submit=$("authSubmit");submit.disabled=true;
 try{
  if(S.authChannel==="phone"){
   const phone=$("authPhone").value.trim();
   if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error("Enter your number in international format, e.g. +2348012345678.");
   if(!S.phoneOtpSent){
    const isSignup=S.authMode==="signup";
    if(isSignup&&!profile.full_name)throw Error("Please enter your full name.");
    const options={shouldCreateUser:isSignup};
    if(isSignup)options.data=profile;
    const {error}=await S.supabase.auth.signInWithOtp({phone,options});
    if(error)throw error;
    S.phoneOtpSent=true;syncAuthForm();$("authMessage").textContent="SMS code sent. Enter it here to finish signing in.";return;
   }
   const token=$("authOtp").value.trim();if(!token)throw Error("Enter the SMS verification code.");
   const {data,error}=await S.supabase.auth.verifyOtp({phone,token,type:"sms"});if(error)throw error;
   if(!data.session)throw Error("Phone verification succeeded but no session was returned. Please try signing in again.");
   await enter(data.session);return;
  }
  const email=$("authEmail").value.trim(),password=$("authPassword").value;let result;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("Enter a valid email address.");
  if(!password)throw Error("Enter your password.");
  if(S.authMode==="signup"){
   if(!profile.full_name)throw Error("Please enter your full name.");
   if(password.length<8)throw Error("Use a password with at least 8 characters.");
   result=await S.supabase.auth.signUp({email,password,options:{data:profile}});
  }else result=await S.supabase.auth.signInWithPassword({email,password});
  if(result.error)throw result.error;
  if(result.data.session)await enter(result.data.session);else if(S.authMode==="signup")$("authMessage").textContent="Account created. Check your email to confirm, then sign in.";else throw Error("Supabase did not return a sign-in session. Check your email confirmation status and try again.");
 }catch(error){
  const details=String(error?.message||"");
  if(S.authChannel==="phone"&&(error?.code==="sms_send_failed"||details.includes("Invalid From Number")||details.includes("21212"))){
   $("authMessage").textContent="DayFlow couldn't send the SMS because the Supabase/Twilio sender configuration is invalid. The app request is reaching Supabase; the SMS sender must be corrected in Supabase Auth settings.";
  }else{
   $("authMessage").textContent=details||"Authentication failed. Please try again.";
  }
 }finally{submit.disabled=false;}
};
document.querySelectorAll("[data-provider]").forEach(b=>b.onclick=async()=>{
 try{
  // Always return OAuth users to the canonical production domain, not a Vercel preview alias.
  const redirectTo="https://dayflow-six-lilac.vercel.app/";
  const {error}=await S.supabase.auth.signInWithOAuth({
   provider:b.dataset.provider,
   options:{redirectTo}
  });
  if(error)throw error;
 }catch(error){
  $("authMessage").textContent=error.message+" Confirm the production URL is in Supabase Authentication > URL Configuration > Redirect URLs.";
 }
});
syncAuthForm();
window.__dayflowAuthReady=true;

loadConfig();
