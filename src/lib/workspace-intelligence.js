function fail(result){if(result.error)throw new Error(result.error.message);return result.data}
export async function listProjects(db){return fail(await db.from("projects").select("id,name,description,status,due_at,created_at,updated_at").order("updated_at",{ascending:false}))||[]}
export async function createProject(db,userId,input){return fail(await db.from("projects").insert({created_by:userId,name:input.name,description:input.description||"",status:"active"}).select("*").single())}
export async function listMemories(db){return fail(await db.from("workspace_memories").select("id,category,content,created_at,updated_at").order("updated_at",{ascending:false}))||[]}
export async function createMemory(db,userId,input){return fail(await db.from("workspace_memories").insert({user_id:userId,workspace_id:input.workspaceId,category:input.category,content:input.content}).select("*").single())}
export async function deleteMemory(db,id){return fail(await db.from("workspace_memories").delete().eq("id",id).select("id").maybeSingle())}
export async function listWorkflows(db){return fail(await db.from("workflow_templates").select("id,name,description,instruction,mode,created_at,updated_at").order("updated_at",{ascending:false}))||[]}
export async function createWorkflow(db,userId,input){return fail(await db.from("workflow_templates").insert({created_by:userId,workspace_id:input.workspaceId,name:input.name,description:input.description||"",instruction:input.instruction,mode:input.mode||"auto"}).select("*").single())}
export async function deleteWorkflow(db,id){return fail(await db.from("workflow_templates").delete().eq("id",id).select("id").maybeSingle())}
