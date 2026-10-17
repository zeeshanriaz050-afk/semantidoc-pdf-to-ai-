import React, { useState } from 'react';
import {
  Zap,
  Sparkles,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Search,
  Filter,
  ArrowRight,
  BookOpen,
  MessageSquare,
  HelpCircle,
  FileText,
  CornerDownRight,
  Send,
  RefreshCw,
} from 'lucide-react';
import { PageDigestItem, StructuredSection, OneLineSummaryResult } from '../types';

interface OneLineDigestViewProps {
  pageDigest: PageDigestItem[];
  structuredSections: StructuredSection[];
  documentTitle: string;
  onAskCopilot?: (question: string) => void;
}

export const OneLineDigestView: React.FC<OneLineDigestViewProps> = ({
  pageDigest = [],
  structuredSections = [],
  documentTitle,
  onAskCopilot,
}) => {
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [displayMode, setDisplayMode] = useState<'crisp_1line' | 'expanded'>('crisp_1line');

  // Audio Speech state
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Custom long text / question 1-line converter
  const [customInput, setCustomInput] = useState('');
  const [customSummarizing, setCustomSummarizing] = useState(false);
  const [customResult, setCustomResult] = useState<OneLineSummaryResult | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  // Pre-fill quick sample long questions
  const sampleLongQuestions = [
    'What is the ultimate core conclusion of this entire document?',
    'Summarize Page 1 in strictly one easy sentence.',
    'Explain the most complicated formula or law mentioned in 1 line.',
  ];

  // Text to speech helper
  const handleSpeak = (text: string, id: string) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#`_]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    window.speechSynthesis.speak(utterance);
    setSpeakingId(id);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Convert custom long question/text to 1 line
  const handleSummarizeCustom = async (textToUse?: string) => {
    const text = (textToUse || customInput).trim();
    if (!text || customSummarizing) return;

    setCustomSummarizing(true);
    setCustomError(null);

    try {
      const res = await fetch('/api/summarize-to-one-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text.endsWith('?') ? text : undefined,
          text: !text.endsWith('?') ? text : undefined,
          documentTitle,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setCustomResult(data.data);
      } else {
        throw new Error(data.error || 'Failed to summarize');
      }
    } catch (err: any) {
      setCustomError(err.message || 'Error creating 1-line summary');
    } finally {
      setCustomSummarizing(false);
    }
  };

  // Build unified page / section list
  const digestItems: PageDigestItem[] =
    pageDigest && pageDigest.length > 0
      ? pageDigest
      : structuredSections.map((sec, idx) => ({
          id: idx + 1,
          label: sec.title,
          oneLineSummary: sec.items[0]?.text
            ? `${sec.items[0].text.split(/[.!?]\s+/)[0] || sec.items[0].text.slice(0, 120)}.`
            : `Presents the fundamental principles and operational framework of ${sec.title}.`,
          simpleExplanation: `In plain words: this section covers the practical rules and core definitions of ${sec.title}.`,
          keyTags: [sec.title.split(' ')[0] || 'Core', 'Page ' + (idx + 1)],
          urduExplanation: `یہ حصہ بنیادی طور پر ${sec.title} کے اہم اصول اور وضاحت بیان کرتا ہے۔`,
        }));

  // Tags list
  const allTags = Array.from(new Set(digestItems.flatMap((item) => item.keyTags || [])));

  // Filtered items
  const filteredItems = digestItems.filter((item) => {
    const matchesSearch =
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.oneLineSummary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.simpleExplanation.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTag = selectedTag === 'all' || item.keyTags?.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900 border border-indigo-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
              <Zap className="w-4 h-4 text-amber-400" />
            </span>
            <h3 className="text-sm font-bold text-white">
              Instant 1-Line Bite-Sized Summaries (ایک سطری خلاصہ)
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Every Page & Topic Condensed
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Convert long paragraphs, difficult chapters, and complex questions into crystal-clear 1-line answers you can grasp in 5 seconds.
          </p>
        </div>

        {/* Display mode toggle */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 shrink-0 text-xs">
          <button
            onClick={() => setDisplayMode('crisp_1line')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              displayMode === 'crisp_1line'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Strict 1-Line (1 سطر)
          </button>
          <button
            onClick={() => setDisplayMode('expanded')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              displayMode === 'expanded'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📖 1-Line + Plain Explanation
          </button>
        </div>
      </div>

      {/* 1. Custom Long Question / Text 1-Line Summarizer Tool */}
      <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Condense Any Long Question or Text into a 1-Line Answer (لمبے سوال کا ایک سطری جواب)</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Bite-Sized AI Engine</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSummarizeCustom();
            }}
            placeholder="Type or paste any long question, page topic, or paragraph (e.g. 'What is the main formula in section 3?')..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => handleSummarizeCustom()}
            disabled={!customInput.trim() || customSummarizing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shrink-0 transition-all"
          >
            {customSummarizing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>{customSummarizing ? 'Condensing...' : 'Summarize into 1 Line'}</span>
          </button>
        </div>

        {/* Quick sample prompts */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-500 mr-1">Quick Try:</span>
          {sampleLongQuestions.map((sq, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCustomInput(sq);
                handleSummarizeCustom(sq);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-800 transition-colors cursor-pointer"
            >
              {sq}
            </button>
          ))}
        </div>

        {/* Result Card for Custom Summarization */}
        {customResult && (
          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-700/50 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-3 h-3" />
                1-Line Direct Answer
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleSpeak(customResult.oneLineAnswer, 'custom-result')}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 text-xs flex items-center gap-1 transition-colors"
                  title="Listen to answer"
                >
                  {speakingId === 'custom-result' ? (
                    <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  <span>{speakingId === 'custom-result' ? 'Stop' : 'Listen / سُنیں'}</span>
                </button>
                <button
                  onClick={() => copyToClipboard(customResult.oneLineAnswer, 'custom-result')}
                  className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title="Copy 1-line answer"
                >
                  {copiedId === 'custom-result' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Big 1-Liner */}
            <div className="text-sm font-bold text-white bg-slate-900/90 p-3 rounded-lg border border-indigo-500/30 leading-snug">
              ⚡ {customResult.oneLineAnswer}
            </div>

            {/* Simple words explanation */}
            <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                In Plain Words (آسان الفاظ میں):
              </div>
              <p>{customResult.simpleExplanation}</p>
              {customResult.urduExplanation && (
                <p className="text-[11px] text-amber-300 font-medium pt-1 border-t border-slate-800/80">
                  🇵🇰 {customResult.urduExplanation}
                </p>
              )}
            </div>

            {/* Key takeaways */}
            {customResult.keyTakeaways && customResult.keyTakeaways.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {customResult.keyTakeaways.map((takeaway, tIdx) => (
                  <div
                    key={tIdx}
                    className="p-2 rounded bg-slate-900/60 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-1.5"
                  >
                    <CornerDownRight className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                    <span>{takeaway}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {customError && (
          <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/50 text-xs text-red-300">
            {customError}
          </div>
        )}
      </div>

      {/* 2. Page-by-Page & Section-by-Section 1-Line Digest */}
      <div className="space-y-4">
        {/* Search & Tag Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter 1-line takeaways..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar">
            <button
              onClick={() => setSelectedTag('all')}
              className={`text-[11px] px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all ${
                selectedTag === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              All Topics ({digestItems.length})
            </button>
            {allTags.slice(0, 5).map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`text-[11px] px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all ${
                  selectedTag === tag
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Digest Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item, idx) => {
            const cardId = `digest-${item.id || idx}`;
            const isThisSpeaking = speakingId === cardId;

            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3 group shadow-sm"
              >
                <div className="space-y-2">
                  {/* Top row: Label + Audio + Copy */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                        {item.pageNumber ? `Page ${item.pageNumber}` : `Section ${idx + 1}`}
                      </span>
                      <h4 className="text-xs font-bold text-white truncate max-w-[200px]">
                        {item.label}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Audio listen button */}
                      <button
                        onClick={() => handleSpeak(item.oneLineSummary, cardId)}
                        className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isThisSpeaking
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Listen to 1-line summary (آواز میں سنیں)"
                      >
                        {isThisSpeaking ? (
                          <VolumeX className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Copy button */}
                      <button
                        onClick={() => copyToClipboard(item.oneLineSummary, cardId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Copy 1-line summary"
                      >
                        {copiedId === cardId ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 1-Line Highlight Box */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-indigo-900/30 text-xs font-medium text-slate-100 leading-relaxed group-hover:border-indigo-600/40 transition-colors">
                    <span className="text-amber-400 font-bold mr-1.5">⚡ 1-Line Takeaway:</span>
                    {item.oneLineSummary}
                  </div>

                  {/* Expanded Explanation if toggled */}
                  {displayMode === 'expanded' && (
                    <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 space-y-1">
                      <div className="font-semibold text-indigo-400 text-[10px] uppercase">
                        Simple Explanation:
                      </div>
                      <p>{item.simpleExplanation}</p>
                      {item.urduExplanation && (
                        <p className="text-[11px] text-amber-300 font-medium pt-1 border-t border-slate-800/60">
                          🇵🇰 {item.urduExplanation}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: Tags & Ask Copilot */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-1">
                    {item.keyTags?.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {onAskCopilot && (
                    <button
                      onClick={() =>
                        onAskCopilot(
                          `Explain section "${item.label}" in simple words and give me the core formulas.`
                        )
                      }
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Ask AI Copilot</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
