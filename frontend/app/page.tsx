import React from "react";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center overflow-hidden font-sans">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center text-center px-4 max-w-4xl">
        {/* Glow Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-medium mb-8 backdrop-blur-md animate-pulse">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          Phase 0: Project Foundation Active
        </div>

        {/* Hero Title */}
        <h1 className="text-6xl sm:text-8xl font-black tracking-tight bg-gradient-to-b from-white via-slate-200 to-slate-500 bg-clip-text text-transparent drop-shadow-sm select-none">
          GraphRAG
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl font-light leading-relaxed">
          A production-grade, highly scalable Graph Retrieval-Augmented Generation pipeline. Linking knowledge graphs with vector embeddings for deep contextual intelligence.
        </p>

        {/* Action Button & Status Info */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            Explore API Documentation
          </a>
          <span className="text-sm text-slate-500 font-mono">
            Backend: <code className="text-emerald-400">running</code>
          </span>
        </div>

        {/* Feature Cards Grid (Phase 1+ Preview) */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl hover:border-slate-700/50 transition-all duration-300 hover:scale-[1.02] group">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 font-bold group-hover:bg-blue-500/20 transition-all">
              V
            </div>
            <h3 className="text-lg font-semibold text-slate-200">Vector Engine</h3>
            <p className="mt-2 text-sm text-slate-400 font-light leading-normal">
              High-dimensional dense embeddings stored and retrieved via Qdrant&apos;s vector indexing.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl hover:border-slate-700/50 transition-all duration-300 hover:scale-[1.02] group">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 font-bold group-hover:bg-purple-500/20 transition-all">
              G
            </div>
            <h3 className="text-lg font-semibold text-slate-200">Knowledge Graph</h3>
            <p className="mt-2 text-sm text-slate-400 font-light leading-normal">
              Structured entity extraction, relationships, and global community hierarchies stored in Neo4j.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl hover:border-slate-700/50 transition-all duration-300 hover:scale-[1.02] group">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 font-bold group-hover:bg-indigo-500/20 transition-all">
              R
            </div>
            <h3 className="text-lg font-semibold text-slate-200">Hybrid Search</h3>
            <p className="mt-2 text-sm text-slate-400 font-light leading-normal">
              Advanced local and global query synthesizers merging graph structures with vector contexts.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 text-xs text-slate-600 font-mono">
        GraphRAG © {new Date().getFullYear()} • Powered by Clean Architecture & Next.js
      </footer>
    </div>
  );
}
