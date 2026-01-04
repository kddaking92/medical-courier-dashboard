"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Owner = "Co-Owner A (Ops/Compliance)" | "Co-Owner B (Sales/Finance)";
type Status = "Pending" | "In Progress" | "Completed";

type WeekRow = {
  week_number: number;
  title: string;
  objectives: string[];
  deliverables: string[];
  kpis: string[];
  risks: string[];
};

type TaskRow = {
  id: string;
  week_number: number;
  owner: Owner;
  description: string;
  status: Status;
  created_at?: string;
  updated_at?: string;
};

type TaskNoteRow = {
  id: string;
  task_id: string;
  owner: Owner;
  note: string;
  updated_at: string;
};

function fmtDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

const OWNER_A: Owner = "Co-Owner A (Ops/Compliance)";
const OWNER_B: Owner = "Co-Owner B (Sales/Finance)";
const ALL_OWNERS: Owner[] = [OWNER_A, OWNER_B];

export default function DashboardPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string>("");

  const [newOwner, setNewOwner] = useState<Owner>(OWNER_A);
  const [newDesc, setNewDesc] = useState<string>("");

  // Notes state:
  // notesByTask[taskId][owner] = { note, updated_at }
  const [notesByTask, setNotesByTask] = useState<
    Record<string, Record<string, { note: string; updated_at?: string; id?: string }>>
  >({});

  // Draft notes for typing (autosave reads from this)
  const [draftByTask, setDraftByTask] = useState<Record<string, Record<string, string>>>({});

  // For realtime filtering
  const taskIdSetRef = useRef<Set<string>>(new Set());

  // Autosave debounce timers and in-flight tracker
  const autosaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const autosaveInFlightRef = useRef<Set<string>>(new Set());

  // Optional: show "Saving..." per task+owner
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

  const makeKey = (taskId: string, owner: Owner) => `${taskId}::${owner}`;
  const setSaving = (key: string, val: boolean) => {
    setSavingKeys((prev) => ({ ...prev, [key]: val }));
  };

  // ---------- AUTH GATE ----------
  useEffect(() => {
    let cancelled = false;

    const requireAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.error(error);

      const session = data.session;
      if (!session) {
        window.location.assign("/login");
        return;
      }

      if (!cancelled) {
        setUserEmail(session.user.email ?? "");
        setAuthChecked(true);
      }
    };

    requireAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) window.location.assign("/login");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---------- LOADERS ----------
  const loadWeeks = async () => {
    setErrorMsg("");
    setLoadingWeeks(true);

    const { data, error } = await supabase
      .from("weeks")
      .select("week_number,title,objectives,deliverables,kpis,risks")
      .order("week_number", { ascending: true });

    setLoadingWeeks(false);

    if (error) {
      console.error(error);
      setErrorMsg(`Failed to load weeks: ${error.message}`);
      return;
    }

    const safeWeeks: WeekRow[] = (data ?? []).map((w: any) => ({
      week_number: w.week_number,
      title: w.title ?? "",
      objectives: Array.isArray(w.objectives) ? w.objectives : [],
      deliverables: Array.isArray(w.deliverables) ? w.deliverables : [],
      kpis: Array.isArray(w.kpis) ? w.kpis : [],
      risks: Array.isArray(w.risks) ? w.risks : [],
    }));

    setWeeks(safeWeeks);

    if (safeWeeks.length > 0 && !safeWeeks.some((x) => x.week_number === selectedWeek)) {
      setSelectedWeek(safeWeeks[0].week_number);
    }
  };

  const loadNotesForTasks = async (taskIds: string[]) => {
    setErrorMsg("");

    if (taskIds.length === 0) {
      setNotesByTask({});
      setDraftByTask({});
      return;
    }

    const { data, error } = await supabase
      .from("task_notes")
      .select("id,task_id,owner,note,updated_at")
      .in("task_id", taskIds);

    if (error) {
      console.error(error);
      setErrorMsg(`Failed to load task notes: ${error.message}`);
      return;
    }

    const noteRows = (data ?? []) as TaskNoteRow[];

    // Build notes map with defaults for both owners
    const nextNotes: Record<string, Record<string, { note: string; updated_at?: string; id?: string }>> = {};
    const nextDraft: Record<string, Record<string, string>> = {};

    for (const taskId of taskIds) {
      nextNotes[taskId] = {};
      nextDraft[taskId] = {};
      for (const o of ALL_OWNERS) {
        nextNotes[taskId][o] = { note: "", updated_at: undefined, id: undefined };
        nextDraft[taskId][o] = "";
      }
    }

    for (const r of noteRows) {
      if (!nextNotes[r.task_id]) continue;
      nextNotes[r.task_id][r.owner] = { note: r.note ?? "", updated_at: r.updated_at, id: r.id };
      nextDraft[r.task_id][r.owner] = r.note ?? "";
    }

    setNotesByTask(nextNotes);
    setDraftByTask(nextDraft);
  };

  const loadTasks = async (weekNum: number) => {
    setErrorMsg("");
    setLoadingTasks(true);

    const { data, error } = await supabase
      .from("tasks")
      .select("id,week_number,owner,description,status,created_at,updated_at")
      .eq("week_number", weekNum)
      .order("created_at", { ascending: false });

    setLoadingTasks(false);

    if (error) {
      console.error(error);
      setErrorMsg(`Failed to load tasks: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as TaskRow[];
    setTasks(rows);

    // Update taskId set for realtime filtering
    const set = new Set<string>(rows.map((t) => t.id));
    taskIdSetRef.current = set;

    // Load notes for these tasks
    await loadNotesForTasks(rows.map((t) => t.id));
  };

  useEffect(() => {
    if (!authChecked) return;
    loadWeeks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    if (!selectedWeek) return;
    loadTasks(selectedWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, selectedWeek]);

  // ---------- REALTIME ----------
  useEffect(() => {
    if (!authChecked || !selectedWeek) return;

    const tasksChannel = supabase
      .channel(`tasks-week-${selectedWeek}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `week_number=eq.${selectedWeek}` },
        async () => {
          await loadTasks(selectedWeek);
        }
      )
      .subscribe();

    const notesChannel = supabase
      .channel(`task-notes`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_notes" }, async (payload: any) => {
        const taskId = payload?.new?.task_id ?? payload?.old?.task_id;
        if (taskId && taskIdSetRef.current.has(taskId)) {
          await loadNotesForTasks(Array.from(taskIdSetRef.current));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(notesChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, selectedWeek]);

  // ---------- MUTATIONS ----------
  const addTask = async () => {
    if (!selectedWeek) return;
    const desc = newDesc.trim();
    if (!desc) return;

    setErrorMsg("");

    const { error } = await supabase.from("tasks").insert({
      week_number: selectedWeek,
      owner: newOwner,
      description: desc,
      status: "Pending",
    });

    if (error) {
      console.error(error);
      setErrorMsg(`Failed to add task: ${error.message}`);
      return;
    }

    setNewDesc("");
    // realtime refreshes
  };

  const setTaskCompleted = async (taskId: string, completed: boolean) => {
    setErrorMsg("");
    const status: Status = completed ? "Completed" : "Pending";

    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      console.error(error);
      setErrorMsg(`Failed to update task: ${error.message}`);
    }
  };

  const updateStatus = async (taskId: string, status: Status) => {
    setErrorMsg("");
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) {
      console.error(error);
      setErrorMsg(`Failed to update task: ${error.message}`);
    }
  };

  // Upsert note (one row per task + owner) + supports autosave overrides
  const saveNote = async (taskId: string, owner: Owner, noteOverride?: string) => {
    setErrorMsg("");

    const raw = noteOverride ?? (draftByTask?.[taskId]?.[owner] ?? "");
    const note = raw.trim();

    const key = makeKey(taskId, owner);

    // Prevent overlapping autosaves for same task+owner
    if (autosaveInFlightRef.current.has(key)) return;
    autosaveInFlightRef.current.add(key);
    setSaving(key, true);

    const { error } = await supabase.from("task_notes").upsert(
      {
        task_id: taskId,
        owner,
        note,
      },
      { onConflict: "task_id,owner" }
    );

    autosaveInFlightRef.current.delete(key);
    setSaving(key, false);

    if (error) {
      console.error(error);
      setErrorMsg(`Failed to save note: ${error.message}`);
      return;
    }

    // Optimistic update (realtime will also refresh)
    setNotesByTask((prev) => {
      const next = { ...prev };
      next[taskId] = { ...(next[taskId] ?? {}) };
      next[taskId][owner] = { note, updated_at: new Date().toISOString() };
      return next;
    });
  };

  // ---------- AUTOSAVE (DEBOUNCED) ----------
  useEffect(() => {
    const delayMs = 1500;

    for (const task of tasks) {
      const taskId = task.id;

      for (const owner of ALL_OWNERS) {
        const draft = draftByTask?.[taskId]?.[owner] ?? "";
        const saved = notesByTask?.[taskId]?.[owner]?.note ?? "";

        // Only autosave when there is an actual change
        if (draft === saved) continue;

        const key = makeKey(taskId, owner);

        // Clear any existing timer
        const existing = autosaveTimersRef.current[key];
        if (existing) clearTimeout(existing);

        // Set new debounce timer
        autosaveTimersRef.current[key] = setTimeout(() => {
          const latestDraft = draftByTask?.[taskId]?.[owner] ?? "";
          const latestSaved = notesByTask?.[taskId]?.[owner]?.note ?? "";
          if (latestDraft !== latestSaved) {
            saveNote(taskId, owner, latestDraft);
          }
        }, delayMs);
      }
    }

    return () => {
      for (const key of Object.keys(autosaveTimersRef.current)) {
        clearTimeout(autosaveTimersRef.current[key]);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftByTask, notesByTask, tasks]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/login");
  };

  // ---------- DERIVED ----------
  const week = useMemo(() => {
    if (!selectedWeek) return null;
    return weeks.find((w) => w.week_number === selectedWeek) ?? null;
  }, [weeks, selectedWeek]);

  const completedCount = tasks.filter((t) => t.status === "Completed").length;
  const progressPct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  // ---------- RENDER ----------
  if (!authChecked) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>Loading…</h2>
        <div>Checking session…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Medical Courier Execution Dashboard (Shared)</h1>
          <div style={{ marginTop: 6, color: "#555" }}>
            Signed in as <strong>{userEmail || "user"}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {errorMsg ? (
        <div style={{ marginTop: 14, padding: 10, border: "1px solid #f1b4b4", background: "#fff7f7" }}>
          {errorMsg}
        </div>
      ) : null}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 8 }}>Weeks</h2>

        {loadingWeeks ? (
          <div>Loading weeks…</div>
        ) : weeks.length === 0 ? (
          <div>
            No weeks found. Ensure your <code>weeks</code> table is seeded in Supabase.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {weeks.map((w) => (
              <button
                key={w.week_number}
                type="button"
                onClick={() => setSelectedWeek(w.week_number)}
                style={{
                  padding: "8px 10px",
                  border: "1px solid #ddd",
                  background: w.week_number === selectedWeek ? "#111" : "#fff",
                  color: w.week_number === selectedWeek ? "#fff" : "#111",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Week {w.week_number}
              </button>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
        {!week ? (
          <div>Select a week to see details.</div>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>
              Week {week.week_number}: {week.title}
            </h2>

            <div style={{ color: "#444", marginBottom: 8 }}>
              Progress:{" "}
              <strong>
                {completedCount}/{tasks.length}
              </strong>{" "}
              tasks completed ({progressPct}%)
              {loadingTasks ? <span style={{ marginLeft: 10 }}>Loading tasks…</span> : null}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Box title="Objectives" items={week.objectives} />
              <Box title="Deliverables" items={week.deliverables} />
              <Box title="KPIs" items={week.kpis} />
              <Box title="Risks" items={week.risks} tone="risk" />
            </div>
          </>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h2>Tasks (Shared)</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <select value={newOwner} onChange={(e) => setNewOwner(e.target.value as Owner)}>
            <option>{OWNER_A}</option>
            <option>{OWNER_B}</option>
          </select>

          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="New task description"
            style={{ minWidth: 320 }}
          />

          <button type="button" onClick={addTask}>
            Add Task
          </button>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#fafafa" }}>
              <tr>
                <Th>Done</Th>
                <Th>Owner</Th>
                <Th>Description</Th>
                <Th>Status</Th>
                <Th>Updates (Auto-save)</Th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <Td colSpan={5}>No tasks for this week yet.</Td>
                </tr>
              ) : (
                tasks.map((t) => {
                  const checked = t.status === "Completed";

                  const notesA = notesByTask?.[t.id]?.[OWNER_A];
                  const notesB = notesByTask?.[t.id]?.[OWNER_B];

                  const draftA = draftByTask?.[t.id]?.[OWNER_A] ?? "";
                  const draftB = draftByTask?.[t.id]?.[OWNER_B] ?? "";

                  return (
                    <tr key={t.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setTaskCompleted(t.id, e.target.checked)}
                        />
                      </Td>

                      <Td>{t.owner}</Td>

                      <Td style={{ maxWidth: 380 }}>
                        <div style={{ fontWeight: 700 }}>{t.description}</div>
                        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => updateStatus(t.id, "Pending")}>
                            Pending
                          </button>
                          <button type="button" onClick={() => updateStatus(t.id, "In Progress")}>
                            In Progress
                          </button>
                          <button type="button" onClick={() => updateStatus(t.id, "Completed")}>
                            Completed
                          </button>
                        </div>
                      </Td>

                      <Td>
                        <StatusPill status={t.status} />
                      </Td>

                      <Td>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 520 }}>
                          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                            <div style={{ fontWeight: 800, marginBottom: 6 }}>{OWNER_A}</div>
                            <textarea
                              value={draftA}
                              onChange={(e) =>
                                setDraftByTask((prev) => ({
                                  ...prev,
                                  [t.id]: { ...(prev[t.id] ?? {}), [OWNER_A]: e.target.value },
                                }))
                              }
                              placeholder="Type your update…"
                              style={{ width: "100%", minHeight: 90 }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                              <button type="button" onClick={() => saveNote(t.id, OWNER_A)}>
                                Save update
                              </button>
                              <div style={{ fontSize: 12, color: "#666" }}>
                                {savingKeys[makeKey(t.id, OWNER_A)]
                                  ? "Saving…"
                                  : `Last: ${fmtDate(notesA?.updated_at)}`}
                              </div>
                            </div>
                          </div>

                          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                            <div style={{ fontWeight: 800, marginBottom: 6 }}>{OWNER_B}</div>
                            <textarea
                              value={draftB}
                              onChange={(e) =>
                                setDraftByTask((prev) => ({
                                  ...prev,
                                  [t.id]: { ...(prev[t.id] ?? {}), [OWNER_B]: e.target.value },
                                }))
                              }
                              placeholder="Type your update…"
                              style={{ width: "100%", minHeight: 90 }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                              <button type="button" onClick={() => saveNote(t.id, OWNER_B)}>
                                Save update
                              </button>
                              <div style={{ fontSize: 12, color: "#666" }}>
                                {savingKeys[makeKey(t.id, OWNER_B)]
                                  ? "Saving…"
                                  : `Last: ${fmtDate(notesB?.updated_at)}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p style={{ color: "#666", marginTop: 10, fontSize: 13 }}>
          Notes auto-save after you stop typing (1.5s debounce). Notes are stored in Supabase (<code>task_notes</code>)
          and shared in real time.
        </p>
      </section>
    </div>
  );
}

function Box({ title, items, tone }: { title: string; items: string[]; tone?: "risk" }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 12,
        background: tone === "risk" ? "#fff7f7" : "#fff",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((x, idx) => (
          <li key={`${title}_${idx}`} style={{ marginBottom: 6 }}>
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const bg = status === "Completed" ? "#eefbf2" : status === "In Progress" ? "#fff8e6" : "#f5f5f5";
  const border = status === "Completed" ? "#bfe8c8" : status === "In Progress" ? "#f0d9a7" : "#ddd";
  const text = status === "Completed" ? "#166534" : status === "In Progress" ? "#7a5d00" : "#333";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "5px 10px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        color: text,
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: 10, fontSize: 13, color: "#444" }}>{children}</th>;
}

function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: 10, verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: 10, verticalAlign: "top" }}>
      {children}
    </td>
  );
}
