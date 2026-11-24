import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { requireUser, createUserDb } from "./auth.js";
import { uploadGoogleDriveFile } from "./google-oauth.js";

const router = Router();
const dbFor = req => createUserDb(req.accessToken);
const admin = () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Team administration is not configured.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
};
const fail = result => { if (result.error) throw new Error(result.error.message); return result.data; };

router.get("/notifications", requireUser, async (req,res) => {
  try {
    const rows = fail(await dbFor(req).from("notifications").select("id,title,message,kind,read_at,created_at,task_id").eq("user_id",req.user.id).order("created_at",{ascending:false}).limit(60));
    res.json(rows || []);
  } catch (e) { res.status(500).json({error:"Could not load notifications."}); }
});
router.post("/notifications/read-all", requireUser, async (req,res) => {
  try {
    fail(await dbFor(req).from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",req.user.id).is("read_at",null));
    res.json({updated:true});
  } catch { res.status(500).json({error:"Could not update notifications."}); }
});
router.post("/notifications/:id/read", requireUser, async (req,res) => {
  try {
    const row=fail(await dbFor(req).from("notifications").update({read_at:new Date().toISOString()}).eq("id",req.params.id).eq("user_id",req.user.id).select("id").maybeSingle());
    if(!row)return res.status(404).json({error:"Notification not found."});
    res.json({updated:true});
  } catch { res.status(500).json({error:"Could not update notification."}); }
});

router.get("/onboarding", requireUser, async (req,res) => {
  try {
    const row=fail(await dbFor(req).from("dayflow_onboarding").select("completed_at,dismissed_at").eq("user_id",req.user.id).maybeSingle());
    res.json(row || {completed_at:null,dismissed_at:null});
  } catch { res.status(500).json({error:"Could not load onboarding status."}); }
});
router.post("/onboarding", requireUser, async (req,res) => {
  const done=z.object({completed:z.boolean().default(false),dismissed:z.boolean().default(false)}).safeParse(req.body);
  if(!done.success)return res.status(400).json({error:"Invalid onboarding update."});
  try {
    const now=new Date().toISOString();
    const row=fail(await dbFor(req).from("dayflow_onboarding").upsert({user_id:req.user.id,completed_at:done.data.completed?now:null,dismissed_at:done.data.dismissed?now:null,updated_at:now}).select("completed_at,dismissed_at").single());
    res.json(row);
  } catch { res.status(500).json({error:"Could not save onboarding status."}); }
});

router.post("/tasks/:id/cancel", requireUser, async (req,res) => {
  try {
    const db=dbFor(req);
    const current=fail(await db.from("tasks").select("id,status,mode").eq("id",req.params.id).eq("created_by",req.user.id).maybeSingle());
    if(!current)return res.status(404).json({error:"Task not found."});
    if(!["planned","failed","awaiting_approval"].includes(current.status))return res.status(409).json({error:"Only tasks that have not started or are awaiting approval can be cancelled safely."});
    const updated=fail(await db.from("tasks").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",current.id).eq("status",current.status).select("id,status").maybeSingle());
    if(!updated)return res.status(409).json({error:"Task status changed. Refresh and try again."});
    fail(await db.from("task_events").insert({task_id:current.id,actor_id:req.user.id,event_type:"warning",message:"Task cancelled by the user.",metadata:{}}));
    res.json(updated);
  } catch { res.status(500).json({error:"Could not cancel this task."}); }
});
router.post("/tasks/:id/retry", requireUser, async (req,res) => {
  try {
    const db=dbFor(req);
    const current=fail(await db.from("tasks").select("id,status,mode").eq("id",req.params.id).eq("created_by",req.user.id).maybeSingle());
    if(!current)return res.status(404).json({error:"Task not found."});
    if(current.mode==="email")return res.status(409).json({error:"Email tasks cannot be automatically retried because the previous send outcome may be uncertain. Review the task and create a new draft instead."});
    if(!["failed","cancelled"].includes(current.status))return res.status(409).json({error:"Only failed or cancelled tasks can be retried."});
    const updated=fail(await db.from("tasks").update({status:"planned",result:null,approval:{required:false,approved:false,reason:""},updated_at:new Date().toISOString()}).eq("id",current.id).eq("status",current.status).select("id,status").maybeSingle());
    if(!updated)return res.status(409).json({error:"Task status changed. Refresh and try again."});
    fail(await db.from("task_events").insert({task_id:current.id,actor_id:req.user.id,event_type:"info",message:"Task queued for a fresh attempt.",metadata:{}}));
    res.json(updated);
  } catch { res.status(500).json({error:"Could not retry this task."}); }
});

router.get("/workspaces", requireUser, async (req,res) => {
  try {
    const rows=fail(await dbFor(req).from("workspace_members").select("workspace_id,role,workspaces(id,name,owner_id,created_at)").eq("user_id",req.user.id));
    res.json((rows||[]).map(r=>({...r.workspaces,role:r.role})));
  } catch { res.status(500).json({error:"Could not load workspaces."}); }
});
router.post("/workspaces", requireUser, async (req,res) => {
  const parsed=z.object({name:z.string().trim().min(2).max(80)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Workspace name must be 2–80 characters."});
  try {
    const db=admin();
    const ws=fail(await db.from("workspaces").insert({name:parsed.data.name,owner_id:req.user.id}).select("id,name,owner_id,created_at").single());
    fail(await db.from("workspace_members").insert({workspace_id:ws.id,user_id:req.user.id,role:"owner"}));
    res.status(201).json({...ws,role:"owner"});
  } catch { res.status(500).json({error:"Could not create a team workspace. Check server service-role configuration."}); }
});
router.post("/workspaces/:id/invitations", requireUser, async (req,res) => {
  const parsed=z.object({email:z.string().trim().email().max(254),role:z.enum(["admin","member"]).default("member")}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a valid email and role."});
  try {
    const service=admin();
    const membership=fail(await service.from("workspace_members").select("role").eq("workspace_id",req.params.id).eq("user_id",req.user.id).maybeSingle());
    if(!membership||!["owner","admin"].includes(membership.role))return res.status(403).json({error:"Only workspace owners and admins can invite members."});
    const token=randomBytes(32).toString("base64url"), tokenHash=createHash("sha256").update(token).digest("hex");
    const invite=fail(await service.from("workspace_invitations").insert({workspace_id:req.params.id,invited_email:parsed.data.email.toLowerCase(),role:parsed.data.role,token_hash:tokenHash,invited_by:req.user.id,expires_at:new Date(Date.now()+7*86400000).toISOString()}).select("id,expires_at").single());
    const base=(process.env.APP_URL||"https://dayflow-six-lilac.vercel.app").replace(/\/$/,"");
    res.status(201).json({...invite,inviteUrl:base+"/?invite="+encodeURIComponent(token)});
  } catch { res.status(500).json({error:"Could not create the invitation."}); }
});
router.post("/invitations/accept", requireUser, async (req,res) => {
  const parsed=z.object({token:z.string().min(20).max(200)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid invitation."});
  try {
    const service=admin(), hash=createHash("sha256").update(parsed.data.token).digest("hex"), now=new Date().toISOString();
    const invite=fail(await service.from("workspace_invitations").select("id,workspace_id,invited_email,role").eq("token_hash",hash).is("accepted_at",null).gt("expires_at",now).maybeSingle());
    if(!invite)return res.status(404).json({error:"Invitation is invalid, expired, or already used."});
    if(String(req.user.email||"").toLowerCase()!==invite.invited_email)return res.status(403).json({error:"Sign in with the email address that received this invitation."});
    fail(await service.from("workspace_members").upsert({workspace_id:invite.workspace_id,user_id:req.user.id,role:invite.role},{onConflict:"workspace_id,user_id"}));
    fail(await service.from("workspace_invitations").update({accepted_at:now}).eq("id",invite.id).is("accepted_at",null));
    res.json({accepted:true,workspaceId:invite.workspace_id});
  } catch { res.status(500).json({error:"Could not accept this invitation."}); }
});

router.post("/connectors/google/drive/upload", requireUser, async (req,res) => {
  const parsed=z.object({name:z.string().trim().min(1).max(180),mimeType:z.string().trim().max(120).default("text/markdown"),content:z.string().min(1).max(500000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Provide a file name and non-empty content (maximum 500 KB)."});
  try { res.json(await uploadGoogleDriveFile(req.user.id,parsed.data)); }
  catch(e) { res.status(502).json({error:e.message||"Google Drive upload failed."}); }
});

export default router;
