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
  Sparkles,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  FileJson,
  RefreshCw,
  Layers
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

interface ProcessResult {
  stats: {
    document_size_bytes: number;
    total_raw_characters: number;
    total_cleaned_characters: number;
    total_words: number;
    paragraph_count: number;
    chunk_count: number;
    average_chunk_size: number;
    largest_chunk: number;
    smallest_chunk: number;
  };
  debug: {
    cleaned_text: string;
    paragraphs: string[];
    chunk_boundaries: string;
  };
}

interface ChunkItem {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  character_count: number;
  word_count: number;
  created_at: string;
}

const BACKEND_URL = "http://localhost:8000";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  // Chunking parameters (wired to Settings/Inputs)
  const [chunkSize, setChunkSize] = useState<number>(1000);
  const [chunkOverlap, setChunkOverlap] = useState<number>(200);

  // Chunk selection and explorer states
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [chunkSearch, setChunkSearch] = useState<string>("");
  const [filterChunkIndex, setFilterChunkIndex] = useState<string>("");
  const [filterPageNumber, setFilterPageNumber] = useState<string>("");
  const [filterMinChars, setFilterMinChars] = useState<string>("");
  const [filterMaxChars, setFilterMaxChars] = useState<string>("");

  // Process visualizer tab (raw -> cleaned -> split -> chunk)
  const [visualizerStage, setVisualizerStage] = useState<string>("raw");

  // Pipeline status tracking
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([
    { id: "upload", name: "Upload", status: "idle", description: "Receive file bytes" },
    { id: "parsing", name: "Parsing", status: "idle", description: "Extract raw document text" },
    { id: "cleaning", name: "Cleaning", status: "idle", description: "Filter junk characters & spaces" },
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

  // Fetch chunks for active document
  const { data: chunksData, isFetching: isChunksFetching } = useQuery<{
    chunks: ChunkItem[];
    debug: DebugInfo;
  }>({
    queryKey: ["chunks", selectedDocId],
    queryFn: async () => {
      if (!selectedDocId) return { chunks: [], debug: { execution_time_ms: 0, logs: [], errors: [] } };
      const response = await fetch(`${BACKEND_URL}/documents/${selectedDocId}/chunks`);
      if (!response.ok) throw new Error("Failed to fetch chunks.");
      const res = await response.json();
      updateDebugger(res, `GET /documents/${selectedDocId}/chunks`);
      return res;
    },
    enabled: !!selectedDocId
  });

  const rawChunks = chunksData?.chunks || [];

  // State caching pipeline outputs for statistics panel
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);

  // Process Document Mutation
  const processMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocId) return;
      
      // Update Pipeline: start Cleaning run
      setPipelineStages(prev =>
        prev.map(stage => {
          if (stage.id === "cleaning") return { ...stage, status: "running" };
          return stage;
        })
      );

      // Brief sleep for transition animation
      await new Promise(r => setTimeout(r, 600));

      setPipelineStages(prev =>
        prev.map(stage => {
          if (stage.id === "cleaning") return { ...stage, status: "completed" };
          if (stage.id === "chunking") return { ...stage, status: "running" };
          return stage;
        })
      );

      const response = await fetch(
        `${BACKEND_URL}/documents/${selectedDocId}/process?chunk_size=${chunkSize}&chunk_overlap=${chunkOverlap}`,
        { method: "POST" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        updateDebugger(errorData, "POST /documents/process");
        throw new Error(errorData.detail?.error || "Processing failed");
      }

      const res = await response.json();
      updateDebugger(res, "POST /documents/process");
      return res;
    },
    onSuccess: (data) => {
      setProcessResult(data);
      queryClient.invalidateQueries({ queryKey: ["chunks", selectedDocId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      
      // Complete Pipeline transitions
      setPipelineStages(prev =>
        prev.map(stage => {
          if (stage.id === "cleaning" || stage.id === "chunking" || stage.id === "ready") {
            return { ...stage, status: "completed" };
          }
          return stage;
        })
      );
      
      // Auto select first chunk
      if (data?.debug?.chunks?.length > 0) {
        setSelectedChunkId(data.debug.chunks[0].chunk_id);
      }
    },
    onError: (err: Error) => {
      setPipelineStages(prev =>
        prev.map(stage => {
          if (stage.id === "cleaning" || stage.id === "chunking") {
            return { ...stage, status: "failed" };
          }
          return stage;
        })
      );
      setDebugErrors(prev => [err.message, ...prev]);
    }
  });

  // Delete Chunks Mutation
  const deleteChunksMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocId) return;
      const response = await fetch(`${BACKEND_URL}/documents/${selectedDocId}/chunks`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete chunks.");
      const res = await response.json();
      updateDebugger(res, "DELETE /documents/chunks");
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chunks", selectedDocId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setProcessResult(null);
      setSelectedChunkId(null);
      
      // Reset pipeline state
      setPipelineStages(prev =>
        prev.map(stage => {
          if (stage.id === "cleaning" || stage.id === "chunking" || stage.id === "ready") {
            return { ...stage, status: "idle" };
          }
          return stage;
        })
      );
    }
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
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (selectedDocId === id) {
        setSelectedDocId(null);
        setSelectedChunkId(null);
        setProcessResult(null);
      }
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
        setSelectedChunkId(null);
        setProcessResult(null);
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

  // --- Filtering & Searching logic ---
  const getFilteredChunks = (): ChunkItem[] => {
    let list = rawChunks;

    // Direct match filters
    if (chunkSearch.trim()) {
      const term = chunkSearch.toLowerCase();
      list = list.filter(c => c.content.toLowerCase().includes(term));
    }
    if (filterChunkIndex.trim() !== "") {
      const idx = parseInt(filterChunkIndex);
      if (!isNaN(idx)) {
        list = list.filter(c => c.chunk_index === idx);
      }
    }
    if (filterPageNumber.trim() !== "") {
      const pg = parseInt(filterPageNumber);
      if (!isNaN(pg)) {
        list = list.filter(c => c.page_number === pg);
      }
    }
    if (filterMinChars.trim() !== "") {
      const min = parseInt(filterMinChars);
      if (!isNaN(min)) {
        list = list.filter(c => c.character_count >= min);
      }
    }
    if (filterMaxChars.trim() !== "") {
      const max = parseInt(filterMaxChars);
      if (!isNaN(max)) {
        list = list.filter(c => c.character_count <= max);
      }
    }

    return list;
  };

  const filteredChunks = getFilteredChunks();

  // Find currently selected chunk details
  const activeChunk = rawChunks.find(c => c.chunk_id === selectedChunkId) || filteredChunks[0];

  const handlePrevChunk = () => {
    if (!activeChunk) return;
    const prevIndex = activeChunk.chunk_index - 1;
    const prevChunk = rawChunks.find(c => c.chunk_index === prevIndex);
    if (prevChunk) setSelectedChunkId(prevChunk.chunk_id);
  };

  const handleNextChunk = () => {
    if (!activeChunk) return;
    const nextIndex = activeChunk.chunk_index + 1;
    const nextChunk = rawChunks.find(c => c.chunk_index === nextIndex);
    if (nextChunk) setSelectedChunkId(nextChunk.chunk_id);
  };

  // Highlights search matches in text
  const renderHighlightedContent = (text: string, search: string) => {
    if (!search.trim()) return text;
    const escapedSearch = search.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escapedSearch})`, "gi"));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-yellow-500/30 text-yellow-200 border-b border-yellow-500 px-0.5 rounded-sm">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Download logic helpers
  const downloadChunksJSON = () => {
    if (!rawChunks.length) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rawChunks, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `chunks_${selectedDocId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const downloadChunksTXT = () => {
    if (!rawChunks.length) return;
    let content = "";
    rawChunks.forEach((c) => {
      content += `Chunk ${c.chunk_index + 1}\n====================\n${c.content}\n--------------------\n\n`;
    });
    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `chunks_${selectedDocId}.txt`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Fallback metadata stats calculation
  const getStats = () => {
    if (processResult?.stats) return processResult.stats;
    if (rawChunks.length === 0) return null;
    
    const sizes = rawChunks.map(c => c.character_count);
    const words = rawChunks.reduce((acc, c) => acc + c.word_count, 0);
    const chars = rawChunks.reduce((acc, c) => acc + c.character_count, 0);

    return {
      document_size_bytes: activeDocData?.document?.size || 0,
      total_raw_characters: activeDocData?.extracted_text?.length || 0,
      total_cleaned_characters: chars,
      total_words: words,
      paragraph_count: (activeDocData?.extracted_text || "").split("\n\n").filter(Boolean).length,
      chunk_count: rawChunks.length,
      average_chunk_size: Math.round(chars / rawChunks.length),
      largest_chunk: Math.max(...sizes),
      smallest_chunk: Math.min(...sizes)
    };
  };

  const stats = getStats();

  // Left Sidebar tabs config
  const navItems = [
    { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
    { id: "documents", name: "Documents", icon: FileText },
    { id: "pipeline", name: "Pipeline", icon: GitBranch },
    { id: "chunks", name: "Chunk Explorer", icon: Scissors },
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
            <span className="text-[10px] text-slate-500 font-mono">v0.2.0 (Phase 2)</span>
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
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur-xl px-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-semibold capitalize text-slate-200">
              {activeTab === "chunks" ? "Chunk Explorer" : activeTab}
            </h2>
            <div className="hidden md:flex items-center gap-4 text-xs font-mono text-slate-500">
              <span>DB: <strong className="text-purple-400">Neo4j + Qdrant</strong></span>
              <span>•</span>
              <span>Model: <strong className="text-slate-300">gemini-1.5-flash</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {selectedDocId && (
              <span className="text-xs font-mono px-3 py-1 bg-slate-900 border border-slate-800 text-slate-400 rounded-lg max-w-[220px] truncate">
                Doc: {documents.find(d => d.id === selectedDocId)?.filename || selectedDocId}
              </span>
            )}
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Last Latency: <strong className="text-purple-300">{debugExecutionTime.toFixed(1)}ms</strong></span>
            </div>
          </div>
        </header>

        {/* Workspace Main */}
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
                  <div className="text-3xl font-bold mt-2 text-purple-400">
                    {rawChunks.length > 0 ? rawChunks.length : "0"}
                  </div>
                  <span className="text-[10px] text-purple-400/70 font-mono mt-1 block">Phase 2 chunking ready</span>
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

              {/* Layout splitter */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left col: Workspace Documents */}
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
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4">Uploaded</th>
                            </tr>
                          </thead>
                          <tbody>
                            {documents.slice(0, 5).map(doc => (
                              <tr key={doc.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 text-slate-300">
                                <td className="py-3 px-4 font-medium max-w-[200px] truncate">{doc.filename}</td>
                                <td className="py-3 px-4 text-xs font-mono uppercase text-purple-400">{doc.type}</td>
                                <td className="py-3 px-4 text-xs">{(doc.size / 1024).toFixed(1)} KB</td>
                                <td className="py-3 px-4 text-xs">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                    doc.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" :
                                    "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                                  }`}>
                                    {doc.status}
                                  </span>
                                </td>
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

                {/* Uploaded Files List */}
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
                            onClick={() => {
                              setSelectedDocId(doc.id);
                              setSelectedChunkId(null);
                              setProcessResult(null);
                              
                              if (doc.status === "completed") {
                                setPipelineStages(prev =>
                                  prev.map(stage => {
                                    if (["upload", "parsing", "cleaning", "chunking", "ready"].includes(stage.id)) {
                                      return { ...stage, status: "completed" };
                                    }
                                    return stage;
                                  })
                                );
                              } else {
                                setPipelineStages(prev =>
                                  prev.map(stage => {
                                    if (["upload", "parsing"].includes(stage.id)) {
                                      return { ...stage, status: "completed" };
                                    }
                                    return { ...stage, status: "idle" };
                                  })
                                );
                              }
                            }}
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
                                  {doc.type} • {(doc.size / 1024).toFixed(1)} KB • <span className={doc.status === "completed" ? "text-emerald-400" : "text-amber-400"}>{doc.status}</span>
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
                <h3 className="text-base font-semibold text-slate-200">Visual Pipeline</h3>
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
                      className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-300 ${
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

          {/* TAB 4: CHUNK EXPLORER */}
          {activeTab === "chunks" && (
            <div className="max-w-7xl mx-auto space-y-6">
              
              {/* Header Action Control Bar */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Text Chunking Workbench</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clean raw formatting, split documents by semantic paragraph bounds, and preview chunk fragments.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-300">
                    <span>Size:</span>
                    <input
                      type="number"
                      value={chunkSize}
                      onChange={(e) => setChunkSize(Math.max(10, parseInt(e.target.value) || 0))}
                      className="w-16 bg-slate-900 border border-slate-800 focus:outline-none focus:border-purple-500 px-1.5 py-0.5 rounded text-center"
                    />
                    <span>Overlap:</span>
                    <input
                      type="number"
                      value={chunkOverlap}
                      onChange={(e) => setChunkOverlap(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-16 bg-slate-900 border border-slate-800 focus:outline-none focus:border-purple-500 px-1.5 py-0.5 rounded text-center"
                    />
                  </div>

                  <button
                    disabled={!selectedDocId || processMutation.isPending || isChunksFetching}
                    onClick={() => processMutation.mutate()}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-xs font-semibold rounded-xl text-white transition-all shadow-lg shadow-purple-500/10"
                  >
                    {processMutation.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Scissors className="w-3.5 h-3.5" />
                    )}
                    Process Document
                  </button>

                  <button
                    disabled={!selectedDocId || deleteChunksMutation.isPending || rawChunks.length === 0}
                    onClick={() => deleteChunksMutation.mutate()}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-850 border border-slate-800 hover:bg-rose-950/20 hover:border-rose-900/50 text-slate-400 hover:text-rose-400 disabled:opacity-40 disabled:hover:bg-transparent text-xs font-semibold rounded-xl transition-all"
                  >
                    Clear Chunks
                  </button>

                  {rawChunks.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={downloadChunksJSON}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-mono text-slate-300 rounded-xl transition-all"
                        title="Download Chunks.json"
                      >
                        <FileJson className="w-3.5 h-3.5 text-yellow-500" />
                        JSON
                      </button>
                      <button
                        onClick={downloadChunksTXT}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-mono text-slate-300 rounded-xl transition-all"
                        title="Download Chunks.txt"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-400" />
                        TXT
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {!selectedDocId ? (
                <div className="py-24 rounded-2xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-center">
                  <FileText className="w-12 h-12 text-slate-700 mb-3" />
                  <h3 className="text-base font-semibold text-slate-300">No Document Selected</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Go to the **Documents** tab, select a file, then return to process and explore text chunks.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Active Stats Panel */}
                  {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-8 gap-4">
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">File Size</div>
                        <div className="text-lg font-bold mt-1 text-slate-200">{(stats.document_size_bytes / 1024).toFixed(1)} KB</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">Raw Chars</div>
                        <div className="text-lg font-bold mt-1 text-slate-200">{stats.total_raw_characters}</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">Clean Chars</div>
                        <div className="text-lg font-bold mt-1 text-slate-200">{stats.total_cleaned_characters}</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">Total Words</div>
                        <div className="text-lg font-bold mt-1 text-slate-200">{stats.total_words}</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">Paragraphs</div>
                        <div className="text-lg font-bold mt-1 text-slate-200">{stats.paragraph_count}</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">Chunk Count</div>
                        <div className="text-lg font-bold mt-1 text-purple-400">{stats.chunk_count}</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">Avg Size</div>
                        <div className="text-lg font-bold mt-1 text-slate-200">{Math.round(stats.average_chunk_size)}</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 font-medium uppercase">Min / Max</div>
                        <div className="text-xs font-bold mt-2 text-slate-200 font-mono">
                          {stats.smallest_chunk} / {stats.largest_chunk}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Main explorer column splitter */}
                  {rawChunks.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-slate-850 rounded-2xl bg-slate-900/30 text-slate-500">
                      <Scissors className="w-10 h-10 text-slate-755 mb-3 mx-auto" />
                      <p className="text-sm font-semibold">Document not processed yet.</p>
                      <p className="text-xs text-slate-600 mt-1">Configure chunk parameters and click &quot;Process Document&quot; above to extract fragments.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col lg:flex-row gap-6 h-[500px]">
                      {/* Left: Search, filter bounds, and chunk table list */}
                      <div className="w-full lg:w-2/3 flex flex-col gap-4 h-full">
                        {/* Search & Filter Boxes */}
                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 flex-shrink-0">
                          <div className="relative">
                            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                            <input
                              type="text"
                              value={chunkSearch}
                              onChange={(e) => setChunkSearch(e.target.value)}
                              placeholder="Search text inside chunks (highlights matching words)..."
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-300 focus:outline-none transition-all"
                            />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500">Index:</span>
                              <input
                                type="number"
                                placeholder="Any"
                                value={filterChunkIndex}
                                onChange={(e) => setFilterChunkIndex(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-xs px-2 py-1 rounded text-slate-300"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500">Page:</span>
                              <input
                                type="number"
                                placeholder="Any"
                                value={filterPageNumber}
                                onChange={(e) => setFilterPageNumber(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-xs px-2 py-1 rounded text-slate-300"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500">Min Chars:</span>
                              <input
                                type="number"
                                placeholder="Min"
                                value={filterMinChars}
                                onChange={(e) => setFilterMinChars(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-xs px-2 py-1 rounded text-slate-300"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500">Max Chars:</span>
                              <input
                                type="number"
                                placeholder="Max"
                                value={filterMaxChars}
                                onChange={(e) => setFilterMaxChars(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-xs px-2 py-1 rounded text-slate-300"
                              />
                            </div>
                            <button
                              onClick={() => {
                                setChunkSearch("");
                                setFilterChunkIndex("");
                                setFilterPageNumber("");
                                setFilterMinChars("");
                                setFilterMaxChars("");
                              }}
                              className="text-[10px] font-mono text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20 text-center hover:bg-purple-500/25 transition-all"
                            >
                              Reset Filters
                            </button>
                          </div>
                        </div>

                        {/* Chunk List Table */}
                        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-y-auto relative min-h-0">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-500 bg-slate-950/40 sticky top-0 z-10">
                                <th className="py-2.5 px-4 font-mono w-16">#</th>
                                <th className="py-2.5 px-4 font-mono w-16">Chars</th>
                                <th className="py-2.5 px-4 font-mono w-16">Words</th>
                                <th className="py-2.5 px-4">Content Preview</th>
                                <th className="py-2.5 px-4 font-mono w-16 text-right">Page</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredChunks.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-12 text-center text-slate-500">
                                    No chunks match active search and filter constraints.
                                  </td>
                                </tr>
                              ) : (
                                filteredChunks.map(item => {
                                  const isSelected = selectedChunkId === item.chunk_id;
                                  return (
                                    <tr
                                      key={item.chunk_id}
                                      onClick={() => setSelectedChunkId(item.chunk_id)}
                                      className={`border-b border-slate-800/40 hover:bg-slate-800/40 cursor-pointer text-slate-300 transition-all ${
                                        isSelected ? "bg-purple-600/10 border-l-4 border-l-purple-500 text-slate-200" : ""
                                      }`}
                                    >
                                      <td className="py-2.5 px-4 font-mono">{item.chunk_index + 1}</td>
                                      <td className="py-2.5 px-4 font-mono text-slate-400">{item.character_count}</td>
                                      <td className="py-2.5 px-4 font-mono text-slate-400">{item.word_count}</td>
                                      <td className="py-2.5 px-4 truncate max-w-[200px] text-slate-200">
                                        {chunkSearch.trim() ? (
                                          renderHighlightedContent(item.content.slice(0, 100), chunkSearch)
                                        ) : (
                                          item.content.slice(0, 100) + (item.content.length > 100 ? "..." : "")
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 font-mono text-right text-slate-500">
                                        {item.page_number !== null ? item.page_number : "—"}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Right: Selected Chunk detail Viewer panel */}
                      <div className="w-full lg:w-1/3 border border-slate-800 rounded-xl bg-slate-900 p-6 flex flex-col h-full min-h-0">
                        {activeChunk ? (
                          <div className="flex flex-col h-full min-h-0">
                            {/* Panel Header */}
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
                              <div>
                                <h4 className="text-xs font-semibold text-slate-200">
                                  Chunk Content View
                                </h4>
                                <span className="text-[10px] font-mono text-slate-500">
                                  Index: #{activeChunk.chunk_index + 1} / {rawChunks.length}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <button
                                  disabled={activeChunk.chunk_index === 0}
                                  onClick={handlePrevChunk}
                                  className="p-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40"
                                >
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={activeChunk.chunk_index === rawChunks.length - 1}
                                  onClick={handleNextChunk}
                                  className="p-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Stats tag list */}
                            <div className="grid grid-cols-3 gap-2 py-3 border-b border-slate-800/60 text-center text-[10px] font-mono text-slate-400 flex-shrink-0">
                              <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                                Chars: <span className="text-slate-200 font-bold">{activeChunk.character_count}</span>
                              </div>
                              <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                                Words: <span className="text-slate-200 font-bold">{activeChunk.word_count}</span>
                              </div>
                              <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                                Page: <span className="text-slate-200 font-bold">{activeChunk.page_number !== null ? activeChunk.page_number : "N/A"}</span>
                              </div>
                            </div>

                            {/* Main chunk text content block */}
                            <div className="flex-1 bg-slate-950 border border-slate-800/80 p-4 rounded-xl font-mono text-xs overflow-y-auto leading-relaxed text-slate-300 mt-4 select-text whitespace-pre-wrap">
                              {renderHighlightedContent(activeChunk.content, chunkSearch)}
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center">
                            <Scissors className="w-8 h-8 text-slate-750 mb-2" />
                            <p className="text-xs">Select a chunk row to view content</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Visualizer & Process Steps container */}
                  {rawChunks.length > 0 && (
                    <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-purple-400" />
                          Ingestion Step Visualizer (Raw Text ➔ Cleaned Text ➔ Paragraph Segmentation ➔ Chunk Boundaries)
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Inspect the structural text transformations performed by the backend service.
                        </p>
                      </div>

                      {/* Selector buttons */}
                      <div className="flex gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl self-start w-fit">
                        {[
                          { id: "raw", name: "1. Raw Text" },
                          { id: "clean", name: "2. Cleaned Text" },
                          { id: "paragraphs", name: "3. Paragraph Splits" },
                          { id: "boundaries", name: "4. Chunk Boundaries" }
                        ].map(step => (
                          <button
                            key={step.id}
                            onClick={() => setVisualizerStage(step.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                              visualizerStage === step.id
                                ? "bg-purple-600 text-white"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {step.name}
                          </button>
                        ))}
                      </div>

                      {/* Visualizer viewport */}
                      <div className="h-64 bg-slate-950 border border-slate-800/80 p-4 rounded-xl font-mono text-[11px] text-slate-300 overflow-y-auto leading-relaxed select-text whitespace-pre-wrap">
                        {visualizerStage === "raw" && (
                          activeDocData?.extracted_text || "No text available."
                        )}
                        {visualizerStage === "clean" && (
                          processResult?.debug?.cleaned_text || 
                          (rawChunks.length > 0 ? rawChunks.map(c => c.content).join(" ") : "No cleaned text cached.")
                        )}
                        {visualizerStage === "paragraphs" && (
                          processResult?.debug?.paragraphs ? (
                            processResult.debug.paragraphs.map((p: string, i: number) => (
                              <div key={i} className="mb-4 p-3 bg-slate-900/60 border border-slate-850 rounded-lg">
                                <span className="text-[9px] text-purple-400 font-bold block mb-1">Paragraph #{i+1}</span>
                                {p}
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-500 italic">Paragraph structure details are cached on process click.</span>
                          )
                        )}
                        {visualizerStage === "boundaries" && (
                          processResult?.debug?.chunk_boundaries || 
                          "No boundaries calculated. Please re-run process to display."
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Chunk Size (chars)</label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Math.max(10, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Chunk Overlap (chars)</label>
                  <input
                    type="number"
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(Math.max(0, parseInt(e.target.value) || 0))}
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
