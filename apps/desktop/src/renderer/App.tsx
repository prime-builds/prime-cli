import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdapterSummary,
  Artifact,
  Chat,
  ChatMessage,
  DocRecord,
  DocsSearchResult,
  MissionManifest,
  Project,
  Run,
  RunEvent,
  RunStep
} from "../../../../packages/shared/src/contracts";
import Editor from "@monaco-editor/react";
import { marked } from "marked";

const prime = window.prime;

type TabKind =
  | "chat"
  | "run"
  | "artifact"
  | "report"
  | "docs"
  | "doc"
  | "adapters";

type Tab = {
  id: string;
  kind: TabKind;
  title: string;
  data: Record<string, unknown>;
};

type RunEventLog = RunEvent & { received_at: string };

export default function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [mission, setMission] = useState<MissionManifest | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runSteps, setRunSteps] = useState<Record<string, RunStep[]>>({});
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [adapters, setAdapters] = useState<AdapterSummary[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, RunEventLog[]>>({});
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [missionDraft, setMissionDraft] = useState({ objective: "", scope: "" });
  const [showMissionEditor, setShowMissionEditor] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = useCallback(async () => {
    const response = await prime.request("project.list", {});
    setProjects(response.projects);
  }, []);

  const refreshProjectData = useCallback(
    async (projectId: string) => {
      const [chatResult, runResult, artifactResult, docResult, adapterResult] =
        await Promise.all([
          prime.request("chat.list", { project_id: projectId }),
          prime.request("run.list", { project_id: projectId }),
          prime.request("artifact.list", { project_id: projectId }),
          prime.request("docs.list", { project_id: projectId }),
          prime.request("adapters.list", { project_id: projectId })
        ]);
      setChats(chatResult.chats);
      setRuns(runResult.runs);
      setArtifacts(artifactResult.artifacts);
      setDocs(docResult.docs);
      setAdapters(adapterResult.adapters);
    },
    []
  );

  const openProject = useCallback(async () => {
    const folder = await prime.selectFolder();
    if (!folder) {
      return;
    }
    try {
      const opened = await prime.request("project.open", { root_path: folder });
      setActiveProjectId(opened.project.id);
      await refreshProjectData(opened.project.id);
      setStatusMessage(`Opened project ${opened.project.name}`);
    } catch {
      const name = folder.split(/[/\\]/).filter(Boolean).pop() ?? "Project";
      const created = await prime.request("project.create", {
        name,
        root_path: folder
      });
      setActiveProjectId(created.project.id);
      await refreshProjectData(created.project.id);
      setStatusMessage(`Created project ${created.project.name}`);
    }
  }, [refreshProjectData]);

  const selectProject = useCallback(
    async (projectId: string) => {
      setActiveProjectId(projectId);
      await refreshProjectData(projectId);
    },
    [refreshProjectData]
  );

  const createChat = useCallback(async () => {
    if (!activeProjectId) {
      return;
    }
    const result = await prime.request("chat.create", {
      project_id: activeProjectId
    });
    setChats((prev) => [result.chat, ...prev]);
    setActiveChatId(result.chat.id);
    openTab({ kind: "chat", id: result.chat.id, title: result.chat.title ?? "Chat" });
  }, [activeProjectId]);

  const selectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId);
      openTab({ kind: "chat", id: chatId, title: "Chat" });
      const messagesResult = await prime.request("chat.messages", { chat_id: chatId });
      setChatMessages(messagesResult.messages);
      const missionResult = await prime.request("mission.get", { chat_id: chatId });
      setMission(missionResult.manifest);
      if (missionResult.manifest) {
        setMissionDraft({
          objective: missionResult.manifest.objective,
          scope: missionResult.manifest.scope_targets.join(", ")
        });
      }
    },
    []
  );

  const sendMessage = useCallback(async () => {
    if (!activeChatId || chatInput.trim().length === 0) {
      return;
    }
    const result = await prime.request("chat.sendMessage", {
      chat_id: activeChatId,
      message: { role: "user", content: chatInput.trim() }
    });
    setChatMessages((prev) => [...prev, result.message]);
    setChatInput("");
    if (result.run) {
      setRuns((prev) => [result.run, ...prev]);
      openTab({ kind: "run", id: result.run.id, title: `Run ${result.run.id.slice(0, 6)}` });
      setStatusMessage("Run started");
    }
  }, [activeChatId, chatInput]);

  const startManualRun = useCallback(async () => {
    if (!activeProjectId) {
      return;
    }
    const workflowId = `manual-${Date.now()}`;
    const workflow = {
      workflow_id: workflowId,
      project_id: activeProjectId,
      chat_id: activeChatId ?? undefined,
      scope: { targets: mission?.scope_targets ?? [] },
      steps: []
    };
    const result = await prime.request("run.start", {
      project_id: activeProjectId,
      chat_id: activeChatId ?? undefined,
      workflow_id: workflowId,
      inputs: { workflow }
    });
    setRuns((prev) => [result.run, ...prev]);
    openTab({ kind: "run", id: result.run.id, title: `Run ${result.run.id.slice(0, 6)}` });
  }, [activeProjectId, activeChatId, mission, openTab]);

  const refreshArtifacts = useCallback(async () => {
    if (!activeProjectId) {
      return;
    }
    const result = await prime.request("artifact.list", { project_id: activeProjectId });
    setArtifacts(result.artifacts);
  }, [activeProjectId]);

  const openTab = useCallback(
    (input: { kind: TabKind; id: string; title: string; data?: Record<string, unknown> }) => {
      const tabId = `${input.kind}:${input.id}`;
      setTabs((prev) => {
        const existing = prev.find((tab) => tab.id === tabId);
        if (existing) {
          return prev;
        }
        return [
          ...prev,
          {
            id: tabId,
            kind: input.kind,
            title: input.title,
            data: { entityId: input.id, ...(input.data ?? {}) }
          }
        ];
      });
      setActiveTabId(tabId);
    },
    []
  );

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    setActiveTabId((prev) => (prev === tabId ? null : prev));
  }, []);

  const loadRunSteps = useCallback(async (runId: string) => {
    const result = await prime.request("run.steps", { run_id: runId });
    setRunSteps((prev) => ({ ...prev, [runId]: result.steps }));
  }, []);

  const subscribeToRun = useCallback(
    async (runId: string) => {
      const unsubscribe = await prime.subscribeRunEvents(runId, (event) => {
        setEventsByRun((prev) => {
          const current = prev[runId] ?? [];
          return {
            ...prev,
            [runId]: [...current, { ...event, received_at: new Date().toISOString() }]
          };
        });
        if (event.type === "ARTIFACT_WRITTEN" || event.type === "ARTIFACT_EDITED") {
          void refreshArtifacts();
        }
      });
      return unsubscribe;
    },
    [refreshArtifacts]
  );

  const currentRunEvents =
    activeTab?.kind === "run"
      ? eventsByRun[(activeTab.data.entityId as string) ?? ""] ?? []
      : [];

  const handleCancelRun = useCallback(async (runId: string) => {
    await prime.request("run.cancel", { run_id: runId });
    setStatusMessage("Run cancel requested");
  }, []);

  const handleReplayRun = useCallback(async (runId: string) => {
    const response = await prime.request("run.replay", { run_id: runId });
    openTab({ kind: "run", id: response.new_run_id, title: `Replay ${response.new_run_id.slice(0, 6)}` });
  }, [openTab]);

  const handleForkRun = useCallback(async (runId: string, stepId: string) => {
    const response = await prime.request("run.fork", { run_id: runId, step_id: stepId });
    openTab({ kind: "run", id: response.new_run_id, title: `Fork ${response.new_run_id.slice(0, 6)}` });
  }, [openTab]);

  const saveMission = useCallback(async () => {
    if (!activeChatId) {
      return;
    }
    const scopeTargets = missionDraft.scope
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const response = await prime.request("mission.set", {
      chat_id: activeChatId,
      manifest: {
        objective: missionDraft.objective,
        scope_targets: scopeTargets
      }
    });
    setMission(response.manifest);
    setShowMissionEditor(false);
  }, [activeChatId, missionDraft]);

  const openDocsSearch = useCallback(() => {
    if (!activeProjectId) {
      return;
    }
    openTab({ kind: "docs", id: `docs-${activeProjectId}`, title: "Docs Search", data: { projectId: activeProjectId } });
  }, [activeProjectId, openTab]);

  const openAdaptersTab = useCallback(() => {
    openTab({ kind: "adapters", id: "adapters", title: "Adapters" });
  }, [openTab]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Prime CLI</h1>
          <button onClick={openProject}>Open Project</button>
        </div>

        <Section title="Projects">
          {projects.map((project) => (
            <SidebarItem
              key={project.id}
              active={project.id === activeProjectId}
              onClick={() => selectProject(project.id)}
              label={project.name}
              sub={project.root_path}
            />
          ))}
        </Section>

        <Section title="Chats" actions={<button onClick={createChat}>New</button>}>
          {chats.map((chat) => (
            <SidebarItem
              key={chat.id}
              active={chat.id === activeChatId}
              onClick={() => void selectChat(chat.id)}
              label={chat.title ?? "Chat"}
              sub={chat.created_at}
            />
          ))}
        </Section>

        <Section title="Runs">
          {runs.map((run) => (
            <SidebarItem
              key={run.id}
              active={
                activeTab?.kind === "run" &&
                activeTab.data.entityId === run.id
              }
              onClick={() => openTab({ kind: "run", id: run.id, title: `Run ${run.id.slice(0, 6)}` })}
              label={`Run ${run.id.slice(0, 6)}`}
              sub={run.status}
            />
          ))}
        </Section>

        <Section title="Artifacts">
          {artifacts.map((artifact) => (
            <SidebarItem
              key={artifact.id}
              active={
                activeTab?.kind === "artifact" &&
                activeTab.data.entityId === artifact.id
              }
              onClick={() => openTab({ kind: "artifact", id: artifact.id, title: artifact.name })}
              label={artifact.name}
              sub={artifact.media_type ?? ""}
            />
          ))}
        </Section>

        <Section title="Knowledge Base" actions={<button onClick={openDocsSearch}>Search</button>}>
          {docs.slice(0, 5).map((doc) => (
            <SidebarItem
              key={doc.doc_id}
              label={doc.file_name}
              sub={doc.category ?? doc.tool_name ?? ""}
              onClick={() =>
                openTab({
                  kind: "doc",
                  id: doc.doc_id,
                  title: doc.file_name,
                  data: { docId: doc.doc_id, projectId: activeProjectId ?? "" }
                })
              }
            />
          ))}
        </Section>

        <Section title="Adapters" actions={<button onClick={openAdaptersTab}>Open</button>}>
          {adapters.slice(0, 5).map((adapter) => (
            <SidebarItem key={adapter.id} label={adapter.name} sub={adapter.category} />
          ))}
        </Section>
      </aside>

      <main className="main">
        <div className="tabs">
          {tabs.map((tab) => (
            <div
              key={`${tab.kind}-${tab.id}`}
              className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            >
              <button onClick={() => setActiveTabId(tab.id)}>{tab.title}</button>
              <span onClick={() => closeTab(tab.id)} className="tab-close">
                ?
              </span>
            </div>
          ))}
        </div>

        <div className="content">
          {!activeTab && <EmptyState />}
          {activeTab?.kind === "chat" && activeChat && (
            <ChatView
              chat={activeChat}
              messages={chatMessages}
              mission={mission}
              missionDraft={missionDraft}
              onMissionDraftChange={setMissionDraft}
              onMissionEdit={() => setShowMissionEditor(true)}
              onMissionSave={saveMission}
              showMissionEditor={showMissionEditor}
              onMissionClose={() => setShowMissionEditor(false)}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSend={sendMessage}
              onStartRun={startManualRun}
            />
          )}
          {activeTab?.kind === "run" && (
            <RunView
              runId={activeTab.data.entityId as string}
              steps={runSteps[activeTab.data.entityId as string] ?? []}
              events={eventsByRun[activeTab.data.entityId as string] ?? []}
              onLoadSteps={loadRunSteps}
              onSubscribe={subscribeToRun}
              onCancel={handleCancelRun}
              onReplay={handleReplayRun}
              onFork={handleForkRun}
              artifacts={artifacts}
              onOpenArtifact={(artifact) => openTab({ kind: "artifact", id: artifact.id, title: artifact.name })}
              onOpenReport={(artifact) => openTab({ kind: "report", id: artifact.id, title: "Report" })}
            />
          )}
          {activeTab?.kind === "artifact" && (
            <ArtifactView
              artifactId={activeTab.data.entityId as string}
              onOpenReport={(artifactId) =>
                openTab({ kind: "report", id: artifactId, title: "Report" })
              }
            />
          )}
          {activeTab?.kind === "report" && (
            <ReportView artifactId={activeTab.data.entityId as string} />
          )}
          {activeTab?.kind === "docs" && activeProjectId && (
            <DocsSearchView
              projectId={activeProjectId}
              onOpenDoc={(docId, title) =>
                openTab({
                  kind: "doc",
                  id: docId,
                  title,
                  data: { docId, projectId: activeProjectId }
                })
              }
            />
          )}
          {activeTab?.kind === "doc" && (
            <DocView
              docId={activeTab.data.docId as string}
              projectId={activeTab.data.projectId as string}
            />
          )}
          {activeTab?.kind === "adapters" && (
            <AdaptersView adapters={adapters} />
          )}
        </div>

        <div className="bottom-panel">
          <h3>Run Output</h3>
          <div className="events">
            {currentRunEvents.length === 0 && <div className="muted">No events yet.</div>}
            {currentRunEvents.map((event, index) => (
              <div key={`${event.run_id}-${index}`} className="event">
                <span className="event-type">{event.type}</span>
                <span className="event-meta">{event.timestamp}</span>
                {event.type === "STEP_LOG" && <span className="event-message">{event.message}</span>}
                {event.type === "RUN_FAILED" && <span className="event-message">{event.error}</span>}
              </div>
            ))}
          </div>
        </div>
      </main>

      {statusMessage && <div className="status-bar">{statusMessage}</div>}
    </div>
  );
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-header">
        <span>{title}</span>
        {actions}
      </div>
      <div className="section-body">{children}</div>
    </div>
  );
}

function SidebarItem({ label, sub, onClick, active }: { label: string; sub?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button className={`sidebar-item ${active ? "active" : ""}`} onClick={onClick}>
      <div>{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <h2>Welcome to Prime CLI</h2>
      <p>Select a project to get started.</p>
    </div>
  );
}

function ChatView({
  chat,
  messages,
  mission,
  missionDraft,
  onMissionDraftChange,
  onMissionEdit,
  onMissionSave,
  showMissionEditor,
  onMissionClose,
  chatInput,
  onChatInputChange,
  onSend,
  onStartRun
}: {
  chat: Chat;
  messages: ChatMessage[];
  mission: MissionManifest | null;
  missionDraft: { objective: string; scope: string };
  onMissionDraftChange: (value: { objective: string; scope: string }) => void;
  onMissionEdit: () => void;
  onMissionSave: () => void;
  showMissionEditor: boolean;
  onMissionClose: () => void;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSend: () => void;
  onStartRun: () => void;
}) {
  return (
    <div className="chat-view">
      <div className="mission-panel">
        <div>
          <strong>Mission</strong>
          <div className="muted">{mission?.objective ?? "No mission set"}</div>
          <div className="muted">Scope: {(mission?.scope_targets ?? []).join(", ") || "None"}</div>
        </div>
        <button onClick={onMissionEdit}>Edit</button>
      </div>

      {showMissionEditor && (
        <div className="modal">
          <div className="modal-content">
            <h3>Edit Mission</h3>
            <label>Objective</label>
            <textarea
              value={missionDraft.objective}
              onChange={(event) =>
                onMissionDraftChange({ ...missionDraft, objective: event.target.value })
              }
            />
            <label>Scope targets (comma separated)</label>
            <input
              value={missionDraft.scope}
              onChange={(event) =>
                onMissionDraftChange({ ...missionDraft, scope: event.target.value })
              }
            />
            <div className="modal-actions">
              <button onClick={onMissionClose}>Cancel</button>
              <button onClick={onMissionSave}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            <span>{message.role}</span>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          placeholder={`Message ${chat.title ?? "chat"}`}
        />
        <div className="chat-actions">
          <button onClick={onSend}>Send</button>
          <button onClick={onStartRun}>Start Run</button>
        </div>
      </div>
    </div>
  );
}

function RunView({
  runId,
  steps,
  events,
  onLoadSteps,
  onSubscribe,
  onCancel,
  onReplay,
  onFork,
  artifacts,
  onOpenArtifact,
  onOpenReport
}: {
  runId: string;
  steps: RunStep[];
  events: RunEventLog[];
  onLoadSteps: (runId: string) => Promise<void>;
  onSubscribe: (runId: string) => Promise<() => void>;
  onCancel: (runId: string) => void;
  onReplay: (runId: string) => void;
  onFork: (runId: string, stepId: string) => void;
  artifacts: Artifact[];
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenReport: (artifact: Artifact) => void;
}) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  useEffect(() => {
    void onLoadSteps(runId);
    let unsubscribe: (() => void) | undefined;
    void onSubscribe(runId).then((fn) => {
      unsubscribe = fn;
    });
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [runId, onLoadSteps, onSubscribe]);

  const runArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.run_id === runId),
    [artifacts, runId]
  );
  const reportArtifact = runArtifacts.find(
    (artifact) =>
      artifact.name.toLowerCase().includes("report") &&
      (artifact.name.endsWith(".md") || artifact.media_type === "text/markdown")
  );
  const stepLogs = events.filter(
    (event) => event.type === "STEP_LOG" && event.step_id === selectedStepId
  );

  return (
    <div className="run-view">
      <div className="run-header">
        <div>
          <h2>Run {runId}</h2>
        </div>
        <div className="run-actions">
          <button onClick={() => onCancel(runId)}>Cancel</button>
          <button onClick={() => onReplay(runId)}>Replay</button>
          <button
            onClick={() => selectedStepId && onFork(runId, selectedStepId)}
            disabled={!selectedStepId}
          >
            Fork
          </button>
          {reportArtifact && (
            <button onClick={() => onOpenReport(reportArtifact)}>Open Report</button>
          )}
        </div>
      </div>

      <div className="run-body">
        <div className="steps">
          <h3>Steps</h3>
          {steps.length === 0 && <div className="muted">No steps recorded.</div>}
          {steps.map((step) => (
            <button
              key={step.id}
              className={`step-item ${selectedStepId === step.step_id ? "active" : ""}`}
              onClick={() => setSelectedStepId(step.step_id)}
            >
              <div>{step.adapter}</div>
              <div className="sub">{step.status}</div>
            </button>
          ))}
        </div>
        <div className="step-detail">
          <h3>Artifacts</h3>
          {runArtifacts.map((artifact) => (
            <button
              key={artifact.id}
              className="artifact-item"
              onClick={() => onOpenArtifact(artifact)}
            >
              {artifact.name}
            </button>
          ))}
          <h3>Step Logs</h3>
          {stepLogs.length === 0 && <div className="muted">No logs for this step.</div>}
          {stepLogs.map((log, index) => (
            <div key={`${log.step_id}-${index}`} className="log-line">
              <span className="muted">{log.level ?? "info"}</span> {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArtifactView({ artifactId, onOpenReport }: { artifactId: string; onOpenReport: (artifactId: string) => void }) {
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [content, setContent] = useState<string>("");
  const [editable, setEditable] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await prime.request("artifact.open", { artifact_id: artifactId });
      setArtifact(result.artifact);
      if (result.artifact.path.endsWith(".md")) {
        onOpenReport(result.artifact.id);
        return;
      }
      const raw = await prime.readFile(result.artifact.path);
      setContent(raw);
    };
    void load();
  }, [artifactId, onOpenReport]);

  const save = async () => {
    if (!artifact) {
      return;
    }
    try {
      const parsed = JSON.parse(content);
      await prime.request("artifact.update", {
        artifact_id: artifact.id,
        new_content_json: parsed,
        reason: reason || undefined
      });
      setEditable(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  return (
    <div className="artifact-view">
      <div className="artifact-header">
        <h2>{artifact?.name ?? "Artifact"}</h2>
        <div className="artifact-actions">
          <button onClick={() => setEditable((prev) => !prev)}>
            {editable ? "Lock" : "Edit"}
          </button>
          {editable && <button onClick={save}>Save</button>}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="artifact-editor">
        <Editor
          height="100%"
          language="json"
          value={content}
          onChange={(value) => setContent(value ?? "")}
          options={{ readOnly: !editable, minimap: { enabled: false } }}
        />
      </div>
      {editable && (
        <input
          className="artifact-reason"
          placeholder="Reason for edit"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      )}
    </div>
  );
}

function ReportView({ artifactId }: { artifactId: string }) {
  const [markdown, setMarkdown] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const result = await prime.request("artifact.open", { artifact_id: artifactId });
      const reportBody = await prime.readFile(result.artifact.path);
      setMarkdown(reportBody);
    };
    void load();
  }, [artifactId]);

  return (
    <div className="report-view">
      <h2>Report</h2>
      <div
        className="markdown"
        dangerouslySetInnerHTML={{ __html: marked.parse(markdown) }}
      />
    </div>
  );
}

function DocsSearchView({ projectId, onOpenDoc }: { projectId: string; onOpenDoc: (docId: string, title: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocsSearchResult[]>([]);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) {
      return;
    }
    const response = await prime.request("docs.search", { project_id: projectId, query: query.trim(), top_k: 8 });
    setResults(response.results);
  };

  const importDocs = async () => {
    const files = await prime.selectFiles([
      { name: "Docs", extensions: ["md", "txt", "html", "htm", "json"] }
    ]);
    if (files.length === 0) {
      return;
    }
    const response = await prime.request("docs.import", { project_id: projectId, file_paths: files });
    setImportStatus(`Imported ${response.imported}, skipped ${response.skipped}`);
  };

  return (
    <div className="docs-view">
      <div className="docs-actions">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search docs"
        />
        <button onClick={search}>Search</button>
        <button onClick={importDocs}>Import Docs</button>
      </div>
      {importStatus && <div className="muted">{importStatus}</div>}
      <div className="docs-results">
        {results.map((result) => (
          <button key={result.chunk_id} onClick={() => onOpenDoc(result.doc_id, result.file_name)}>
            <div>{result.file_name}</div>
            <div className="snippet">{result.snippet}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DocView({ docId, projectId }: { docId: string; projectId: string }) {
  const [content, setContent] = useState<string>("");
  const [meta, setMeta] = useState<DocRecord | null>(null);

  useEffect(() => {
    const load = async () => {
      const response = await prime.request("docs.open", { project_id: projectId, doc_id: docId });
      setMeta(response.doc);
      const raw = await prime.readFile(response.absolute_path);
      setContent(raw);
    };
    void load();
  }, [docId, projectId]);

  return (
    <div className="doc-view">
      <h2>{meta?.file_name ?? "Document"}</h2>
      <pre>{content}</pre>
    </div>
  );
}

function AdaptersView({ adapters }: { adapters: AdapterSummary[] }) {
  return (
    <div className="adapters-view">
      <h2>Adapters</h2>
      {adapters.map((adapter) => (
        <div key={adapter.id} className="adapter-card">
          <div className="adapter-header">
            <strong>{adapter.name}</strong>
            <span>{adapter.category}</span>
          </div>
          <div className="muted">{adapter.description}</div>
          <div className="adapter-meta">
            <span>Risk: {adapter.risk_default}</span>
            <span>Inputs: {adapter.inputs.join(", ") || "None"}</span>
            <span>Outputs: {adapter.outputs.join(", ") || "None"}</span>
          </div>
          <div className="adapter-params">
            {adapter.params_summary.map((param) => (
              <div key={param.name}>
                <strong>{param.name}</strong> ({param.type}) {param.required ? "*" : ""}
                {param.description && <span className="muted"> - {param.description}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
