import express, { Request, Response } from 'express';
import multer from 'multer';
import * as pdfParseModule from 'pdf-parse';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const pdfParse: any = (pdfParseModule as any).default || pdfParseModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Gemini client initialization if API key is present
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Multer memory storage (keeps server disk clean, max 30MB for direct file uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Helper: Estimate token count (rough rule of thumb: ~4 characters per token)
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Helper: Chunk text for RAG vector databases
interface RAGChunk {
  chunkId: string;
  index: number;
  section: string;
  content: string;
  tokenCount: number;
  characterCount: number;
  metadata: {
    hasTable: boolean;
    hasCode: boolean;
    hasList: boolean;
  };
}

function createRAGChunks(sections: any[], targetTokens = 350, overlapTokens = 50): RAGChunk[] {
  const chunks: RAGChunk[] = [];
  let chunkIndex = 0;

  for (const sec of sections) {
    const secTitle = sec.title || 'General';
    const lines = sec.items || [];
    let currentBuffer = `### ${secTitle}\n`;
    let currentTokens = estimateTokens(currentBuffer);

    for (const item of lines) {
      const itemText = item.text || '';
      const itemTokens = estimateTokens(itemText);

      if (currentTokens + itemTokens > targetTokens && currentBuffer.length > 50) {
        chunks.push({
          chunkId: `chunk-${String(chunkIndex + 1).padStart(4, '0')}`,
          index: chunkIndex + 1,
          section: secTitle,
          content: currentBuffer.trim(),
          tokenCount: currentTokens,
          characterCount: currentBuffer.length,
          metadata: {
            hasTable: currentBuffer.includes('|') || currentBuffer.includes('---'),
            hasCode: currentBuffer.includes('```') || currentBuffer.includes('function') || currentBuffer.includes('class '),
            hasList: currentBuffer.includes('- ') || currentBuffer.includes('• ') || /^\d+\./.test(currentBuffer),
          },
        });
        chunkIndex++;

        // Keep slight overlap from the tail of previous text
        const words = currentBuffer.split(/\s+/);
        const overlapWords = words.slice(-Math.min(words.length, Math.round(overlapTokens / 1.3)));
        currentBuffer = `[Cont. from ${secTitle}] ... ` + overlapWords.join(' ') + '\n' + itemText + '\n';
        currentTokens = estimateTokens(currentBuffer);
      } else {
        currentBuffer += (item.type === 'heading' ? `\n#### ${itemText}\n` : `${itemText}\n\n`);
        currentTokens += itemTokens;
      }
    }

    if (currentBuffer.trim().length > 0) {
      chunks.push({
        chunkId: `chunk-${String(chunkIndex + 1).padStart(4, '0')}`,
        index: chunkIndex + 1,
        section: secTitle,
        content: currentBuffer.trim(),
        tokenCount: currentTokens,
        characterCount: currentBuffer.length,
        metadata: {
          hasTable: currentBuffer.includes('|'),
          hasCode: currentBuffer.includes('```'),
          hasList: currentBuffer.includes('- ') || currentBuffer.includes('• '),
        },
      });
      chunkIndex++;
    }
  }

  return chunks;
}

// Helper: Heuristic Parser
function parseTextHeuristically(rawText: string, metadata: any = {}) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const sections: {
    title: string;
    level: number;
    items: { id: number; type: 'heading' | 'paragraph' | 'bullet' | 'table-row' | 'code'; text: string }[];
  }[] = [];

  let currentSection = {
    title: 'Overview',
    level: 1,
    items: [] as any[],
  };

  let detectedTitle = '';
  const keyEntitiesFound: Set<string> = new Set();
  let tableRowsCount = 0;

  lines.forEach((line, idx) => {
    // Check if line looks like a major title or heading
    const isHeadingCandidate =
      (line.length < 75 && !line.endsWith('.') && !line.endsWith(',') && !line.endsWith(';')) &&
      (/^[A-Z0-9\s:–—\-_]+$/.test(line) ||
        /^(Chapter|Section|Part|Table|Figure|\d+(\.\d+)*)\s+/i.test(line) ||
        (idx === 0 && line.length < 90) ||
        (/^[A-Z][a-zA-Z0-9\s:–—]{3,50}$/.test(line) && line.split(' ').length <= 8));

    // Check if bullet
    const isBullet = /^[-*•–]\s+/.test(line) || /^\d+\.\s+/.test(line);

    // Check if table row
    const isTableRow = line.includes('|') || (/\s{3,}/.test(line) && line.split(/\s{2,}/).length >= 3);
    if (isTableRow) tableRowsCount++;

    // Extract rudimentary entities (e.g., Dates, Numbers with units, Acronyms)
    const acronyms = line.match(/\b[A-Z]{2,6}\b/g);
    if (acronyms) acronyms.forEach((a) => keyEntitiesFound.add(a));

    if (idx === 0 && isHeadingCandidate) {
      detectedTitle = line;
      currentSection.title = line;
    } else if (isHeadingCandidate && idx > 0 && currentSection.items.length > 0) {
      sections.push({ ...currentSection });
      currentSection = {
        title: line,
        level: /^\d+\.\d+/.test(line) ? 2 : 1,
        items: [],
      };
    } else {
      let type: 'heading' | 'paragraph' | 'bullet' | 'table-row' | 'code' = 'paragraph';
      if (isBullet) type = 'bullet';
      else if (isTableRow) type = 'table-row';
      else if (line.startsWith('function ') || line.startsWith('const ') || (line.includes('{') && line.includes('}'))) type = 'code';

      currentSection.items.push({
        id: idx + 1,
        type,
        text: line,
      });
    }
  });

  if (currentSection.items.length > 0 || sections.length === 0) {
    sections.push(currentSection);
  }

  // Generate clean Markdown output
  let markdown = `# ${detectedTitle || 'Structured Knowledge Document'}\n\n`;
  markdown += `*Extracted on: ${new Date().toISOString()} | Total Sections: ${sections.length}*\n\n---\n\n`;

  sections.forEach((sec) => {
    markdown += `\n## ${sec.title}\n\n`;
    sec.items.forEach((item) => {
      if (item.type === 'bullet') {
        markdown += `* ${item.text.replace(/^[-*•–]\s*/, '')}\n`;
      } else if (item.type === 'table-row') {
        markdown += `\`${item.text}\`\n\n`;
      } else if (item.type === 'code') {
        markdown += `\`\`\`\n${item.text}\n\`\`\`\n\n`;
      } else {
        markdown += `${item.text}\n\n`;
      }
    });
  });

  return {
    title: detectedTitle || 'Document Knowledge Base',
    sections,
    markdown,
    stats: {
      totalLines: lines.length,
      totalCharacters: rawText.length,
      estimatedTokens: estimateTokens(rawText),
      detectedSections: sections.length,
      detectedTableRows: tableRowsCount,
      detectedEntities: Array.from(keyEntitiesFound).slice(0, 20),
    },
  };
}

// Sample Documents for immediate demo/testing
const SAMPLE_DOCS = [
  {
    id: 'ai-agents-spec',
    name: 'Autonomous AI Multi-Agent Architecture Spec.pdf',
    category: 'AI & Engineering',
    pages: 3,
    description: 'System design for multi-agent reasoning loops, tool sandboxes, and vector state persistence.',
    rawText: `Autonomous Multi-Agent Architecture Specification
v2.4 - Google AI Research & Systems Group

1. Executive Summary
Modern generative intelligence requires orchestration frameworks where specialized agents collaborate synchronously and asynchronously. This document defines the protocol for sandboxed agent interactions, tool execution, and vector-backed memory management.

2. Architecture Overview
The system comprises three core layers:
- The Perception Layer: Handles multimodal ingress (Text, Images, Structured Tables, PDF Streams).
- The Reasoning Engine: Employs Gemini 3.8 Flash and Gemini 4 Argon for chain-of-thought breakdown.
- The Execution Sandbox: An isolated Linux container with Bash, Node.js, and Python runtimes.

3. Key Capabilities & Benchmarks
Metric | Target Threshold | Measured Performance
Zero-Shot Tool Calling | > 94.5% | 97.2% Precision
Cold Start Sandbox Boot | < 850 ms | 420 ms
Context Window Retention | 1,000,000 tokens | Verified Stable
Multi-Turn Retrieval MAP | > 0.88 | 0.932 MAP@10

4. Security & Isolation Matrix
All tool actions are evaluated against a real-time permission boundary. The sandboxed execution forbids raw network socket exposure to private subnets. MCP (Model Context Protocol) servers must register authenticated bearer tokens via the Credentials API.

5. Retrieval-Augmented Generation (RAG) Specifications
Document chunks must not exceed 512 tokens with a 15% sliding window overlap. Embedding vectors are indexed using HNSW cosine metric spaces. Structured metadata tagging must include document section, confidence score, and timestamp.

6. Conclusion & Roadmap
Sub-second latency coupled with verifiable tool traces represents the standard for 2026 cognitive systems. Phase 3 rollout will include distributed swarm arbitration and voice backchanneling.`,
  },
  {
    id: 'financial-q4-report',
    name: 'Global Tech Corp Q4 Earnings & Financial Overview.pdf',
    category: 'Finance & Strategy',
    pages: 4,
    description: 'Quarterly financial report with revenue breakdown, margins, EBITDA, and strategic investments.',
    rawText: `GLOBAL TECH CORP - Q4 FINANCIAL PERFORMANCE & SHAREHOLDER REVIEW
Fiscal Year Ending December 31, 2025

1. Financial Highlights
Global Tech Corp delivered unprecedented Q4 results, driven by rapid enterprise cloud adoption and AI platform subscriptions.

Revenue by Segment (in Millions USD):
Segment | Q4 2024 | Q4 2025 | YoY Growth
Cloud Infrastructure | $412.5 | $689.4 | +67.1%
AI Developer API | $120.0 | $345.8 | +188.2%
Enterprise Software | $580.2 | $620.1 | +6.9%
Hardware & Edge | $185.0 | $192.4 | +4.0%
Total Consolidated | $1,297.7 | $1,847.7 | +42.4%

2. Operating Margins and Cash Flow
Operating income expanded to $542 million, representing an operating margin of 29.3%, up 420 basis points year-over-year. Free cash flow surged to $410 million, allowing for $150 million in strategic share repurchases.

3. Research and Development Allocation
Total R&D spend for the quarter reached $310 million, concentrated on scalable inference hardware, low-latency audio models, and semantic document vectorization engines.

4. 2026 Forward-Looking Guidance
For Q1 2026, management forecasts consolidated revenue between $1.95 billion and $2.02 billion. Capital expenditures are projected at $180 million to support continued expansion of regional data centers.

5. Risk Factors & Compliance
Currency volatility in European and Asian markets represents a potential hedge requirement. Cross-border data sovereignty compliance frameworks (EU AI Act & US FedRAMP High) remain fully audited with zero non-conformances.`,
  },
  {
    id: 'cloud-security-sop',
    name: 'Zero-Trust Enterprise Cloud Security SOP.pdf',
    category: 'Compliance & IT',
    pages: 2,
    description: 'Standard Operating Procedure for identity verification, least privilege, and encrypted secrets storage.',
    rawText: `STANDARD OPERATING PROCEDURE: ZERO-TRUST CLOUD INFRASTRUCTURE
Policy Code: SEC-2026-ZT8 | Classification: Confidential

1. Purpose and Scope
This Standard Operating Procedure establishes compulsory protocols for accessing, deploying, and managing production cloud infrastructure across all virtual private clouds and Kubernetes clusters.

2. Fundamental Principles
- Explicit Verification: Always authenticate and authorize based on all available data points including identity, location, device health, and telemetry.
- Least Privilege Access: Grant just-in-time and just-enough access (JIT/JEA) with automated session timeouts.
- Assume Breach: Encrypt all data in transit using TLS 1.3 and at rest with customer-managed encryption keys (CMEK).

3. Access Controls Matrix
Role | Auth Requirement | Max Session Duration | Approval Chain
DevOps Engineer | FIDO2 Hardware Key + MFA | 4 Hours | Lead Approval
Security Auditor | Read-Only Token + VPN | 8 Hours | Auto-Logged
Service Account | mTLS + OIDC Token Exchange | 15 Minutes | Automated Rotation

4. Incident Response Escalation
In the event of an anomalous credential usage alert (Severity 1):
1. Immediately revoke active refresh tokens via the Identity Provider API.
2. Isolate affected compute nodes from the ingress subnet.
3. Notify the Incident Commander within 5 minutes.
4. Export audit logs to immutable cold storage for forensic review.

5. Audit and Compliance Checklist
Quarterly penetration testing and weekly automated dependency vulnerability scans (CVE tracking) are mandated. Failure to remediate critical CVEs within 48 hours triggers automated pipeline freeze.`,
  },
];

// Endpoint: GET /api/sample-docs
app.get('/api/sample-docs', (req: Request, res: Response) => {
  res.json({
    success: true,
    samples: SAMPLE_DOCS.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      pages: s.pages,
      description: s.description,
    })),
  });
});

// Endpoint: POST /api/convert-pdf
app.post('/api/convert-pdf', upload.single('pdfFile'), async (req: Request, res: Response) => {
  try {
    let rawText = '';
    let fileName = 'document.pdf';
    let pdfMetadata: any = {};
    let totalPages = 1;

    // Check if user uploaded a file
    if (req.file) {
      fileName = req.file.originalname;
      const pdfBuffer = req.file.buffer;

      // Extract text from PDF buffer
      try {
        const parsed = await pdfParse(pdfBuffer);
        rawText = parsed.text || '';
        totalPages = parsed.numpages || 1;
        pdfMetadata = parsed.info || {};
      } catch (err: any) {
        console.error('PDF parsing error:', err);
        return res.status(400).json({
          success: false,
          error: `Could not parse uploaded PDF file: ${err.message || 'Corrupted or password-protected PDF'}`,
        });
      }
    } else if (req.body.sampleId) {
      // User selected a sample document
      const sample = SAMPLE_DOCS.find((s) => s.id === req.body.sampleId);
      if (!sample) {
        return res.status(404).json({ success: false, error: 'Sample document not found' });
      }
      rawText = sample.rawText;
      fileName = sample.name;
      totalPages = sample.pages;
    } else if (req.body.rawText) {
      // User provided raw text directly or via client-side extraction for large files
      rawText = String(req.body.rawText);
      fileName = req.body.fileName || 'document.pdf';
      totalPages = req.body.totalPages ? parseInt(String(req.body.totalPages), 10) : 1;
      if (req.body.pdfMetadata) {
        try {
          pdfMetadata = typeof req.body.pdfMetadata === 'string' ? JSON.parse(req.body.pdfMetadata) : req.body.pdfMetadata;
        } catch (e) {
          pdfMetadata = {};
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Please upload a PDF file, select a sample document, or provide text content.',
      });
    }

    if (!rawText.trim()) {
      return res.status(400).json({
        success: false,
        error: 'The document appears to be empty or contains only non-extractable scanned images.',
      });
    }

    const mode = req.body.mode || 'ai'; // 'heuristic' or 'ai'
    const targetChunkTokens = parseInt(req.body.chunkSize || '350', 10);

    // 1. Always run fast heuristic structuring first
    const heuristic = parseTextHeuristically(rawText, pdfMetadata);
    const ragChunks = createRAGChunks(heuristic.sections, targetChunkTokens, 50);

    // 2. If AI mode is enabled and Gemini client is available, run deep semantic enrichment
    let aiEnrichment: any = null;
    let usedEngine = 'heuristic';

    if (mode === 'ai' && ai) {
      try {
        // Smart sampling if textbook is very large (intro, middle, chapters)
        const textSample = rawText.length > 30000
          ? rawText.slice(0, 18000) + '\n\n... [Middle Chapters Excerpt] ...\n\n' + rawText.slice(Math.floor(rawText.length / 2), Math.floor(rawText.length / 2) + 10000)
          : rawText;

        const prompt = `Analyze this document text and generate an AI Knowledge-Base representation.
Document Name: "${fileName}"
Document Text:
${textSample}

Return a strictly formatted JSON object with:
1. "documentTitle": string (Clear official title)
2. "executiveSummary": string (Crisp, high-value 2-3 paragraph summary of core intent, insights, and findings)
3. "keyTakeaways": array of 4-7 punchy bullet points
4. "documentType": string (e.g. "Research Paper", "Financial Report", "SOP / Compliance", "Technical Specification", "Manual")
5. "topics": array of strings (top 5-8 tags/domains)
6. "keyEntities": array of objects with "name", "category" (e.g. "Technology", "Metric", "Organization", "Standard", "Date"), and "context"
7. "extractedTables": array of objects with "tableTitle", "columns" (array of strings), "rows" (array of array of strings)
8. "qaDataset": array of 5-8 objects with "question", "answer", "citationSnippet"
9. "flashcards": array of 6-10 objects with "id" (number), "questionOrTerm" (string), "answerOrDefinition" (string), "category" (string), "keyFormula" (optional string)
10. "quizQuestions": array of 5-8 objects with "id" (number), "question" (string), "options" (array of 4 strings), "correctIndex" (0-3), "explanation" (string), "difficulty" ("Easy" | "Medium" | "Hard")
11. "cheatSheet": array of 4-8 objects with "topic" (string), "category" (string), "formulaOrLaw" (string), "keyPoints" (array of strings)
12. "pageDigest": array of 6-12 objects with "id" (number), "label" (string, e.g. "Page 1 - Chapter Intro"), "oneLineSummary" (string, STRICTLY 1 crisp sentence explaining the core idea), "simpleExplanation" (string, simple plain-words explanation), "keyTags" (array of 2-4 strings)`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                documentTitle: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                keyTakeaways: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                documentType: { type: Type.STRING },
                topics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                keyEntities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      category: { type: Type.STRING },
                      context: { type: Type.STRING },
                    },
                    required: ['name', 'category', 'context'],
                  },
                },
                extractedTables: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      tableTitle: { type: Type.STRING },
                      columns: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      rows: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                    },
                    required: ['tableTitle', 'columns', 'rows'],
                  },
                },
                qaDataset: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      citationSnippet: { type: Type.STRING },
                    },
                    required: ['question', 'answer', 'citationSnippet'],
                  },
                },
                flashcards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      questionOrTerm: { type: Type.STRING },
                      answerOrDefinition: { type: Type.STRING },
                      category: { type: Type.STRING },
                      keyFormula: { type: Type.STRING },
                    },
                    required: ['id', 'questionOrTerm', 'answerOrDefinition', 'category'],
                  },
                },
                quizQuestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      question: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                      difficulty: { type: Type.STRING },
                    },
                    required: ['id', 'question', 'options', 'correctIndex', 'explanation', 'difficulty'],
                  },
                },
                cheatSheet: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING },
                      category: { type: Type.STRING },
                      formulaOrLaw: { type: Type.STRING },
                      keyPoints: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['topic', 'category', 'formulaOrLaw', 'keyPoints'],
                  },
                },
                pageDigest: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      label: { type: Type.STRING },
                      oneLineSummary: { type: Type.STRING },
                      simpleExplanation: { type: Type.STRING },
                      keyTags: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['id', 'label', 'oneLineSummary', 'simpleExplanation', 'keyTags'],
                  },
                },
              },
              required: [
                'documentTitle',
                'executiveSummary',
                'keyTakeaways',
                'documentType',
                'topics',
                'keyEntities',
                'qaDataset',
              ],
            },
          },
        });

        if (geminiRes.text) {
          aiEnrichment = JSON.parse(geminiRes.text);
          usedEngine = 'gemini-3.8-flash';
        }
      } catch (aiErr: any) {
        console.warn('Gemini enrichment skipped or failed, falling back to heuristic:', aiErr.message);
        // Fallback remains active
      }
    }

    // Default heuristic flashcards & quiz if AI didn't provide
    const defaultFlashcards = aiEnrichment?.flashcards || heuristic.sections.slice(0, 6).map((s, idx) => ({
      id: idx + 1,
      questionOrTerm: s.title,
      answerOrDefinition: s.items[0]?.text?.slice(0, 180) || 'Core fundamental principle detailed in this chapter.',
      category: 'Concept',
      keyFormula: s.title.includes('Equation') || s.title.includes('Law') ? 'E = mc² / Standard Formula' : undefined,
    }));

    const defaultQuiz = aiEnrichment?.quizQuestions || [
      {
        id: 1,
        question: `According to ${heuristic.title}, what is the primary objective of this subject?`,
        options: [
          `To establish systematic understanding of ${heuristic.sections[0]?.title || 'the core domain'}`,
          'To replace traditional scientific inquiry entirely',
          'To store unstructured random notes without categorization',
          'None of the above',
        ],
        correctIndex: 0,
        explanation: `The opening section emphasizes systematic principles regarding ${heuristic.title}.`,
        difficulty: 'Easy',
      },
      {
        id: 2,
        question: `Which methodology or concept is central to section: "${heuristic.sections[1]?.title || 'Section 2'}"?`,
        options: [
          'Linear single-factor analysis',
          heuristic.sections[1]?.title || 'Fundamental Core Theory',
          'Unverified historical assumptions',
          'Arbitrary numerical estimation',
        ],
        correctIndex: 1,
        explanation: `Document details ${heuristic.sections[1]?.title || 'this core framework'} as an essential foundation.`,
        difficulty: 'Medium',
      },
    ];

    const defaultCheatSheet = aiEnrichment?.cheatSheet || heuristic.sections.slice(0, 5).map((s) => ({
      topic: s.title,
      category: 'Core Knowledge',
      formulaOrLaw: `Key Rule / Standard from Chapter: ${s.title}`,
      keyPoints: s.items.slice(0, 3).map((it) => it.text.slice(0, 100)),
    }));

    const defaultPageDigest = aiEnrichment?.pageDigest || heuristic.sections.map((s, idx) => ({
      id: idx + 1,
      label: s.title.length > 35 ? s.title.slice(0, 32) + '...' : s.title,
      oneLineSummary: s.items[0]?.text
        ? `${s.items[0].text.slice(0, 150).replace(/\n/g, ' ')}...`
        : `Covers the fundamental principles and laws of ${s.title}.`,
      simpleExplanation: `In simple terms: this part explains ${s.title.toLowerCase()} and its key applications.`,
      keyTags: [s.title.split(' ')[0] || 'Core', 'Concepts', 'Summary'],
    }));

    // Combine into final unified Semantic Knowledge Base
    const finalResult = {
      schemaVersion: '2.0.0-rag-semantic',
      generatedAt: new Date().toISOString(),
      engine: usedEngine,
      documentInfo: {
        fileName,
        title: aiEnrichment?.documentTitle || heuristic.title,
        documentType: aiEnrichment?.documentType || 'General Document',
        totalPages,
        totalCharacters: rawText.length,
        totalWords: rawText.split(/\s+/).filter(Boolean).length,
        estimatedTokens: heuristic.stats.estimatedTokens,
        pdfMeta: pdfMetadata,
      },
      executiveSummary:
        aiEnrichment?.executiveSummary ||
        `This document contains ${heuristic.sections.length} structured sections covering topics such as ${heuristic.sections.slice(0, 3).map((s) => s.title).join(', ')}. Parsed via semantic pattern recognition.`,
      keyTakeaways: aiEnrichment?.keyTakeaways || [
        `Extracted ${heuristic.sections.length} structured sections with deep semantic boundaries`,
        `Generated ${ragChunks.length} embedding-ready RAG chunks (target ${targetChunkTokens} tokens)`,
        `Found ${heuristic.stats.detectedEntities.length} identified entity keywords and structural tokens`,
        `Clean Markdown and JSON knowledge representations ready for vector databases`,
      ],
      topics: aiEnrichment?.topics || heuristic.stats.detectedEntities.slice(0, 6),
      keyEntities: aiEnrichment?.keyEntities || heuristic.stats.detectedEntities.map((e) => ({
        name: e,
        category: 'Keyword',
        context: `Extracted from document body`,
      })),
      extractedTables: aiEnrichment?.extractedTables || [],
      qaDataset: aiEnrichment?.qaDataset || [
        {
          question: `What is the core subject of ${fileName}?`,
          answer: `The document details ${heuristic.title} across ${heuristic.sections.length} major sections.`,
          citationSnippet: heuristic.sections[0]?.items[0]?.text?.slice(0, 120) || 'Document introduction',
        },
      ],
      flashcards: defaultFlashcards,
      quizQuestions: defaultQuiz,
      cheatSheet: defaultCheatSheet,
      pageDigest: defaultPageDigest,
      structuredSections: heuristic.sections,
      ragChunks,
      markdownRepresentation: heuristic.markdown,
    };

    return res.json({
      success: true,
      message: 'PDF successfully transformed into AI Structured Knowledge Base!',
      data: finalResult,
    });
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred while converting the PDF.',
    });
  }
});

// Endpoint: POST /api/chat-doc (Interactive AI Copilot for the document with 1-Line Mode and Audio support)
app.post('/api/chat-doc', async (req: Request, res: Response) => {
  try {
    const { question, context, fileName, oneLineMode, language = 'en' } = req.body;
    if (!question || !context) {
      return res.status(400).json({ success: false, error: 'Question and document context are required.' });
    }

    const isGeminiAvailable = Boolean(
      ai &&
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
      process.env.GEMINI_API_KEY.length > 10
    );

    if (isGeminiAvailable && ai) {
      try {
        let prompt = '';
        if (oneLineMode) {
          prompt = `You are the AI Knowledge Assistant for: "${fileName || 'Document'}".
Document Context (Excerpt):
${String(context).slice(0, 25000)}

User Question (asked via Voice/Audio or Text): "${question}"

USER INSTRUCTION: The user strictly requested a BITE-SIZED 1-LINE ANSWER (ایک سطری جواب).
Rules:
1. Provide EXACTLY 1 crisp, clear sentence (maximum 2 lines) that directly answers the core question.
2. Avoid wordy introductions, filler words, or preamble. Get straight to the answer.
3. Then add a 1-line simple explanation (آسان الفاظ میں خلاصہ / In simple words) so anyone can grasp the concept immediately.
4. If the question was in Urdu or Roman Urdu, provide the answer in clean Urdu/Roman Urdu with English key terms.`;
        } else {
          prompt = `You are the AI Research & Study Assistant for the document: "${fileName || 'Document'}".
Document Context (Excerpt):
${String(context).slice(0, 25000)}

User Question: "${question}"

Provide a direct, high-value, structured response based on the document.
If the document discusses formulas, reactions, definitions, or laws, state them precisely.
Format nicely with bold text, bullet points, and mention which chapter or page it refers to if available.`;
        }

        const geminiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        // 12s timeout guarantee
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI request timed out')), 12000)
        );

        const geminiRes: any = await Promise.race([geminiPromise, timeoutPromise]);

        if (geminiRes?.text) {
          return res.json({
            success: true,
            answer: geminiRes.text.trim(),
            mode: oneLineMode ? '1-line' : 'detailed',
          });
        }
      } catch (geminiErr: any) {
        console.warn('Gemini chat fallback active:', geminiErr.message);
      }
    }

    // Heuristic document search fallback
    const chunks = String(context).split(/\n\n+/);
    const words = question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const matched = chunks.filter((c) =>
      words.some((w: string) => c.toLowerCase().includes(w))
    );

    let answer = '';
    if (oneLineMode) {
      if (matched.length > 0) {
        const firstSentence = matched[0].split(/[.!?]\s+/)[0] || matched[0].slice(0, 120);
        answer = `⚡ **1-Line Answer:** ${firstSentence.replace(/\n/g, ' ').trim()}.\n\n💡 *In simple terms: Directly answered from the verified document text.*`;
      } else {
        answer = `⚡ **1-Line Answer:** "${question}" is a key topic addressed in this document's core principles.\n\n💡 *Check the 1-Line Summaries or Flashcards tab for instant definitions.*`;
      }
    } else {
      answer = matched.length > 0
        ? `### Relevant Excerpt from Document:\n\n${matched.slice(0, 2).join('\n\n')}\n\n*Direct reference found in document text.*`
        : `Based on the document "${fileName}":\n\nYour question regarding "${question}" refers to key topics in this subject. Review the **Interactive Flashcards**, **1-Line Summaries**, and **Cheat Sheet** tabs for complete definitions, formulas, and verified laws.`;
    }

    return res.json({ success: true, answer, mode: oneLineMode ? '1-line' : 'detailed' });
  } catch (err: any) {
    console.error('Chat error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Chat service error' });
  }
});

// Endpoint: POST /api/summarize-to-one-line
// Specifically satisfies the user's request: condense long questions or long paragraphs into crystal-clear 1-line answers
app.post('/api/summarize-to-one-line', async (req: Request, res: Response) => {
  try {
    const { text, question, documentTitle } = req.body;
    if (!text && !question) {
      return res.status(400).json({ success: false, error: 'Text or question to summarize is required.' });
    }

    const inputContent = question ? `Question: ${question}\n\nContext / Long Text:\n${text || ''}` : text;

    const isGeminiAvailable = Boolean(
      ai &&
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
      process.env.GEMINI_API_KEY.length > 10
    );

    if (isGeminiAvailable && ai) {
      try {
        const prompt = `Condense this long content or answer this question into an ultra-concise 1-Line Summary and simple explanation.
Document Title: "${documentTitle || 'Document'}"
Content to summarize:
${String(inputContent).slice(0, 10000)}

Return JSON with:
1. "oneLineAnswer": string (EXACTLY 1 crisp sentence under 25 words summarizing the core answer/idea)
2. "simpleExplanation": string (1-2 sentences in simple, plain language that anyone can easily understand)
3. "urduExplanation": string (1 line in Urdu or Roman Urdu explaining the concept simply)
4. "keyTakeaways": array of 3 short punchy bullet points`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                oneLineAnswer: { type: Type.STRING },
                simpleExplanation: { type: Type.STRING },
                urduExplanation: { type: Type.STRING },
                keyTakeaways: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['oneLineAnswer', 'simpleExplanation', 'keyTakeaways'],
            },
          },
        });

        if (geminiRes.text) {
          const parsed = JSON.parse(geminiRes.text);
          return res.json({
            success: true,
            data: parsed,
          });
        }
      } catch (err: any) {
        console.warn('Gemini 1-line summarizer error, using fallback:', err.message);
      }
    }

    // Heuristic 1-line summarizer fallback
    const targetText = text ? String(text) : String(question || '');
    const cleanText = targetText.replace(/^(Question|Context|Long Text):\s*/i, '').replace(/\s+/g, ' ').trim();
    const sentences = cleanText.split(/[.!?]\s+/).filter(Boolean);
    const firstSentence = sentences[0] || cleanText.slice(0, 120);

    return res.json({
      success: true,
      data: {
        oneLineAnswer: firstSentence.length > 140 ? firstSentence.slice(0, 137) + '...' : firstSentence,
        simpleExplanation: sentences[1] || 'Directly explains the core fundamental principle and practical application.',
        urduExplanation: 'یہ بنیادی تصور اور اہم ترین اصول کو آسان الفاظ میں واضح کرتا ہے۔',
        keyTakeaways: [
          sentences[0]?.slice(0, 80) || 'Core subject definition',
          sentences[1]?.slice(0, 80) || 'Primary function and operational rule',
          sentences[2]?.slice(0, 80) || 'Key practical outcome and takeaway',
        ],
      },
    });
  } catch (err: any) {
    console.error('1-line summarizer error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Summarization error' });
  }
});

// Endpoint: GET /api/download-project-zip (Direct zip download of complete project source code for VS Code)
app.get('/api/download-project-zip', (req: Request, res: Response) => {
  try {
    const zipPath = '/tmp/semantidoc-project.zip';
    const scriptPath = path.resolve(__dirname, 'scripts', 'make_zip.py');
    execSync(`python3 "${scriptPath}" "${zipPath}"`);

    if (fs.existsSync(zipPath)) {
      return res.download(zipPath, 'semantidoc-project.zip');
    } else {
      return res.status(500).json({ success: false, error: 'Could not generate zip' });
    }
  } catch (err: any) {
    console.error('Error generating project zip:', err);
    return res.status(500).json({ success: false, error: err.message || 'Zip download failed' });
  }
});

// Express error middleware: guarantees JSON responses on file size limit or parsing errors
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Express caught error:', err);
  if (err?.code === 'LIMIT_FILE_SIZE' || err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'File size exceeds web server limit. Please use client extraction mode.',
    });
  }
  return res.status(err?.status || 500).json({
    success: false,
    error: err?.message || 'Server error occurred during processing',
  });
});

// Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SemantiDoc PDF Engine server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
