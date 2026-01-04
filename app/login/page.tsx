"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string>("");
  const [sessionInfo, setSessionInfo] = useState<string>("(checking…)");

  const refreshSessionInfo = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setSessionInfo(`Session error: ${error.message}`);
      return;
    }
    setSessionInfo(data.session ? `SIGNED IN as ${data.session.user.email}` : "SIGNED OUT (no session)");
  };

  useEffect(() => {
    refreshSessionInfo();
  }, []);

  const signUp = async () => {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    setMsg(error ? error.message : "Signup successful. Now click Sign In.");
    await refreshSessionInfo();
  };

  const signIn = async () => {
    setMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMsg(error.message);
      await refreshSessionInfo();
      return;
    }

    const session = data.session ?? (await supabase.auth.getSession()).data.session;

    if (!session) {
      setMsg("Sign-in succeeded but no session is being stored. Check Supabase Auth settings.");
      await refreshSessionInfo();
      return;
    }

    setMsg("Signed in. Redirecting…");
    await refreshSessionInfo();

    // Hard redirect
    window.location.assign("/");
  };

  const signOut = async () => {
    setMsg("");
    await supabase.auth.signOut();
    await refreshSessionInfo();
    setMsg("Signed out.");
  };

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui", padding: 16 }}>
      <h1>Login</h1>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #ddd", background: "#fafafa", fontWeight: 800 }}>
        Session status: {sessionInfo}
      </div>

      <label style={{ display: "block", marginTop: 12, fontWeight: 800 }}>Email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 8, border: "1px solid #ddd" }}
        placeholder="you@company.com"
      />

      <label style={{ display: "block", marginTop: 12, fontWeight: 800 }}>Password</label>
      <input
        value={password}
        type="password"
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 8, border: "1px solid #ddd" }}
        placeholder="Password"
      />

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={signIn} style={{ padding: 10, borderRadius: 8, border: "1px solid #111" }}>
          Sign In
        </button>
        <button type="button" onClick={signUp} style={{ padding: 10, borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>
          Sign Up
        </button>
        <button type="button" onClick={signOut} style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}>
          Sign Out
        </button>
        <button type="button" onClick={() => window.location.assign("/")} style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}>
          Go to Dashboard
        </button>
      </div>

      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </div>
  );
}

