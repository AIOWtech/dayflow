function fail(result){if(result.error)throw new Error(result.error.message);return result.data}
async function workspaceId(db,userId){
 const preference=fail(await db.from("dayflow_onboarding").select("active_workspace_id").eq("user_id",userId).maybeSingle());
 if(preference?.active_workspace_id){const active=fail(await db.from("workspace_members").select("workspace_id").eq("workspace_id",preference.active_workspace_id).eq("user_id",userId).maybeSingle());if(active?.workspace_id)return active.workspace_id;}
 const found=fail(await db.from("workspace_members").select("workspace_id").eq("user_id",userId).limit(1));
 if(found?.length)return found[0].workspace_id;
 const created=fail(await db.from("workspaces").insert({name:"Personal workspace",owner_id:userId}).select("id").single());
 fail(await db.from("workspace_members").insert({workspace_id:created.id,user_id:userId,role:"owner"}));
 return created.id;
}
export async function listProjects(db,userId){const wid=await workspaceId(db,userId);return fail(await db.from("projects").select("id,name,description,status,due_at,created_at,updated_at").eq("workspace_id",wid).order("updated_at",{ascending:false}))||[]}
export async function createProject(db,userId,input){const wid=await workspaceId(db,userId);return fail(await db.from("projects").insert({workspace_id:wid,created_by:userId,name:input.name,description:input.description||"",status:"active"}).select("*").single())}
export async function listMemories(db){return fail(await db.from("workspace_memories").select("id,category,content,created_at,updated_at").order("updated_at",{ascending:false}))||[]}
export async function createMemory(db,userId,input){const wid=await workspaceId(db,userId);return fail(await db.from("workspace_memories").insert({user_id:userId,workspace_id:wid,category:input.category,content:input.content}).select("*").single())}
export async function deleteMemory(db,id){return fail(await db.from("workspace_memories").delete().eq("id",id).select("id").maybeSingle())}
export async function listWorkflows(db){return fail(await db.from("workflow_templates").select("id,name,description,instruction,mode,created_at,updated_at").order("updated_at",{ascending:false}))||[]}
export async function createWorkflow(db,userId,input){const wid=await workspaceId(db,userId);return fail(await db.from("workflow_templates").insert({created_by:userId,workspace_id:wid,name:input.name,description:input.description||"",instruction:input.instruction,mode:input.mode||"auto"}).select("*").single())}
export async function deleteWorkflow(db,id){return fail(await db.from("workflow_templates").delete().eq("id",id).select("id").maybeSingle())}
