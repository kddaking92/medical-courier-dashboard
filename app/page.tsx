"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function DashboardPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [newOwner, setNewOwner] = useState<Owner>("Co-Owner A (Ops/Compliance)");
  const [newDesc, setNewDesc] = useState<string>("");

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
      if (!session) {
        window.location.assign("/login");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---------- DATA LOADERS ----------
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

    // choose first week if not set
    if (safeWeeks.length > 0 && !safeWeeks.some((x) => x.week_number === selectedWeek)) {
      setSelectedWeek(safeWeeks[0].week_number);
    }
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

    setTasks((data ?? []) as TaskRow[]);
  };

  // load weeks after auth
  useEffect(() => {
    if (!authChecked) return;
    loadWeeks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  // load tasks when week changes
  useEffect(() => {
    if (!authChecked) return;
    if (!selectedWeek) return;
    loadTasks(selectedWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, selectedWeek]);

  // OPTIONAL REALTIME: refresh tasks when anyone changes tasks for selected week
  useEffect(() => {
    if (!authChecked || !selectedWeek) return;

    const channel = supabase
      .channel(`tasks-week-${selectedWeek}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `week_number=eq.${selectedWeek}` },
        () => {
          loadTasks(selectedWeek);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, selectedWeek]);

  const selectedWeekRow = useMemo(
    () => (selectedWeek ? weeks.find((w) => w.week_number === selectedWeek) ?? null : null),
    [weeks, selectedWeek]
  );

  const completedCount = tasks.filter((t) => t.status === "Completed").length;
  const progressPct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

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
    // realtime will refresh; if disabled, uncomment:
    // await loadTasks(selectedWeek);
  };

  const updateStatus = async (taskId: string, status: Status) => {
    setErrorMsg("");

    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);

    if (error) {
      console.error(error);
      setErrorMsg(`Failed to update task: ${error.message}`);
      return;
    }

    // realtime will refresh; if disabled, uncomment:
    // await loadTasks(selectedWeek!);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/login");
  };

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
        {!selectedWeekRow ? (
          <div>Select a week to see details.</div>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>
              Week {selectedWeekRow.week_number}: {selectedWeekRow.title}
            </h2>

            <div style={{ color: "#444", marginBottom: 8 }}>
              Progress:{" "}
              <strong>
                {completedCount}/{tasks.length}
              </strong>{" "}
              tasks completed ({progressPct}%){loadingTasks ? <span style={{ marginLeft: 10 }}>Loading tasks…</span> : null}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Box title="Objectives" items={selectedWeekRow.objectives} />
              <Box title="Deliverables" items={selectedWeekRow.deliverables} />
              <Box title="KPIs" items={selectedWeekRow.kpis} />
              <Box title="Risks" items={selectedWeekRow.risks} tone="risk" />
            </div>
          </>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h2>Tasks (Shared)</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <select value={newOwner} onChange={(e) => setNewOwner(e.target.value as Owner)}>
            <option>Co-Owner A (Ops/Compliance)</option>
            <option>Co-Owner B (Sales/Finance)</option>
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
                <Th>Owner</Th>
                <Th>Description</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <Td colSpan={4}>No tasks for this week yet.</Td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid #eee" }}>
                    <Td>{t.owner}</Td>
                    <Td>{t.description}</Td>
                    <Td>
                      <StatusPill status={t.status} />
                    </Td>
                    <Td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Box({ title, items, tone }: { title: string; items: string[]; tone?: "risk" }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: tone === "risk" ? "#fff7f7" : "#fff" }}>
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
    <span style={{ display: "inline-block", padding: "5px 10px", borderRadius: 999, background: bg, border: `1px solid ${border}`, color: text, fontWeight: 800, fontSize: 12 }}>
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
