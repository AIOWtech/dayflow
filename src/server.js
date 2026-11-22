
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  createAuthClient,
  createUserDb,
  requireUser
} from "./lib/auth.js";
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  addEvent
} from "./lib/supabase-store.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 120,
  validate: { forwardedHeader: false },
  standardHeaders: "draft-8",
  legacyHeaders: false
}));
import {
  createGoogleAuthorization,
  completeGoogleAuthorization,
  getGoogleConnection,
  disconnectGoogle,
  sendGoogleEmail,
} from "./lib/google-oauth.js";
import { executeTask } from "./lib/executor.js";
import { listProjects, createProject, listMemories, createMemory, deleteMemory, listWorkflows, createWorkflow, deleteWorkflow } from "./lib/workspace-intelligence.js";

app.locals.supabase = createAuthClient();

function userDb(req) {
  return createUserDb(req.accessToken);
}

const TaskInput = z.object({
  instruction: z.string().trim().min(8).max(4000),
  mode: z.enum([
    "auto",
    "plan",
    "document",
    "email",
    "browser",
    "research"
  ]).default("auto")
});

const EmailDraftInput = z.object({
  instruction: z.string().trim().min(8).max(4000),
  to: z.string().trim().email().max(254)
});

const EmailSendInput = z.object({
  to: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(250),
  body: z.string().trim().min(1).max(20000)
});

app.get("/api/config", (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabasePublishableKey:
      process.env.SUPABASE_PUBLISHABLE_KEY || "",
    authConfigured: Boolean(
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_PUBLISHABLE_KEY
    ),
    appName: "Dayflow"
  });
});

app.get("/api/health", (_req, res) => {
  const configured = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY
  );

  res.json({
    ok: true,
    authConfigured: configured,
    aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    researchConfigured: Boolean(process.env.TAVILY_API_KEY),
    browserConfigured: Boolean(
      process.env.BROWSERBASE_API_KEY &&
      process.env.BROWSERBASE_PROJECT_ID
    ),
    googleOAuthConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET
    ),
    persistence: configured ? "supabase" : "not-configured",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/me", requireUser, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    createdAt: req.user.created_at,
    role: req.user.role || "authenticated"
  });
});

app.get("/api/tasks", requireUser, async (req, res) => {
  try {
    const tasks = await listTasks(userDb(req), req.user.id);
    res.json(tasks);
  } catch (error) {
    console.error("Load tasks:", error.message);
    res.status(500).json({
      error: "Could not load tasks from your workspace."
    });
  }
});

app.post("/api/tasks", requireUser, async (req, res) => {
  const parsed = TaskInput.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || "Invalid task."
    });
  }

  try {
    const db = userDb(req);

    let task = await createTask(
      db,
      req.user.id,
      parsed.data
    );

    if (parsed.data.mode === "plan" && process.env.OPENROUTER_API_KEY) {
      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer":
                process.env.APP_URL || "http://localhost:3000",
              "X-Title": "Dayflow"
            },
            body: JSON.stringify({
              model:
                process.env.OPENROUTER_MODEL ||
                "openai/gpt-4.1-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are Dayflow, a careful productivity planner. " +
                    "Return ONLY JSON with summary and steps. " +
                    "Steps must contain title and description. " +
                    "Give 3-7 concrete steps. Never claim to have " +
                    "performed external actions."
                },
                {
                  role: "user",
                  content:
                    `Mode: ${parsed.data.mode}\n` +
                    `Goal: ${parsed.data.instruction}`
                }
              ],
              response_format: { type: "json_object" },
              temperature: 0.3
            })
          }
        );

        if (!response.ok) {
          throw new Error(`AI provider returned ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        const plan = JSON.parse(content || "{}");

        if (!Array.isArray(plan.steps) || !plan.steps.length) {
          throw new Error("AI returned an invalid plan.");
        }

        task = await updateTask(
          db,
          req.user.id,
          task.id,
          (current) => {
            current.plan = plan.steps.slice(0, 8).map(step => ({
              title: String(step.title || "Next step").slice(0, 160),
              description:
                String(step.description || "").slice(0, 800)
            }));

            current.internalPlan = {
              summary: String(
                plan.summary || "Plan generated."
              ).slice(0, 1500)
            };

            current.status = "planned";
            addEvent(current, "success", "AI plan generated.");
          }
        );
      } catch (error) {
        console.error("AI planning:", error.message);

        task = await updateTask(
          db,
          req.user.id,
          task.id,
          current => addEvent(
            current,
            "error",
            "AI planning was unavailable; the starter plan was saved."
          )
        );
      }
    }

    res.status(201).json(task);
  } catch (error) {
    console.error("Create task:", error.message);
    res.status(500).json({
      error: "Could not save your task. Check your database configuration."
    });
  }
});

app.get("/api/tasks/:id", requireUser, async (req, res) => {
  try {
    const task = await getTask(
      userDb(req),
      req.user.id,
      req.params.id
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    res.json(task);
  } catch (error) {
    console.error("Get task:", error.message);
    res.status(500).json({
      error: "Could not load this task."
    });
  }
});

app.post(
  "/api/tasks/:id/approve",
  requireUser,
  async (req, res) => {
    if (req.body?.approved !== true) {
      return res.status(400).json({
        error: "Explicit approval is required."
      });
    }

    try {
      const task = await updateTask(
        userDb(req),
        req.user.id,
        req.params.id,
        current => {
          current.approval = {
            required: false,
            approved: true,
            reason: "User approved the task."
          };

          addEvent(
            current,
            "success",
            "User approved the task."
          );
        }
      );

      if (!task) {
        return res.status(404).json({
          error: "Task not found."
        });
      }

      res.json(task);
    } catch (error) {
      console.error("Approve task:", error.message);
      res.status(500).json({
        error: "Could not save task approval."
      });
    }
  }
);

app.post("/api/tasks/:id/run", requireUser, async (req, res) => {
  const db = userDb(req);
  try {
    let task = await getTask(db, req.user.id, req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found." });

    if (task.mode === "email" && task.status === "awaiting_approval" && !task.approval?.approved) {
      return res.status(409).json({ error: "Review and approve this email before sending." });
    }

    if (task.mode === "email" && task.status === "awaiting_approval" && task.approval?.approved && task.result?.kind === "email") {
      const claim = await db
        .from("tasks")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", task.id)
        .eq("created_by", req.user.id)
        .eq("status", "awaiting_approval")
        .select("id")
        .maybeSingle();
      if (claim.error) throw new Error("Could not reserve this email for sending.");
      if (!claim.data) return res.status(409).json({ error: "This email is already being processed or has already been sent." });

      const sent = await sendGoogleEmail(req.user.id, {
        to: task.result.to,
        subject: task.result.subject,
        body: task.result.body
      });
      task = await updateTask(db, req.user.id, task.id, current => {
        current.status = "completed";
        current.result = {
          ...current.result,
          summary: "Email sent successfully.",
          sentAt: new Date().toISOString(),
          messageId: sent.messageId
        };
        addEvent(current, "success", "Approved email sent through Gmail.");
      });
      return res.json(task);
    }

    if (task.status === "completed") return res.json(task);

    task = await updateTask(db, req.user.id, task.id, current => {
      current.status = "running";
      addEvent(current, "info", "Execution started.");
    });

    const output = await executeTask(task);
    task = await updateTask(db, req.user.id, task.id, current => {
      current.status = output.status;
      if (output.mode) current.mode = output.mode;
      if (output.plan) current.plan = output.plan;
      if (output.internalPlan) current.internalPlan = output.internalPlan;
      if (output.approval) current.approval = output.approval;
      if (output.result) current.result = output.result;
      addEvent(
        current,
        output.status === "awaiting_approval" ? "info" : "success",
        output.status === "awaiting_approval"
          ? "Draft is ready and waiting for your approval."
          : "Task execution completed."
      );
    });
    return res.json(task);
  } catch (error) {
    console.error("Task execution:", error.message);
    try {
      const failed = await updateTask(db, req.user.id, req.params.id, current => {
        current.status = "failed";
        addEvent(current, "error", error.message.slice(0, 500));
      });
      if (failed) return res.status(502).json({ error: error.message, task: failed });
    } catch (saveError) {
      console.error("Could not persist execution failure:", saveError.message);
    }
    return res.status(502).json({ error: error.message || "Task execution failed." });
  }
});

app.post("/api/email/draft", requireUser, async (req, res) => {
  const parsed = EmailDraftInput.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error:
        parsed.error.issues[0]?.message || "Invalid instruction."
    });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({
      error: "AI drafting is not configured."
    });
  }

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model:
            process.env.OPENROUTER_MODEL ||
            "openai/gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "Draft a helpful professional email. Return only JSON " +
                "with subject and body strings. Do not send it."
            },
            {
              role: "user",
              content: `Recipient: ${parsed.data.to}\n\nEmail request: ${parsed.data.instruction}`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.4
        })
      }
    );

    if (!response.ok) {
      throw new Error("AI provider request failed.");
    }

    const data = await response.json();
    const draft = JSON.parse(
      data.choices?.[0]?.message?.content || "{}"
    );

    res.json({
      to: parsed.data.to,
      subject: String(draft.subject || "").slice(0, 250),
      body: String(draft.body || "").slice(0, 20000),
      sendEnabled: true
    });
  } catch (error) {
    console.error("Email draft:", error.message);
    res.status(502).json({
      error: "Couldn't generate a draft. Check the AI configuration."
    });
  }
});


app.post("/api/email/send", requireUser, async (req, res) => {
  const parsed = EmailSendInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || "Enter a valid recipient, subject and message."
    });
  }
  try {
    const sent = await sendGoogleEmail(req.user.id, parsed.data);
    return res.json({ sent: true, messageId: sent.messageId });
  } catch (error) {
    console.error("Email send:", error.message);
    return res.status(502).json({ error: error.message || "Gmail could not send this email." });
  }
});

app.get(
  "/api/connectors/google/status",
  requireUser,
  async (req, res) => {
    try {
      const connection = await getGoogleConnection(req.user.id);

      res.json({
        configured: true,
        ...connection
      });
    } catch (error) {
      console.error("Google status:", error.message);
      res.status(503).json({
        configured: false,
        connected: false,
        error: "Google connection status is unavailable."
      });
    }
  }
);

app.post(
  "/api/connectors/google/start",
  requireUser,
  async (req, res) => {
    try {
      const authUrl = await createGoogleAuthorization(req.user.id);
      res.json({ authUrl });
    } catch (error) {
      console.error("Google OAuth start:", error.message);
      res.status(503).json({
        error: "Could not start Google authorization. Check server configuration."
      });
    }
  }
);

app.get("/api/connectors/google/callback", async (req, res) => {
  const appUrl = process.env.APP_URL || "https://dayflow-six-lilac.vercel.app";

  if (req.query.error) {
    return res.redirect(
      302,
      `${appUrl}/?google=error#integrations`
    );
  }

  try {
    await completeGoogleAuthorization(
      String(req.query.code || ""),
      String(req.query.state || "")
    );

    return res.redirect(
      302,
      `${appUrl}/?google=connected#integrations`
    );
  } catch (error) {
    console.error("Google OAuth callback:", error.message);

    return res.redirect(
      302,
      `${appUrl}/?google=error#integrations`
    );
  }
});

app.post(
  "/api/connectors/google/disconnect",
  requireUser,
  async (req, res) => {
    try {
      await disconnectGoogle(req.user.id);
      res.json({ disconnected: true });
    } catch (error) {
      console.error("Google disconnect:", error.message);
      res.status(500).json({
        error: "Could not disconnect Google."
      });
    }
  }
);



const ProjectInput = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000).optional() });
const MemoryInput = z.object({ category: z.enum(["preference","instruction","project","decision"]).default("preference"), content: z.string().trim().min(1).max(2000) });
const WorkflowInput = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional(), instruction: z.string().trim().min(8).max(4000), mode: z.enum(["auto","plan","research","document","email","browser"]).default("auto") });

app.get("/api/projects", requireUser, async (req,res) => {
 try { res.json(await listProjects(userDb(req),req.user.id)); }
 catch(error) { console.error("List projects:",error.message); res.status(500).json({error:"Could not load projects."}); }
});
app.post("/api/projects", requireUser, async (req,res) => {
 const parsed=ProjectInput.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message||"Invalid project."});
 try { res.status(201).json(await createProject(userDb(req),req.user.id,parsed.data)); }
 catch(error) { console.error("Create project:",error.message); res.status(500).json({error:"Could not create project. Check that migration 001 is installed."}); }
});
app.get("/api/memories", requireUser, async (req,res) => {
 try { res.json(await listMemories(userDb(req))); }
 catch(error) { console.error("List memories:",error.message); res.status(500).json({error:"Could not load saved memory. Apply migration 003."}); }
});
app.post("/api/memories", requireUser, async (req,res) => {
 const parsed=MemoryInput.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message||"Invalid memory."});
 try { res.status(201).json(await createMemory(userDb(req),req.user.id,parsed.data)); }
 catch(error) { console.error("Create memory:",error.message); res.status(500).json({error:"Could not save memory. Apply migration 003."}); }
});
app.delete("/api/memories/:id", requireUser, async (req,res) => {
 try { const removed=await deleteMemory(userDb(req),req.params.id); if(!removed)return res.status(404).json({error:"Memory not found."}); res.json({deleted:true}); }
 catch(error) { console.error("Delete memory:",error.message); res.status(500).json({error:"Could not delete memory."}); }
});
app.get("/api/workflows", requireUser, async (req,res) => {
 try { res.json(await listWorkflows(userDb(req))); }
 catch(error) { console.error("List workflows:",error.message); res.status(500).json({error:"Could not load workflows. Apply migration 003."}); }
});
app.post("/api/workflows", requireUser, async (req,res) => {
 const parsed=WorkflowInput.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message||"Invalid workflow."});
 try { res.status(201).json(await createWorkflow(userDb(req),req.user.id,parsed.data)); }
 catch(error) { console.error("Create workflow:",error.message); res.status(500).json({error:"Could not save workflow. Apply migration 003."}); }
});
app.delete("/api/workflows/:id", requireUser, async (req,res) => {
 try { const removed=await deleteWorkflow(userDb(req),req.params.id); if(!removed)return res.status(404).json({error:"Workflow not found."}); res.json({deleted:true}); }
 catch(error) { console.error("Delete workflow:",error.message); res.status(500).json({error:"Could not delete workflow."}); }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

app.use(express.static("public"));

app.get("*path", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();

  res.sendFile("index.html", { root: "public" });
});

app.use((err, _req, res, _next) => {
  console.error("Request error:", err?.message || "unknown");
  res.status(500).json({
    error: "Unexpected server error. Check server logs."
  });
});

if (
  process.env.NODE_ENV !== "production" &&
  process.env.SESSION_SECRET &&
  process.env.SESSION_SECRET.length < 32
) {
  console.warn("SESSION_SECRET should be at least 32 characters.");
}

export default app;
