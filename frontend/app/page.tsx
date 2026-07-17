"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LayoutDashboard,
  FileText,
  GitBranch,
  Scissors,
  Users,
  Network,
  Share2,
  Database,
  MessageSquare,
  Settings as SettingsIcon,
  Terminal,
  Upload,
  Trash2,
  Clock,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Sparkles
} from "lucide-react";

// --- Types & Interfaces ---
interface DocumentMetadata {
  id: string;
  filename: string;
  type: string;
  size: number;
  created_at: string;
  status: string;
}

interface DebugInfo {
  execution_time_ms: number;
  logs: string[];
  errors: string[];
}

interface APIResponse<T> {
  data?: T;
  extracted_text?: string;
  document?: DocumentMetadata;
  documents?: DocumentMetadata[];
  status?: string;
  id?: string;
  processing_time_ms?: number;
  debug: DebugInfo;
}

interface PipelineStage {
  id: string;
  name: string;
  status: "idle" | "running" | "completed" | "failed";
  description: string;
}

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  timestamp: string;
}

const BACKEND_URL = "http://localhost:8000";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  // Pipeline status tracking
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([
    { id: "upload", name: "Upload", status: "idle", description: "Receive file bytes" },
    { id: "parsing", name: "Parsing", status: "idle", description: "Extract raw document text" },
    { id: "chunking", name: "Chunking", status: "idle", description: "Segment text with overlapping window" },
    { id: "embeddings", name: "Embeddings", status: "idle", description: "Generate vector representations" },
    { id: "vector_storage", name: "Vector Storage", status: "idle", description: "Write vector embeddings to Qdrant" },
    { id: "entity_extraction", name: "Entity Extraction", status: "idle", description: "Identify core entities using LLM" },
    { id: "relationship_extraction", name: "Relationship Extraction", status: "idle", description: "Map entity connections and descriptions" },
    { id: "graph_building", name: "Graph Building", status: "idle", description: "Insert structures into Neo4j" },
    { id: "ready", name: "Ready", status: "idle", description: "System primed for contextual queries" }
  ]);

  // Debug Panel States
  const [debugLogs, setDebugLogs] = useState<string[]>(["Debugger initialized. Ready for operations..."]);
  const [debugExecutionTime, setDebugExecutionTime] = useState<number>(0);
  const [debugRawJSON, setDebugRawJSON] = useState<unknown>(null);
  const [debugErrors, setDebugErrors] = useState<string[]>([]);

  // Local Chat sandbox state
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: "ai", text: "Welcome to GraphRAG Studio! Ask questions based on uploaded documents once chunking and graph building are completed in future phases.", timestamp: new Date().toLocaleTimeString() }
  ]);

  // Upload Progress
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Fetch Documents
  const { data: documentsData } = useQuery<APIResponse<DocumentMetadata[]>>({
    queryKey: ["documents"],
    queryFn: async () => {
      const response = await fetch(`${BACKEND_URL}/documents`);
      if (!response.ok) throw new Error("Failed to fetch documents.");
      const res = await response.json();
      // Side-effect: update debugger
      updateDebugger(res, "GET /documents");
      return res;
    }
  });

  const documents = documentsData?.documents || [];

  // Fetch Document details (text preview)
  const { data: activeDocData, isFetching: isActiveDocFetching } = useQuery<APIResponse<unknown>>({
    queryKey: ["document", selectedDocId],
    queryFn: async () => {
      if (!selectedDocId) return null;
      const response = await fetch(`${BACKEND_URL}/documents/${selectedDocId}`);
      if (!response.ok) throw new Error("Failed to load document content.");
      const res = await response.json();
      updateDebugger(res, `GET /documents/${selectedDocId}`);
      return res;
    },
    enabled: !!selectedDocId
  });

  // Delete Document Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${BACKEND_URL}/documents/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete document.");
      const res = await response.json();
      updateDebugger(res, `DELETE /documents/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (selectedDocId) setSelectedDocId(null);
    }
  });

  interface DebuggableResponse {
    debug?: {
      execution_time_ms?: number;
      logs?: string[];
      errors?: string[];
    };
  }

  // Helper to sync debug logs from API response
  const updateDebugger = (res: DebuggableResponse, actionName: string) => {
    if (!res) return;
    setDebugExecutionTime(res.debug?.execution_time_ms || 0);
    setDebugRawJSON(res);
    setDebugErrors(res.debug?.errors || []);
    
    const timestamp = new Date().toLocaleTimeString();
    const newLogs = (res.debug?.logs || []).map((l: string) => `[${timestamp}] [${actionName}] ${l}`);
    setDebugLogs(prev => [...newLogs, ...prev].slice(0, 100)); // Limit to last 100 logs
  };

  // Upload handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);
    
    // Update pipeline status
    setPipelineStages(prev =>
      prev.map(stage => {
        if (stage.id === "upload") return { ...stage, status: "running" };
        return { ...stage, status: "idle" };
      })
    );

    const formData = new FormData();
    formData.append("file", file);

    setUploadProgress(40);

    try {
      const response = await fetch(`${BACKEND_URL}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      setUploadProgress(80);

      if (!response.ok) {
        const errorData = (await response.json()) as { detail?: DebuggableResponse & { error?: string } };
        const errDetail = errorData.detail || {};
        updateDebugger(errDetail, "POST /documents/upload");
        throw new Error(errDetail.error || "Upload failed");
      }

      const res = await response.json();
      updateDebugger(res, "POST /documents/upload");
      
      setUploadProgress(100);

      // Invalidate queries to refresh doc list
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      
      if (res.document) {
        setSelectedDocId(res.document.id);
      }

      // Update Pipeline stages to successful
      setPipelineStages(prev =>
        prev.map(stage => {
          if (stage.id === "upload" || stage.id === "parsing") {
            return { ...stage, status: "completed" };
          }
          return stage;
        })
      );

    } catch (e: unknown) {
      setPipelineStages(prev =>
        prev.map(stage => {
          if (stage.id === "upload" || stage.id === "parsing") {
            return { ...stage, status: "failed" };
          }
          return stage;
        })
      );
      const errMsg = e instanceof Error ? e.message : "Upload error";
      setDebugErrors(prev => [errMsg, ...prev]);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // Local chat submission
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: chatInput,
      timestamp: new Date().toLocaleTimeString()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");

    // Simulate response delay
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        sender: "ai",
        text: `Echo Sandbox: Received query "${userMsg.text}". In future phases, this will run a hybrid GraphRAG search over your databases.`,
        timestamp: new Date().toLocaleTimeString()
      };
      setChatMessages(prev => [...prev, aiMsg]);
    }, 800);
  };

  // Left Sidebar tabs config
  const navItems = [
    { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
    { id: "documents", name: "Documents", icon: FileText },
    { id: "pipeline", name: "Pipeline", icon: GitBranch },
    { id: "chunks", name: "Chunks", icon: Scissors },
    { id: "entities", name: "Entities", icon: Users },
    { id: "relationships", name: "Relationships", icon: Network },
    { id: "graph", name: "Graph Visualizer", icon: Share2 },
    { id: "vectors", name: "Vector Search", icon: Database },
    { id: "chat", name: "Chat", icon: MessageSquare },
    { id: "debug", name: "Debug Panel", icon: Terminal },
    { id: "settings", name: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* 1. Left Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl flex flex-col z-20">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold">
            G
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              GraphRAG Studio
            </h1>
            <span className="text-[10px] text-slate-500 font-mono">v0.1.0 (Phase 1)</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-purple-600/10 border border-purple-500/25 text-purple-200"
                    : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-purple-400" : ""}`} />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <div className="text-[11px] font-mono text-slate-400">
              Backend Status: <span className="text-emerald-400">Online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Main Workstation */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur-xl px-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-semibold capitalize text-slate-200">{activeTab}</h2>
            <div className="hidden md:flex items-center gap-4 text-xs font-mono text-slate-500">
              <span>DB: <strong className="text-purple-400">Neo4j + Qdrant</strong></span>
              <span>•</span>
              <span>Model: <strong className="text-slate-300">gemini-1.5-flash</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Last Latency: <strong className="text-purple-300">{debugExecutionTime.toFixed(1)}ms</strong></span>
            </div>
          </div>
        </header>

        {/* Dynamic Workspace Container */}
        <main className="flex-1 p-8 overflow-y-auto relative">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-8 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Stats cards */}
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700/50 transition-all">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wider">Total Documents</div>
                  <div className="text-3xl font-bold mt-2 text-white">{documents.length}</div>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700/50 transition-all">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wider">Processed Chunks</div>
                  <div className="text-3xl font-bold mt-2 text-slate-600">0</div>
                  <span className="text-[10px] text-slate-600 font-mono mt-1 block">Phase 2 capability</span>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700/50 transition-all">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wider">Extracted Entities</div>
                  <div className="text-3xl font-bold mt-2 text-slate-600">0</div>
                  <span className="text-[10px] text-slate-600 font-mono mt-1 block">Phase 3 capability</span>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700/50 transition-all">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wider">Graph Relations</div>
                  <div className="text-3xl font-bold mt-2 text-slate-600">0</div>
                  <span className="text-[10px] text-slate-600 font-mono mt-1 block">Phase 3 capability</span>
                </div>
              </div>

              {/* Layout splitter: File overview & Pipeline timeline */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left col: Recent Files */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-200 mb-4">Workspace Documents</h3>
                    {documents.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                        No files in workspace. Go to the Documents tab to upload files.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-500">
                              <th className="py-3 px-4">Filename</th>
                              <th className="py-3 px-4">Type</th>
                              <th className="py-3 px-4">Size</th>
                              <th className="py-3 px-4">Uploaded</th>
                            </tr>
                          </thead>
                          <tbody>
                            {documents.slice(0, 5).map(doc => (
                              <tr key={doc.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 text-slate-300">
                                <td className="py-3 px-4 font-medium max-w-[200px] truncate">{doc.filename}</td>
                                <td className="py-3 px-4 text-xs font-mono uppercase text-purple-400">{doc.type}</td>
                                <td className="py-3 px-4 text-xs">{(doc.size / 1024).toFixed(1)} KB</td>
                                <td className="py-3 px-4 text-xs text-slate-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right col: Active Pipeline Tracker */}
                <div className="space-y-6">
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-semibold text-slate-200">Active Pipeline Run</h3>
                      <span className="text-[10px] text-slate-500 font-mono">Real-time status</span>
                    </div>

                    <div className="space-y-4">
                      {pipelineStages.map((stage, idx) => {
                        const statusColor =
                          stage.status === "completed"
                            ? "bg-emerald-500"
                            : stage.status === "running"
                            ? "bg-purple-500 animate-pulse"
                            : stage.status === "failed"
                            ? "bg-rose-500"
                            : "bg-slate-800";

                        const statusText =
                          stage.status === "completed"
                            ? "Completed"
                            : stage.status === "running"
                            ? "Processing"
                            : stage.status === "failed"
                            ? "Failed"
                            : "Idle";

                        return (
                          <div key={stage.id} className="flex gap-4 items-start relative group">
                            {idx < pipelineStages.length - 1 && (
                              <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-slate-800 group-hover:bg-slate-700/50" />
                            )}
                            <div className={`w-5 h-5 rounded-full ${statusColor} border-4 border-slate-950 z-10 flex items-center justify-center`} />
                            <div>
                              <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                                {stage.name}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                                  stage.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                                  stage.status === "running" ? "bg-purple-500/10 text-purple-400" :
                                  stage.status === "failed" ? "bg-rose-500/10 text-rose-400" : "bg-slate-800 text-slate-500"
                                }`}>
                                  {statusText}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">{stage.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOCUMENTS */}
          {activeTab === "documents" && (
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 h-[calc(100vh-12rem)]">
              {/* Left Panel: Files Manager */}
              <div className="w-full lg:w-1/2 flex flex-col gap-6">
                {/* Upload Section */}
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">Upload File</h3>
                  <label className="border border-dashed border-slate-700 hover:border-purple-500/50 bg-slate-950 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all">
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".txt,.pdf,.docx,.md"
                      disabled={isUploading}
                    />
                    <Upload className={`w-8 h-8 ${isUploading ? "text-purple-400 animate-bounce" : "text-slate-500"} mb-3`} />
                    <span className="text-sm text-slate-300 font-medium">Click or Drag & Drop</span>
                    <span className="text-xs text-slate-500 mt-1">PDF, TXT, Markdown, or DOCX</span>
                  </label>

                  {isUploading && (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Uploading & Parsing file...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Uploaded Files Table */}
                <div className="flex-1 p-6 rounded-2xl bg-slate-900 border border-slate-800 overflow-y-auto">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Uploaded files</h3>
                  {documents.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
                      No files stored in repository.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {documents.map(doc => {
                        const isSelected = selectedDocId === doc.id;
                        return (
                          <div
                            key={doc.id}
                            onClick={() => setSelectedDocId(doc.id)}
                            className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              isSelected
                                ? "bg-purple-600/10 border-purple-500/40"
                                : "bg-slate-950/60 border-slate-800 hover:border-slate-700/60"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className={`w-5 h-5 flex-shrink-0 ${isSelected ? "text-purple-400" : "text-slate-500"}`} />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-200 truncate pr-4">{doc.filename}</div>
                                <div className="text-[10px] text-slate-500 mt-1 font-mono uppercase">
                                  {doc.type} • {(doc.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDocId(doc.id);
                                }}
                                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                                title="Preview Content"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMutation.mutate(doc.id);
                                }}
                                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-rose-950/40 hover:border-rose-950 text-slate-400 hover:text-rose-400"
                                title="Delete Document"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Document Preview */}
              <div className="w-full lg:w-1/2 rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col h-full">
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center justify-between">
                  <span>Document Preview</span>
                  {selectedDocId && (
                    <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">ID: {selectedDocId}</span>
                  )}
                </h3>

                {!selectedDocId ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
                    <FileText className="w-12 h-12 text-slate-700 mb-3" />
                    <p className="text-sm">Select an uploaded document to preview metadata and raw text content.</p>
                  </div>
                ) : isActiveDocFetching ? (
                  <div className="flex-1 flex items-center justify-center text-slate-500">
                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-3" />
                    <span>Loading document text...</span>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Metadata Header */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 mb-4 grid grid-cols-2 gap-4 text-xs font-mono text-slate-400">
                      <div>
                        Filename: <strong className="text-slate-200">{activeDocData?.document?.filename}</strong>
                      </div>
                      <div>
                        Type: <strong className="text-slate-200 uppercase">{activeDocData?.document?.type}</strong>
                      </div>
                      <div>
                        Size: <strong className="text-slate-200">{((activeDocData?.document?.size || 0) / 1024).toFixed(1)} KB</strong>
                      </div>
                      <div>
                        Uploaded: <strong className="text-slate-200">{activeDocData?.document?.created_at ? new Date(activeDocData.document.created_at).toLocaleDateString() : ""}</strong>
                      </div>
                    </div>

                    {/* Extracted text viewport */}
                    <div className="flex-1 p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs overflow-y-auto leading-relaxed text-slate-300 select-text whitespace-pre-wrap">
                      {activeDocData?.extracted_text || "No text content found in document."}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PIPELINE */}
          {activeTab === "pipeline" && (
            <div className="max-w-4xl mx-auto p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-200">Visual Pipeline Pipeline</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Track the full lifecycle of your data as it goes from raw file uploads to structured nodes and semantic vectors.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {pipelineStages.map((stage, index) => {
                  const isCompleted = stage.status === "completed";
                  const isRunning = stage.status === "running";
                  const isFailed = stage.status === "failed";
                  
                  return (
                    <div
                      key={stage.id}
                      className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                        isCompleted ? "bg-emerald-950/20 border-emerald-500/20" :
                        isRunning ? "bg-purple-950/20 border-purple-500/30 animate-pulse" :
                        isFailed ? "bg-rose-950/20 border-rose-500/20" :
                        "bg-slate-950 border-slate-800"
                      }`}
                    >
                      <div className="flex gap-4 items-center">
                        <div className="text-xs font-mono text-slate-500 w-6">#{index + 1}</div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-200">{stage.name}</h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">{stage.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isCompleted && (
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-mono">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Completed
                          </span>
                        )}
                        {isRunning && (
                          <span className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full font-mono">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                            Running
                          </span>
                        )}
                        {isFailed && (
                          <span className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full font-mono">
                            <XCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        )}
                        {stage.status === "idle" && (
                          <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded font-mono border border-slate-800">
                            Idle
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: CHUNKS */}
          {activeTab === "chunks" && (
            <div className="max-w-4xl mx-auto p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-center">
              <Scissors className="w-12 h-12 text-slate-700 mb-4" />
              <h3 className="text-base font-semibold text-slate-200">No chunks.</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-sm">
                Document chunking is scheduled for Phase 2. Once configured, you will see your text split into paragraphs with overlapping context.
              </p>
            </div>
          )}

          {/* TAB 5: ENTITIES */}
          {activeTab === "entities" && (
            <div className="max-w-4xl mx-auto p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-center">
              <Users className="w-12 h-12 text-slate-700 mb-4" />
              <h3 className="text-base font-semibold text-slate-200">No entities.</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-sm">
                Entity extraction will run in Phase 3. The LLM will identify critical nouns (people, systems, dates) and group them with descriptions.
              </p>
            </div>
          )}

          {/* TAB 6: RELATIONSHIPS */}
          {activeTab === "relationships" && (
            <div className="max-w-4xl mx-auto p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-center">
              <Network className="w-12 h-12 text-slate-700 mb-4" />
              <h3 className="text-base font-semibold text-slate-200">No relationships.</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-sm">
                Relationship mapping will run in Phase 3. The LLM will identify structural links between entities to build graph triples.
              </p>
            </div>
          )}

          {/* TAB 7: GRAPH VISUALIZER */}
          {activeTab === "graph" && (
            <div className="max-w-7xl mx-auto h-[calc(100vh-12rem)] flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Interactive Knowledge Graph</h3>
                <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  Nodes: 0 | Edges: 0
                </span>
              </div>
              
              {/* React Flow Box */}
              <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden relative">
                <ReactFlow
                  nodes={[]}
                  edges={[]}
                  fitView
                >
                  <Background color="#334155" gap={20} />
                  <Controls className="bg-slate-950 border border-slate-800 text-slate-300" />
                </ReactFlow>
                
                {/* Visual Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 pointer-events-none z-10 text-center p-6">
                  <Share2 className="w-10 h-10 text-slate-700 mb-3 animate-pulse" />
                  <h4 className="text-sm font-semibold text-slate-200">No graph available.</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Graph mapping in Neo4j will activate during Phase 3. Nodes and edges will load here interactively.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: VECTOR SEARCH */}
          {activeTab === "vectors" && (
            <div className="max-w-4xl mx-auto p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-center">
              <Database className="w-12 h-12 text-slate-700 mb-4" />
              <h3 className="text-base font-semibold text-slate-200">No vectors.</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-sm">
                Dense embedding storage will run in Phase 2. High-dimensional vectors will sync to Qdrant databases for similarity matching.
              </p>
            </div>
          )}

          {/* TAB 9: CHAT SANDBOX */}
          {activeTab === "chat" && (
            <div className="max-w-4xl mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex flex-col h-[calc(100vh-12rem)]">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-slate-200">GraphRAG Q&A Sandbox</span>
                </div>
                <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Mock UI Mode
                </span>
              </div>

              {/* Message Streams */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-950/40">
                {chatMessages.map((msg, index) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div
                      key={index}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[80%] p-4 rounded-2xl border text-sm leading-relaxed ${
                        isUser
                          ? "bg-purple-600/15 border-purple-500/30 text-purple-100 rounded-br-none"
                          : "bg-slate-900 border-slate-800 text-slate-300 rounded-bl-none"
                      }`}>
                        <div className="text-[10px] text-slate-500 font-mono mb-1">
                          {isUser ? "You" : "GraphRAG AI"} • {msg.timestamp}
                        </div>
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleChatSubmit} className="p-4 border-t border-slate-800 bg-slate-900/60 flex gap-3">
                <input
                  type="text"
                  placeholder="Ask a mock query to verify layout..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-4 py-2 text-sm text-slate-300 focus:outline-none transition-all"
                />
                <button
                  type="submit"
                  className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition-all shadow-md shadow-purple-500/10"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 10: DEBUG PANEL */}
          {activeTab === "debug" && (
            <div className="max-w-6xl mx-auto flex flex-col gap-6 h-[calc(100vh-12rem)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Execution & Debugger Logs</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Observe execution performance, active logs, response structures, and errors emitted by backend operations.
                  </p>
                </div>
                <button
                  onClick={() => setDebugLogs(["Debugger log cleared."])}
                  className="text-xs font-mono border border-slate-800 hover:bg-slate-950 hover:text-slate-200 text-slate-500 px-3 py-1.5 rounded-lg transition-all"
                >
                  Clear Logs
                </button>
              </div>

              {/* Split view: Logs vs JSON payload */}
              <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
                {/* Left Panel: Stream Logs */}
                <div className="w-full md:w-1/2 border border-slate-800 rounded-2xl bg-slate-900 p-6 flex flex-col h-full min-h-0">
                  <h4 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-purple-400" />
                    Console logs
                  </h4>
                  <div className="flex-1 bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-[11px] text-slate-400 overflow-y-auto space-y-2 select-text whitespace-pre-wrap leading-relaxed">
                    {debugLogs.length === 0 ? (
                      <span className="text-slate-600 italic">No logs generated.</span>
                    ) : (
                      debugLogs.map((log, idx) => (
                        <div key={idx} className="border-b border-slate-900/50 pb-1.5 last:border-none">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Panel: JSON Response & Errors */}
                <div className="w-full md:w-1/2 flex flex-col gap-6 h-full min-h-0">
                  {/* Errors Block */}
                  {debugErrors.length > 0 && (
                    <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 flex gap-3 items-start">
                      <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-rose-400">Emitted errors ({debugErrors.length})</h4>
                        <ul className="text-[10px] font-mono text-rose-300 mt-1 list-disc pl-4 space-y-1">
                          {debugErrors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* JSON viewer */}
                  <div className="flex-1 border border-slate-800 rounded-2xl bg-slate-900 p-6 flex flex-col min-h-0">
                    <h4 className="text-xs font-semibold text-slate-400 mb-3">Latest API JSON response</h4>
                    <div className="flex-1 bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-[11px] text-purple-300 overflow-y-auto select-text whitespace-pre-wrap">
                      {debugRawJSON ? (
                        JSON.stringify(debugRawJSON, null, 2)
                      ) : (
                        <span className="text-slate-600 italic">No request data cached. Run an action like uploading or deleting.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: SETTINGS */}
          {activeTab === "settings" && (
            <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-200">System Config</h3>
                <p className="text-xs text-slate-500 mt-1">Configure workspace parameters and LLM selections.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Model Provider</label>
                  <select className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-purple-500/50">
                    <option>Google Gemini (gemini-1.5-flash)</option>
                    <option>OpenAI (gpt-4o-mini)</option>
                    <option>Ollama (Local LLM)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Chunk Window (chars)</label>
                  <input
                    type="number"
                    defaultValue={800}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Chunk Overlap (chars)</label>
                  <input
                    type="number"
                    defaultValue={100}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
