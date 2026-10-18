
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type Page = "Dashboard" | "Console" | "Players" | "Plugins" | "Backups" | "Settings";

type ConsoleLine = {
  id: number;
  text: string;
  type: "log" | "command" | "error" | "system";
};

const navigation: { name: Page; icon: string }[] = [
  { name: "Dashboard", icon: "▦" },
  { name: "Console", icon: "›_" },
  { name: "Players", icon: "♙" },
  { name: "Plugins", icon: "▧" },
  { name: "Backups", icon: "◷" },
  { name: "Settings", icon: "⚙" },
];

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [serverStatus, setServerStatus] = useState("Checking...");
  const [serverDetails, setServerDetails] = useState("Checking server process");
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [command, setCommand] = useState("");
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [commandError, setCommandError] = useState("");
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const nextLineId = useRef(0);

  const addLine = useCallback((text: string, type: ConsoleLine["type"] = "log") => {
    setConsoleLines((previous) => [
      ...previous,
      { id: nextLineId.current++, text, type },
    ].slice(-2000));
  }, []);

  const checkServerStatus = useCallback(async () => {
    setChecking(true);

    try {
      const result = await invoke<string>("get_minecraft_status");

      if (result.startsWith("ERROR:")) {
        setServerStatus("Unknown");
        setServerDetails(result);
      } else if (result.trim()) {
        setServerStatus("Online");
        setServerDetails("Paper process detected");
      } else {
        setServerStatus("Offline");
        setServerDetails("No Paper process detected");
      }
    } catch (error) {
      setServerStatus("Unknown");
      setServerDetails(String(error));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    listen<string>("server-console", (event) => {
      addLine(event.payload);
    })
      .then((stopListening) => {
        if (active) {
          unlisten = stopListening;
        } else {
          stopListening();
        }
      })
      .catch((error) => {
        if (active) addLine(`Console listener error: ${String(error)}`, "error");
      });

    void checkServerStatus();

    return () => {
      active = false;
      unlisten?.();
    };
  }, [addLine, checkServerStatus]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLines]);

  async function startServer() {
    setStarting(true);
    setCommandError("");

    try {
      const message = await invoke<string>("start_minecraft_server");
      addLine(message, "system");
      setPage("Console");
      await checkServerStatus();
    } catch (error) {
      const message = String(error);
      setCommandError(message);
      addLine(`Could not start server: ${message}`, "error");
    } finally {
      setStarting(false);
    }
  }

  async function sendCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = command.trim();
    if (!value) return;

    setCommandError("");
    addLine(`> ${value}`, "command");

    try {
      await invoke("send_minecraft_command", { command: value });
      setCommand("");
    } catch (error) {
      const message = String(error);
      setCommandError(message);
      addLine(message, "error");
    }
  }

  const online = serverStatus === "Online";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">⛏</div>
          <div>
            <h2>BlockPanel</h2>
            <span>SERVER MANAGER</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? "active" : ""}`}
              onClick={() => setPage(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.name}</span>
              {page === item.name && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-server">
            <span className={`status-dot ${online ? "online" : ""}`} />
            <div>
              <strong>Paper Server</strong>
              <span>{serverStatus}</span>
            </div>
          </div>
          <p>BlockPanel · Local Edition</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-heading">
            <h1>{page}</h1>
            <p>Manage your Minecraft server</p>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span className="badge-dot" />
              LOCAL SERVER
            </span>
            <button
              className="icon-button"
              title="Refresh server status"
              onClick={() => void checkServerStatus()}
              disabled={checking}
            >
              ↻
            </button>
          </div>
        </header>

        {page === "Dashboard" && (
          <>
            <section className="welcome">
              <div className="welcome-content">
                <span className="eyebrow">WELCOME BACK</span>
                <h2>Your world, your rules.</h2>
                <p>Everything you need to manage your Minecraft server.</p>
                <button className="primary-button" onClick={() => setPage("Console")}>
                  Open Console <span>→</span>
                </button>
              </div>
              <div className="welcome-art" aria-hidden="true">
                <div className="art-orbit orbit-one" />
                <div className="art-orbit orbit-two" />
                <div className="art-block">⛏</div>
                <div className="art-spark spark-one">✦</div>
                <div className="art-spark spark-two">✧</div>
              </div>
            </section>

            <div className="section-heading">
              <h2>Overview</h2>
              <span>Live server information</span>
            </div>

            <section className="stats">
              <article className="card stat-card">
                <div className="stat-top">
                  <span className="stat-icon green">◉</span>
                  <span className={`status-pill ${online ? "pill-online" : ""}`}>
                    <span className="status-dot" />
                    {serverStatus}
                  </span>
                </div>
                <p className="stat-label">SERVER STATUS</p>
                <h3>{serverStatus}</h3>
                <p className="stat-description">{serverDetails}</p>
              </article>

              <article className="card stat-card">
                <div className="stat-top">
                  <span className="stat-icon purple">▧</span>
                  <span className="subtle-tag">JAVA</span>
                </div>
                <p className="stat-label">SERVER SOFTWARE</p>
                <h3>Paper</h3>
                <p className="stat-description">Minecraft Java Edition</p>
              </article>

              <article className="card stat-card">
                <div className="stat-top">
                  <span className="stat-icon blue">⌂</span>
                  <span className="subtle-tag">LOCAL</span>
                </div>
                <p className="stat-label">SERVER DIRECTORY</p>
                <h3 className="directory-name">MinecraftServer</h3>
                <p className="stat-description">Existing server files</p>
              </article>
            </section>

            <div className="section-heading controls-heading">
              <h2>Server controls</h2>
              <span>Manage your Paper instance</span>
            </div>

            <section className="card controls-card">
              <div className="control-info">
                <div className="control-symbol">▶</div>
                <div>
                  <h3>Server power</h3>
                  <p>Start your existing Paper server.</p>
                </div>
              </div>
              <div className="actions">
                <button
                  className="primary-button"
                  onClick={() => void startServer()}
                  disabled={starting || online}
                >
                  {starting ? "Starting..." : online ? "Already online" : "▶ Start Server"}
                </button>
                <button className="secondary-button" onClick={() => setPage("Console")}>
                  View Console
                </button>
              </div>
            </section>

            {commandError && <p className="error-banner">{commandError}</p>}
          </>
        )}

        {page === "Console" && (
          <section className="card console-card">
            <div className="console-header">
              <div>
                <div className="console-title-row">
                  <span className="console-terminal-icon">›_</span>
                  <h2>Server Console</h2>
                </div>
                <p>Live output and command execution</p>
              </div>
              <div className="console-header-actions">
                <span className={`status-pill ${online ? "pill-online" : ""}`}>
                  <span className="status-dot" />
                  {serverStatus}
                </span>
                <button
                  className="secondary-button small-button"
                  onClick={() => setConsoleLines([])}
                >
                  Clear output
                </button>
              </div>
            </div>

            <div className="console-output" role="log" aria-live="polite">
              {consoleLines.length === 0 && (
                <div className="console-placeholder">
                  <span className="placeholder-icon">›_</span>
                  <h3>Console ready</h3>
                  <p>
                    {online
                      ? "No output has been captured by this app yet. Start the server from BlockPanel to stream its logs."
                      : "Start your Paper server to see live logs here."}
                  </p>
                  {!online && (
                    <button
                      className="primary-button"
                      onClick={() => void startServer()}
                      disabled={starting}
                    >
                      {starting ? "Starting..." : "▶ Start Server"}
                    </button>
                  )}
                </div>
              )}

              {consoleLines.map((line) => (
                <div className={`console-line line-${line.type}`} key={line.id}>
                  <span className="line-marker">
                    {line.type === "command" ? "›" : line.type === "error" ? "!" : "·"}
                  </span>
                  <span>{line.text}</span>
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>

            <form className="console-input-row" onSubmit={sendCommand}>
              <span className="prompt-symbol">›</span>
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="Enter a Minecraft command... (e.g. list)"
                aria-label="Minecraft server command"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="primary-button send-button" type="submit">
                Send <span>↗</span>
              </button>
            </form>

            {commandError && <p className="error-banner">{commandError}</p>}

            <div className="console-footer">
              <span><span className="status-dot online" /> Input sends commands to Paper</span>
              <span>{consoleLines.length} lines shown · Max 2000</span>
            </div>
          </section>
        )}

        {page !== "Dashboard" && page !== "Console" && (
          <section className="card coming-soon">
            <div className="coming-soon-icon">
              {navigation.find((item) => item.name === page)?.icon}
            </div>
            <h2>{page}</h2>
            <p>This section is not connected yet. We're building BlockPanel one feature at a time.</p>
            <button className="primary-button" onClick={() => setPage("Dashboard")}>
              ← Back to Dashboard
            </button>
          </section>
        )}

        <footer className="app-footer">
          <span><span className="footer-mark">⛏</span> BlockPanel</span>
          <span>Minecraft Server Manager <span className="footer-separator">·</span> Local Edition</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
