import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Mic,
  MicOff,
  Zap,
  Globe,
  Radio,
} from 'lucide-react';
import { ChatMessage } from '../types';

interface DocChatCopilotProps {
  documentContext: string;
  documentTitle: string;
  fileName: string;
  initialQuestion?: string;
}

export const DocChatCopilot: React.FC<DocChatCopilotProps> = ({
  documentContext,
  documentTitle,
  fileName,
  initialQuestion,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: `Hello! I am your AI Knowledge Copilot for **"${documentTitle || fileName}"**.\n\n🎙️ **Voice Audio Enabled:** You can type or click the **Microphone** to speak your question in Urdu or English!\n⚡ **1-Line Answer Mode:** Turn on the toggle below to get instant bite-sized 1-line answers.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState(initialQuestion || '');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // 1-Line Mode Toggle
  const [oneLineMode, setOneLineMode] = useState(true);

  // Voice Input (Speech-to-Text via Web Speech API)
  const [isListening, setIsListening] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<'ur-PK' | 'en-US'>('ur-PK');
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Setup Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = voiceLanguage;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputQuery(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Failed to initialize speech recognition:', err);
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, [voiceLanguage]);

  const toggleVoiceRecording = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert('Speech Recognition is not supported in this browser. Please use Google Chrome or Edge.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.lang = voiceLanguage;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Error starting speech recognition:', err);
        setIsListening(false);
      }
    }
  };

  const sampleQuestions = [
    '⚡ 1-Line: What is the main point of Page 1?',
    '⚡ 1-Line: Summarize the core formula or rule.',
    '⚡ 1-Line: What problem does this document solve?',
    'Explain the conclusion in 1 simple sentence.',
  ];

  const handleSendMessage = async (queryToSend?: string) => {
    const q = (queryToSend || inputQuery).trim();
    if (!q || loading) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    }

    const userMsg: ChatMessage = {
      role: 'user',
      text: q,
      mode: oneLineMode ? '1-line' : 'detailed',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: documentContext,
          fileName,
          oneLineMode,
          language: voiceLanguage === 'ur-PK' ? 'ur' : 'en',
        }),
      });

      const data = await res.json();
      if (data.success && data.answer) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          text: data.answer,
          mode: data.mode || (oneLineMode ? '1-line' : 'detailed'),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Auto read answer aloud if 1-line mode is on
        if (oneLineMode) {
          speakText(data.answer);
        }
      } else {
        throw new Error(data.error || 'Failed to get answer');
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `⚠️ Error retrieving answer: ${err.message || 'Please retry.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const speakText = (text: string, idx?: number) => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeakingMsgIdx(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#`_]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = speechRate;
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingMsgIdx(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingMsgIdx(null);
    };

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    if (idx !== undefined) {
      setSpeakingMsgIdx(idx);
    }
  };

  const copyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-[700px] overflow-hidden shadow-xl">
      {/* Copilot Header */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 bg-slate-950/90 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Document Voice & AI Copilot</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate max-w-xs">
              Live Q&A grounded in "{documentTitle || fileName}"
            </p>
          </div>
        </div>

        {/* 1-Line Mode Toggle & Audio Controls */}
        <div className="flex items-center gap-2">
          {/* 1-Line Toggle */}
          <button
            onClick={() => setOneLineMode((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              oneLineMode
                ? 'bg-gradient-to-r from-amber-500/20 to-indigo-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Toggle between 1-line bite-sized answers and detailed answers"
          >
            <Zap className={`w-3.5 h-3.5 ${oneLineMode ? 'text-amber-400 animate-pulse' : ''}`} />
            <span>{oneLineMode ? '⚡ 1-Line Answer Mode: ON' : '📖 Detailed Mode'}</span>
          </button>

          {/* Voice Language Selector */}
          <button
            onClick={() => setVoiceLanguage((prev) => (prev === 'ur-PK' ? 'en-US' : 'ur-PK'))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Change speech recognition language"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>{voiceLanguage === 'ur-PK' ? '🇵🇰 اردو (Urdu)' : '🇺🇸 English'}</span>
          </button>

          {/* Audio Play/Stop */}
          <button
            onClick={() => {
              if (messages.length > 0) {
                speakText(messages[messages.length - 1].text);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isSpeaking
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            title="Listen to latest response (Text-to-Speech)"
          >
            {isSpeaking ? <VolumeX className="w-3.5 h-3.5 animate-pulse text-amber-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{isSpeaking ? 'Stop Audio' : 'Listen / سُنیں'}</span>
          </button>
        </div>
      </div>

      {/* Suggested Quick Prompts */}
      <div className="p-2.5 bg-slate-950/40 border-b border-slate-800/80 overflow-x-auto flex gap-2 no-scrollbar">
        {sampleQuestions.map((sq, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(sq)}
            className="text-[11px] whitespace-nowrap px-3 py-1 rounded-full bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/40 transition-colors shrink-0 cursor-pointer"
          >
            {sq}
          </button>
        ))}
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4 font-sans text-xs">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          const isThisSpeaking = isSpeaking && speakingMsgIdx === idx;

          return (
            <div
              key={idx}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isUser
                    ? 'bg-purple-600 text-white'
                    : 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 space-y-2 shadow-sm ${
                  isUser
                    ? 'bg-purple-600/20 text-purple-100 border border-purple-500/30'
                    : 'bg-slate-950 text-slate-200 border border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold">{isUser ? 'You' : 'Document Assistant'}</span>
                    {m.mode === '1-line' && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[9px] font-bold">
                        ⚡ 1-Line
                      </span>
                    )}
                  </div>
                  <span>{m.timestamp}</span>
                </div>

                <div className="whitespace-pre-wrap leading-relaxed text-xs">
                  {m.text}
                </div>

                {!isUser && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-900">
                    <button
                      onClick={() => copyMessage(m.text, idx)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedIdx === idx ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => speakText(m.text, idx)}
                      className={`text-[10px] flex items-center gap-1 cursor-pointer transition-colors ${
                        isThisSpeaking ? 'text-amber-400 font-bold' : 'text-slate-500 hover:text-indigo-400'
                      }`}
                    >
                      {isThisSpeaking ? <VolumeX className="w-3 h-3 animate-pulse" /> : <Volume2 className="w-3 h-3" />}
                      <span>{isThisSpeaking ? 'Stop Audio' : 'Listen / سُنیں'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-indigo-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>
                {oneLineMode
                  ? 'Extracting instant 1-line answer and simple explanation...'
                  : 'Analyzing document and formulating structured response...'}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Listening Banner if Mic active */}
      {isListening && (
        <div className="px-4 py-2 bg-gradient-to-r from-red-950/80 via-purple-950/60 to-slate-950 border-t border-red-500/40 flex items-center justify-between text-xs text-red-200 animate-pulse">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-red-400 animate-spin" />
            <span className="font-bold">
              🎙️ Listening ({voiceLanguage === 'ur-PK' ? 'اردو میں بولیں' : 'Speak now in English'})...
            </span>
          </div>
          <button
            onClick={toggleVoiceRecording}
            className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] cursor-pointer"
          >
            Done / Send
          </button>
        </div>
      )}

      {/* Input Box with Microphone Voice Button */}
      <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2">
        {/* Microphone Audio Question Button */}
        <button
          onClick={toggleVoiceRecording}
          type="button"
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow ${
            isListening
              ? 'bg-red-600 text-white ring-4 ring-red-500/30 animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
          }`}
          title={isListening ? 'Click to stop listening' : 'Click to ask your question by Voice (آڈیو میں بول کر سوال پوچھیں)'}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-indigo-400" />}
        </button>

        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={
            isListening
              ? 'Listening to your voice...'
              : oneLineMode
              ? 'Ask for a 1-line answer (or click Mic to speak in Urdu/English)...'
              : `Ask anything about "${documentTitle || fileName}" (Voice or Text)...`
          }
          className="flex-1 px-4 py-2.5 text-xs bg-slate-900 border border-slate-700/80 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!inputQuery.trim() || loading}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white disabled:opacity-50 transition-colors shadow flex items-center justify-center cursor-pointer"
          title="Send question"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
