import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  Sparkles,
  Cpu,
  Layers,
  Download,
  Copy,
  Check,
  BookOpen,
  Table as TableIcon,
  Terminal,
  HelpCircle,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
  ArrowRight,
  Database,
  Sliders,
  Filter,
  MessageSquare,
  GraduationCap,
  X,
  FolderArchive,
  Code2,
} from 'lucide-react';
import { KnowledgeBaseData, SampleDoc, RAGChunk } from './types';
import { JsonViewer } from './components/JsonViewer';
import { TableView } from './components/TableView';
import { StudySuite } from './components/StudySuite';
import { DocChatCopilot } from './components/DocChatCopilot';
import { OneLineDigestView } from './components/OneLineDigestView';
import { extractTextFromPDFFile } from './utils/pdfExtractor';

export default function App() {
  const [activeInputTab, setActiveInputTab] = useState<'upload' | 'samples' | 'text'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [samples, setSamples] = useState<SampleDoc[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('ai-agents-spec');
  
  // Settings
  const [useAI, setUseAI] = useState(true);
  const [chunkSize, setChunkSize] = useState('350');
  
  // Processing & State
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeData, setKnowledgeData] = useState<KnowledgeBaseData | null>(null);
  const [resultTab, setResultTab] = useState<
    'one_line_digest' | 'chat_copilot' | 'study_suite' | 'overview' | 'json' | 'chunks' | 'tables' | 'markdown' | 'qa_benchmark'
  >('one_line_digest');
  
  // Interactive features
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [qaSearchQuery, setQaSearchQuery] = useState('');
  const [copilotQuestion, setCopilotQuestion] = useState<string | undefined>(undefined);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sample docs on mount
  useEffect(() => {
    fetch('/api/sample-docs')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.samples) {
          setSamples(data.samples);
        }
      })
      .catch((err) => console.error('Failed to load samples:', err));
  }, []);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please drop a valid .pdf file.');
      }
    }
  };

  // Convert submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setExtractionStatus(null);
    setLoading(true);
    setLoadingStep(1);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 700);

    try {
      let response: Response;

      // Case 1: Upload tab with file
      if (activeInputTab === 'upload') {
        if (!selectedFile) {
          throw new Error('Please select a PDF file to upload.');
        }

        const isLargeFile = selectedFile.size > 20 * 1024 * 1024; // > 20MB (e.g. 74MB textbooks)

        if (isLargeFile) {
          setExtractionStatus(`Processing large PDF (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB) using in-browser streaming...`);
          const extracted = await extractTextFromPDFFile(selectedFile, (curr, total) => {
            setExtractionStatus(`Extracting text from PDF in browser: Page ${curr} of ${total}...`);
          });

          setExtractionStatus('Structuring semantic Knowledge Base...');
          response = await fetch('/api/convert-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: useAI ? 'ai' : 'heuristic',
              chunkSize,
              rawText: extracted.text,
              fileName: selectedFile.name,
              totalPages: extracted.totalPages,
              pdfMetadata: extracted.metadata,
            }),
          });
        } else {
          // Direct file upload for standard files
          const formData = new FormData();
          formData.append('mode', useAI ? 'ai' : 'heuristic');
          formData.append('chunkSize', chunkSize);
          formData.append('pdfFile', selectedFile);

          response = await fetch('/api/convert-pdf', {
            method: 'POST',
            body: formData,
          });

          // If direct upload fails due to payload limits, fallback to client-side extraction
          if (response.status === 413 || !response.ok) {
            setExtractionStatus(`Direct upload exceeded threshold. Switching to in-browser extraction...`);
            const extracted = await extractTextFromPDFFile(selectedFile, (curr, total) => {
              setExtractionStatus(`Extracting text in browser: Page ${curr} of ${total}...`);
            });

            response = await fetch('/api/convert-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mode: useAI ? 'ai' : 'heuristic',
                chunkSize,
                rawText: extracted.text,
                fileName: selectedFile.name,
                totalPages: extracted.totalPages,
                pdfMetadata: extracted.metadata,
              }),
            });
          }
        }
      } else if (activeInputTab === 'samples') {
        // Case 2: Pre-built samples
        const formData = new FormData();
        formData.append('mode', useAI ? 'ai' : 'heuristic');
        formData.append('chunkSize', chunkSize);
        formData.append('sampleId', selectedSampleId);

        response = await fetch('/api/convert-pdf', {
          method: 'POST',
          body: formData,
        });
      } else {
        // Case 3: Raw text
        if (!rawText.trim()) {
          throw new Error('Please enter document text to convert.');
        }
        response = await fetch('/api/convert-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: useAI ? 'ai' : 'heuristic',
            chunkSize,
            rawText,
            fileName: 'manual-input-document.txt',
          }),
        });
      }

      // Safe JSON response parsing
      const textResponse = await response.text();
      let json: any;
      try {
        json = JSON.parse(textResponse);
      } catch (parseErr) {
        if (response.status === 413 || textResponse.includes('413') || textResponse.includes('Too Large')) {
          throw new Error(`File size is too large for web server proxy. In-browser streaming will process it directly.`);
        }
        throw new Error(`Server returned HTTP ${response.status}: Unexpected response received.`);
      }

      clearInterval(stepInterval);

      if (json.success && json.data) {
        setKnowledgeData(json.data);
        setResultTab('one_line_digest');
      } else {
        throw new Error(json.error || 'Failed to process document');
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error(err);
      setError(err.message || 'An error occurred during conversion');
    } finally {
      setLoading(false);
      setLoadingStep(0);
      setExtractionStatus(null);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const downloadFile = (content: string, filename: string, type = 'application/json') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">SemantiDoc</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  PDF to AI Knowledge Base
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Convert messy PDFs into structured JSON, Markdown & RAG vector chunks
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 transition-all border border-indigo-400/30 cursor-pointer active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download for VS Code (.ZIP)</span>
            </button>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Dual Engine Active
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            AI RAG & Semantic Document Ingestion Engine
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Convert Unstructured PDFs to <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">AI Structured JSON</span>
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Standard converters shatter tables and headings. SemantiDoc intelligently isolates section hierarchies, builds 512-token RAG chunks with overlap, parses tabular data matrices, and outputs clean JSON & Markdown for vector databases.
          </p>
        </div>

        {/* Input Configuration & Upload Box */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-3 gap-3">
            {[
              { id: 'upload', label: 'Upload PDF Document', icon: UploadCloud },
              { id: 'samples', label: 'Try Sample Documents (1-Click)', icon: BookOpen },
              { id: 'text', label: 'Paste Raw Document Text', icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeInputTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveInputTab(tab.id as any);
                    setError(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
                    isActive
                      ? 'border-indigo-500 text-indigo-400 bg-slate-900'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-6 space-y-6">
            {/* Tab 1: Upload PDF */}
            {activeInputTab === 'upload' && (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                  selectedFile
                    ? 'border-indigo-500/80 bg-indigo-950/20'
                    : 'border-slate-700/80 hover:border-indigo-500/60 bg-slate-950/30 hover:bg-slate-900/50'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                      setError(null);
                    }
                  }}
                  accept=".pdf"
                  className="hidden"
                />

                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <UploadCloud className="w-7 h-7" />
                </div>

                {selectedFile ? (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-white flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      {selectedFile.name}
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs text-indigo-300">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                      {selectedFile.size > 20 * 1024 * 1024 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ⚡ Large PDF In-Browser Streaming Mode
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                          Direct Ready
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 pt-2">Click or drag another file to replace</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-slate-200">
                      Click to browse or drag and drop your PDF here
                    </p>
                    <p className="text-xs text-slate-500">
                      Supports Textbooks, Research Papers, Financial Reports (Any size up to 100MB+)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Sample Documents */}
            {activeInputTab === 'samples' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Pick one of these pre-configured documents to test the semantic parser instantly without needing a local file:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {samples.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSampleId(s.id)}
                      className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                        selectedSampleId === s.id
                          ? 'border-indigo-500 bg-indigo-950/30 shadow-md ring-1 ring-indigo-500'
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                          {s.category}
                        </span>
                        <span className="text-xs text-slate-500">{s.pages} Pages</span>
                      </div>
                      <h4 className="text-sm font-semibold text-white mb-1">{s.name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: Raw Text */}
            {activeInputTab === 'text' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Paste Document Text / Markdown
                </label>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste research sections, raw document notes, or report content here..."
                  className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                ></textarea>
              </div>
            )}

            {/* Parsing Options */}
            <div className="flex flex-wrap items-center justify-between pt-4 border-t border-slate-800/80 gap-4">
              <div className="flex flex-wrap items-center gap-6">
                {/* AI Toggle */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAI}
                    onChange={(e) => setUseAI(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      Gemini 3.8 Flash AI Enrichment
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Extracts Executive Summary, Entities, Tables & Q&A
                    </span>
                  </div>
                </label>

                {/* Chunk Size */}
                <div className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-300">Target RAG Chunk Size:</span>
                  <select
                    value={chunkSize}
                    onChange={(e) => setChunkSize(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="250">250 tokens (High Granularity)</option>
                    <option value="350">350 tokens (Balanced Standard)</option>
                    <option value="512">512 tokens (OpenAI / Cohere RAG)</option>
                    <option value="1000">1000 tokens (Large Context)</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={() => handleSubmit()}
                disabled={loading}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Processing Document...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Convert to Semantic Knowledge Base</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                {error}
              </div>
            )}

            {/* Dynamic Step Loader */}
            {loading && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs text-indigo-300">
                  <span className="font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 animate-spin text-indigo-400" />
                    {extractionStatus || 'Analyzing semantic token structures...'}
                  </span>
                  <span className="font-mono text-slate-400">
                    {extractionStatus ? '⚡ Streaming Text' : `Step ${loadingStep} of 4`}
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(loadingStep / 4) * 100}%` }}
                  ></div>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  {extractionStatus ? (
                    <span className="text-emerald-400">⚡ Client-side stream engine active: bypasses server payload limits and extracts full text cleanly.</span>
                  ) : (
                    <>
                      {loadingStep === 1 && 'Ingesting binary PDF buffers and extracting raw tokens...'}
                      {loadingStep === 2 && 'Detecting headings, paragraph hierarchies, and tabular matrices...'}
                      {loadingStep === 3 && 'Partitioning semantic RAG chunks with 15% sliding window overlap...'}
                      {loadingStep === 4 && 'Generating executive insights, entities, and synthetic benchmark Q&A...'}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results Workspace */}
        {knowledgeData && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Document Type', value: knowledgeData.documentInfo.documentType, icon: FileText, color: 'text-indigo-400' },
                { label: 'Total Pages', value: knowledgeData.documentInfo.totalPages, icon: Layers, color: 'text-sky-400' },
                { label: 'Total Words', value: knowledgeData.documentInfo.totalWords.toLocaleString(), icon: Database, color: 'text-purple-400' },
                { label: 'Est. Tokens', value: `~${knowledgeData.documentInfo.estimatedTokens.toLocaleString()}`, icon: Cpu, color: 'text-amber-400' },
                { label: 'RAG Chunks', value: knowledgeData.ragChunks.length, icon: Layers, color: 'text-emerald-400' },
                { label: 'Tables Found', value: knowledgeData.extractedTables.length, icon: TableIcon, color: 'text-pink-400' },
              ].map((m, idx) => {
                const Icon = m.icon;
                return (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 shadow-sm">
                    <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                      <span>{m.label}</span>
                      <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                    </div>
                    <div className="text-sm font-bold text-white truncate">{m.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Results Navigation Bar */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/40 px-2 rounded-t-xl gap-2">
              <div className="flex flex-wrap gap-1">
                {[
                  { id: 'one_line_digest', label: '⚡ 1-Line Summaries (ایک سطری خلاصہ)', icon: Zap, highlight: true },
                  { id: 'chat_copilot', label: '🎙️ Voice & AI Copilot (آڈیو سوال و جواب)', icon: MessageSquare, highlight: true },
                  { id: 'study_suite', label: `🎓 Study Suite (${knowledgeData.flashcards?.length || 0} Cards, ${knowledgeData.quizQuestions?.length || 0} MCQs)`, icon: GraduationCap },
                  { id: 'overview', label: '📋 Executive Summary', icon: BookOpen },
                  { id: 'json', label: '💾 Structured JSON', icon: Database },
                  { id: 'chunks', label: `🧩 RAG Chunks (${knowledgeData.ragChunks.length})`, icon: Layers },
                  { id: 'tables', label: `📊 Tables (${knowledgeData.extractedTables.length})`, icon: TableIcon },
                  { id: 'markdown', label: '📝 Markdown Knowledge Base', icon: FileText },
                  { id: 'qa_benchmark', label: `❓ Q&A Ground Truth (${knowledgeData.qaDataset.length})`, icon: HelpCircle },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = resultTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setResultTab(t.id as any)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 ${
                        isActive
                          ? 'border-indigo-500 text-indigo-400 bg-slate-900 shadow-sm'
                          : t.highlight
                          ? 'border-transparent text-indigo-300 hover:text-white hover:bg-slate-900/60'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Universal Export Buttons */}
              <div className="flex items-center gap-2 py-2">
                <button
                  onClick={() =>
                    downloadFile(
                      JSON.stringify(knowledgeData, null, 2),
                      `${knowledgeData.documentInfo.fileName.replace(/\.pdf$/i, '')}-structured-knowledge.json`
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Full JSON</span>
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-b-xl p-6 shadow-sm">
              {/* Tab: 1-Line Bite-Sized Summaries & Page Digest */}
              {resultTab === 'one_line_digest' && (
                <OneLineDigestView
                  pageDigest={knowledgeData.pageDigest || []}
                  structuredSections={knowledgeData.structuredSections || []}
                  documentTitle={knowledgeData.documentInfo.title}
                  onAskCopilot={(q) => {
                    setCopilotQuestion(q);
                    setResultTab('chat_copilot');
                  }}
                />
              )}

              {/* Tab: AI Book Copilot */}
              {resultTab === 'chat_copilot' && (
                <DocChatCopilot
                  documentContext={knowledgeData.markdownRepresentation}
                  documentTitle={knowledgeData.documentInfo.title}
                  fileName={knowledgeData.documentInfo.fileName}
                  initialQuestion={copilotQuestion}
                />
              )}

              {/* Tab: Study Suite (Flashcards, Exam Quiz, Cheat Sheet) */}
              {resultTab === 'study_suite' && (
                <StudySuite
                  flashcards={knowledgeData.flashcards || []}
                  quizQuestions={knowledgeData.quizQuestions || []}
                  cheatSheet={knowledgeData.cheatSheet || []}
                  documentTitle={knowledgeData.documentInfo.title}
                />
              )}

              {/* Tab: Overview */}
              {resultTab === 'overview' && (
                <div className="space-y-6">
                  {/* Executive Summary */}
                  <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        Executive Summary & Document Intent
                      </h3>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        Engine: {knowledgeData.engine}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-line">
                      {knowledgeData.executiveSummary}
                    </p>
                  </div>

                  {/* Key Takeaways */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Key Takeaways & Core Insights
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {knowledgeData.keyTakeaways.map((point, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-start gap-3"
                        >
                          <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed">{point}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Identified Entities */}
                  {knowledgeData.keyEntities.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Extracted Entities & Taxonomy
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {knowledgeData.keyEntities.map((ent, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                          >
                            <span className="font-semibold text-white">{ent.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              {ent.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section Outline */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Hierarchical Section Outline ({knowledgeData.structuredSections.length} sections)
                    </h3>
                    <div className="space-y-2">
                      {knowledgeData.structuredSections.map((sec, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/50 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-500">#{idx + 1}</span>
                            <span className="text-xs font-semibold text-white">{sec.title}</span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {sec.items.length} paragraphs / items
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Structured JSON */}
              {resultTab === 'json' && (
                <JsonViewer
                  data={knowledgeData}
                  filename={`${knowledgeData.documentInfo.fileName.replace(/\.pdf$/i, '')}-knowledge-base.json`}
                />
              )}

              {/* Tab: RAG Chunks */}
              {resultTab === 'chunks' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">RAG Embeddings Chunks</h3>
                      <p className="text-xs text-slate-400">
                        Segmented with sliding window context preservation. Ready for Pinecone, Chroma, Qdrant, pgvector.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        downloadFile(
                          JSON.stringify(knowledgeData.ragChunks, null, 2),
                          `rag-chunks-${knowledgeData.documentInfo.fileName}.json`
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Chunks JSON</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {knowledgeData.ragChunks.map((chunk) => (
                      <div
                        key={chunk.chunkId}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                          <span className="font-mono text-indigo-400 font-semibold">{chunk.chunkId}</span>
                          <span className="text-slate-400">~{chunk.tokenCount} tokens ({chunk.characterCount} chars)</span>
                        </div>
                        <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed line-clamp-6">
                          {chunk.content}
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                          <span className="truncate max-w-[180px]">Section: {chunk.section}</span>
                          <button
                            onClick={() => copyText(chunk.content, chunk.chunkId)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                          >
                            {copiedKey === chunk.chunkId ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedKey === chunk.chunkId ? 'Copied' : 'Copy Chunk'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Tables */}
              {resultTab === 'tables' && (
                <TableView tables={knowledgeData.extractedTables} />
              )}

              {/* Tab: Markdown */}
              {resultTab === 'markdown' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Clean Markdown Knowledge Representation</h3>
                      <p className="text-xs text-slate-400">
                        Normalized heading levels and formatted tables ready for Obsidian, Notion, or LLM system context.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyText(knowledgeData.markdownRepresentation, 'markdown-copy')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      >
                        {copiedKey === 'markdown-copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'markdown-copy' ? 'Copied' : 'Copy MD'}</span>
                      </button>
                      <button
                        onClick={() =>
                          downloadFile(
                            knowledgeData.markdownRepresentation,
                            `${knowledgeData.documentInfo.fileName.replace(/\.pdf$/i, '')}-knowledge-base.md`,
                            'text/markdown'
                          )
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .md</span>
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-auto">
                    {knowledgeData.markdownRepresentation}
                  </pre>
                </div>
              )}

              {/* Tab: QA Benchmark */}
              {resultTab === 'qa_benchmark' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-white">Synthetic RAG Verification Pairs</h3>
                    <p className="text-xs text-slate-400">
                      Use these extracted question-answer pairs with exact citation snippets to test your vector search recall and LLM hallucinations.
                    </p>
                  </div>

                  {/* Interactive Query Tester */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <label className="text-xs font-semibold text-slate-300">
                      Test Query Against Document Chunks:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={qaSearchQuery}
                        onChange={(e) => setQaSearchQuery(e.target.value)}
                        placeholder="Type a keyword or question (e.g. 'Operating income', 'Sandbox', 'Threshold')..."
                        className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      {qaSearchQuery && (
                        <button
                          onClick={() => setQaSearchQuery('')}
                          className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-400 hover:text-white"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {qaSearchQuery && (
                      <div className="mt-3 space-y-2">
                        <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                          Matching Document Evidence:
                        </span>
                        {knowledgeData.ragChunks
                          .filter((c) => c.content.toLowerCase().includes(qaSearchQuery.toLowerCase()))
                          .slice(0, 3)
                          .map((chunk) => (
                            <div key={chunk.chunkId} className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-xs">
                              <span className="font-mono text-indigo-400 text-[10px] block mb-1">{chunk.chunkId} - {chunk.section}</span>
                              <p className="text-slate-300 font-mono text-[11px]">{chunk.content.slice(0, 250)}...</p>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Q&A Cards */}
                  <div className="space-y-4">
                    {knowledgeData.qaDataset.map((qa, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                          <span className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">
                            Q{idx + 1}
                          </span>
                          <span>{qa.question}</span>
                        </div>
                        <div className="pl-7 text-xs text-slate-300 leading-relaxed">
                          <strong className="text-slate-400">Answer:</strong> {qa.answer}
                        </div>
                        {qa.citationSnippet && (
                          <div className="pl-7 text-[11px] text-slate-500 font-mono bg-slate-900/50 p-2 rounded border border-slate-800/40 mt-1">
                            <span className="text-slate-400 font-semibold">Citation Evidence: </span>
                            "{qa.citationSnippet}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VS Code Download & Setup Modal */}
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <FolderArchive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Download & Run in VS Code
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                        Ready
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      مکمل پروجیکٹ ڈاؤنلوڈ کریں اور اپنے کمپیوٹر پر VS Code میں چلائیں
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 text-sm">
                {/* 1-Click Direct Download Banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/70 via-purple-950/50 to-slate-900 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                  <div>
                    <h4 className="font-semibold text-white text-sm flex items-center gap-2">
                      <Download className="w-4 h-4 text-indigo-400" />
                      طریقہ 1: براہِ راست زِپ فائل ڈاؤنلوڈ (Direct Download)
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">
                      تمام سورس فائلز، ریڈمی گائیڈ اور کنفگریشن ایک ہی زِپ میں حاصل کریں
                    </p>
                  </div>
                  <a
                    href="/api/download-project-zip"
                    download="semantidoc-project.zip"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-95 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    Download .ZIP (79 KB)
                  </a>
                </div>

                {/* AI Studio Built-in Download explanation */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                  <div className="font-semibold text-slate-200 flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-purple-400" />
                    طریقہ 2: Google AI Studio کے اوپری بار سے ڈاؤنلوڈ
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    AI Studio اسکرین کے <strong className="text-white">سب سے اوپری دائیں کونے (Top-Right Corner)</strong> میں دیکھیں، جہاں شیئر (Share) کا بٹن ہے، وہیں ساتھ میں <strong className="text-indigo-400">Download Code / Export</strong> کا آئیکون یا تین نقطے <strong className="text-slate-200">(⋮)</strong> موجود ہیں۔ اس پر کلک کر کے بھی زِپ ڈاؤنلوڈ کی جا سکتی ہے۔
                  </p>
                </div>

                {/* Step-by-Step Instructions */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider text-slate-400">
                    VS Code میں چلانے کے آسان مراحل (Step-by-Step Guide):
                  </h4>

                  <div className="space-y-2.5">
                    {/* Step 1 */}
                    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-white">زِپ فائل ان زِپ کریں (Extract ZIP)</p>
                        <p className="text-slate-400">
                          ڈاؤنلوڈ ہونے کے بعد <code className="text-indigo-300 bg-slate-900 px-1.5 py-0.5 rounded">semantidoc-project.zip</code> پر رائٹ کلک کر کے Extract کر لیں۔
                        </p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-white">VS Code میں فولڈر کھولیں (Open in VS Code)</p>
                        <p className="text-slate-400">
                          VS Code کھولیں اور <strong className="text-white">File ➔ Open Folder</strong> کر کے ایکسٹریکٹ کیا ہوا فولڈر سلیکٹ کریں۔
                        </p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="text-xs space-y-1.5 flex-1">
                        <p className="font-semibold text-white">ٹرمینل کھولیں اور پیکجز انسٹال کریں (npm install)</p>
                        <p className="text-slate-400">
                          ٹرمینل میں یہ کمانڈ چلائیں:
                        </p>
                        <div className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded font-mono text-[11px] text-emerald-400 border border-slate-800">
                          <span>npm install</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText('npm install');
                              setCopiedKey('cmd-install');
                              setTimeout(() => setCopiedKey(null), 2000);
                            }}
                            className="text-slate-400 hover:text-white"
                          >
                            {copiedKey === 'cmd-install' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        4
                      </div>
                      <div className="text-xs space-y-1.5 flex-1">
                        <p className="font-semibold text-white">پروجیکٹ اسٹارٹ کریں (npm run dev)</p>
                        <p className="text-slate-400">
                          ٹرمینل میں یہ کمانڈ لکھیں اور انٹر دبائیں:
                        </p>
                        <div className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded font-mono text-[11px] text-emerald-400 border border-slate-800">
                          <span>npm run dev</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText('npm run dev');
                              setCopiedKey('cmd-run');
                              setTimeout(() => setCopiedKey(null), 2000);
                            }}
                            className="text-slate-400 hover:text-white"
                          >
                            {copiedKey === 'cmd-run' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Step 5 */}
                    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        5
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-white">براؤزر میں کھولیں (Open Browser)</p>
                        <p className="text-slate-400">
                          براؤزر میں جائیں اور اوپن کریں: <strong className="text-indigo-400 font-mono">http://localhost:3000</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  فائل کے اندر مکمل تفصیلات کے ساتھ README.md بھی موجود ہے
                </span>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  Close / بند کریں
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>SemantiDoc • High-Precision PDF to AI Knowledge Base Engine</p>
          <p className="text-slate-600">Enterprise Semantic Extraction • RAG-Ready Chunks • JSON & Markdown</p>
        </div>
      </footer>
    </div>
  );
}
