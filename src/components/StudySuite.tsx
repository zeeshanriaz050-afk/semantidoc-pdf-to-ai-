import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Award,
  Zap,
  HelpCircle,
  FileCheck,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { Flashcard, QuizQuestion, CheatSheetItem } from '../types';

interface StudySuiteProps {
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
  cheatSheet: CheatSheetItem[];
  documentTitle: string;
}

export const StudySuite: React.FC<StudySuiteProps> = ({
  flashcards = [],
  quizQuestions = [],
  cheatSheet = [],
  documentTitle,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'flashcards' | 'quiz' | 'cheat_sheet'>('flashcards');

  // Flashcards state
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState<number[]>([]);

  // Quiz state
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submittedQuiz, setSubmittedQuiz] = useState(false);

  // Cheat sheet state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const currentCard = flashcards[currentCardIndex] || flashcards[0];

  const handleNextCard = () => {
    setIsFlipped(false);
    setCurrentCardIndex((prev) => (prev < flashcards.length - 1 ? prev + 1 : 0));
  };

  const handlePrevCard = () => {
    setIsFlipped(false);
    setCurrentCardIndex((prev) => (prev > 0 ? prev - 1 : flashcards.length - 1));
  };

  const toggleMastered = (id: number) => {
    setMasteredCards((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAnswer = (qId: number, optionIdx: number) => {
    if (submittedQuiz) return;
    setSelectedAnswers((prev) => ({ ...prev, [qId]: optionIdx }));
  };

  const calculateScore = () => {
    let score = 0;
    quizQuestions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correctIndex) {
        score++;
      }
    });
    return score;
  };

  const copyCheatSheet = () => {
    const text = cheatSheet
      .map(
        (c) =>
          `### ${c.topic} (${c.category})\n${c.formulaOrLaw ? `**Rule/Formula:** ${c.formulaOrLaw}\n` : ''}${c.keyPoints.map((p) => `- ${p}`).join('\n')}`
      )
      .join('\n\n');

    navigator.clipboard.writeText(text);
    setCopiedKey('cheatsheet');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Sub navigation */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 rounded-xl gap-2">
        <button
          onClick={() => setActiveSubTab('flashcards')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${
            activeSubTab === 'flashcards'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <RotateCw className="w-4 h-4" />
          <span>Interactive Flashcards ({flashcards.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('quiz')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${
            activeSubTab === 'quiz'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Exam & Test Quiz Simulator ({quizQuestions.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('cheat_sheet')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${
            activeSubTab === 'cheat_sheet'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Formula & Revision Cheat Sheet ({cheatSheet.length})</span>
        </button>
      </div>

      {/* 1. Flashcards View */}
      {activeSubTab === 'flashcards' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Active Recall & Spaced Repetition Cards
              </h3>
              <p className="text-xs text-slate-400">
                Click the card to flip between Question / Concept and Answer / Formula.
              </p>
            </div>
            <div className="text-xs text-indigo-300 font-mono">
              Card {currentCardIndex + 1} of {flashcards.length}
            </div>
          </div>

          {currentCard && (
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Flip Card Container */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="min-h-[260px] p-8 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border-2 border-indigo-500/30 hover:border-indigo-500/60 shadow-xl cursor-pointer flex flex-col justify-between transition-all select-none group relative overflow-hidden"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                    {currentCard.category || 'Core Concept'}
                  </span>
                  <span className="text-slate-500 group-hover:text-indigo-400 text-[11px] transition-colors">
                    {isFlipped ? 'Click to show question ↺' : 'Click to flip for answer ↻'}
                  </span>
                </div>

                <div className="py-6 text-center">
                  {!isFlipped ? (
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        Concept / Term
                      </span>
                      <h4 className="text-lg sm:text-xl font-bold text-white leading-snug">
                        {currentCard.questionOrTerm}
                      </h4>
                    </div>
                  ) : (
                    <div className="space-y-3 animate-in fade-in">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400">
                        Answer / Explanation
                      </span>
                      <p className="text-sm text-slate-200 leading-relaxed max-w-xl mx-auto">
                        {currentCard.answerOrDefinition}
                      </p>
                      {currentCard.keyFormula && (
                        <div className="p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 font-mono text-xs text-indigo-300 inline-block mt-2">
                          <strong>Formula/Law: </strong>
                          {currentCard.keyFormula}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                  <span>Card ID #{currentCard.id}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMastered(currentCard.id);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      masteredCards.includes(currentCard.id)
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {masteredCards.includes(currentCard.id) ? '✓ Mastered' : 'Mark as Mastered'}
                  </button>
                </div>
              </div>

              {/* Card Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handlePrevCard}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow transition-colors flex items-center gap-2"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Flip Card</span>
                </button>
                <button
                  onClick={handleNextCard}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Progress */}
              <div className="text-center text-xs text-slate-500">
                Mastered: {masteredCards.length} of {flashcards.length} cards
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Quiz View */}
      {activeSubTab === 'quiz' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-400" />
                Document Examination & Quiz Benchmark
              </h3>
              <p className="text-xs text-slate-400">
                Select your answers and click "Submit Quiz" to see your score and explanations.
              </p>
            </div>
            {submittedQuiz && (
              <div className="px-4 py-2 rounded-xl bg-indigo-950 border border-indigo-500/30 text-xs font-bold text-indigo-300">
                Final Score: {calculateScore()} / {quizQuestions.length} (
                {Math.round((calculateScore() / quizQuestions.length) * 100)}%)
              </div>
            )}
          </div>

          <div className="space-y-4">
            {quizQuestions.map((q, idx) => {
              const selectedOpt = selectedAnswers[q.id];
              const isAnswered = selectedOpt !== undefined;

              return (
                <div
                  key={q.id}
                  className="p-5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-4 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-400">
                      Question {idx + 1} of {quizQuestions.length}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        q.difficulty === 'Easy'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : q.difficulty === 'Medium'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {q.difficulty}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-white leading-relaxed">
                    {q.question}
                  </h4>

                  <div className="space-y-2">
                    {q.options.map((opt, oIdx) => {
                      const isSelected = selectedOpt === oIdx;
                      const isCorrect = oIdx === q.correctIndex;

                      let btnStyle =
                        'border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300';

                      if (submittedQuiz) {
                        if (isCorrect) {
                          btnStyle =
                            'border-emerald-500/60 bg-emerald-950/40 text-emerald-200 font-semibold';
                        } else if (isSelected && !isCorrect) {
                          btnStyle =
                            'border-red-500/60 bg-red-950/40 text-red-300 line-through';
                        }
                      } else if (isSelected) {
                        btnStyle =
                          'border-indigo-500 bg-indigo-950/50 text-indigo-200 font-semibold ring-1 ring-indigo-500';
                      }

                      return (
                        <div
                          key={oIdx}
                          onClick={() => handleSelectAnswer(q.id, oIdx)}
                          className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${btnStyle}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <span>{opt}</span>
                          </div>
                          {submittedQuiz && isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          {submittedQuiz && isSelected && !isCorrect && (
                            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {submittedQuiz && (
                    <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1">
                      <strong className="text-indigo-400">Explanation: </strong>
                      <span>{q.explanation}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => {
                setSelectedAnswers({});
                setSubmittedQuiz(false);
              }}
              className="px-4 py-2 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Reset Answers
            </button>
            <button
              onClick={() => setSubmittedQuiz(true)}
              disabled={Object.keys(selectedAnswers).length === 0}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
            >
              Submit Quiz & Review Answers
            </button>
          </div>
        </div>
      )}

      {/* 3. Cheat Sheet View */}
      {activeSubTab === 'cheat_sheet' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-sky-400" />
                Quick Revision Cheat Sheet & Formula Cards
              </h3>
              <p className="text-xs text-slate-400">
                Core definitions, scientific equations, and laws summarized for quick revision.
              </p>
            </div>
            <button
              onClick={copyCheatSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              {copiedKey === 'cheatsheet' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedKey === 'cheatsheet' ? 'Copied!' : 'Copy All'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cheatSheet.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">{item.topic}</h4>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    {item.category}
                  </span>
                </div>

                {item.formulaOrLaw && (
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-amber-300">
                    <strong>Rule / Law: </strong>
                    {item.formulaOrLaw}
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Key Revision Points:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                    {item.keyPoints.map((pt, pIdx) => (
                      <li key={pIdx} className="leading-relaxed">
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
