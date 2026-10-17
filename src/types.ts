export interface DocumentItem {
  id: number;
  type: 'heading' | 'paragraph' | 'bullet' | 'table-row' | 'code';
  text: string;
}

export interface StructuredSection {
  title: string;
  level: number;
  items: DocumentItem[];
}

export interface RAGChunk {
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

export interface KeyEntity {
  name: string;
  category: string;
  context: string;
}

export interface ExtractedTable {
  tableTitle: string;
  columns: string[];
  rows: string[][];
}

export interface QAPair {
  question: string;
  answer: string;
  citationSnippet: string;
}

export interface KnowledgeBaseData {
  schemaVersion: string;
  generatedAt: string;
  engine: string;
  documentInfo: {
    fileName: string;
    title: string;
    documentType: string;
    totalPages: number;
    totalCharacters: number;
    totalWords: number;
    estimatedTokens: number;
    pdfMeta: Record<string, any>;
  };
  executiveSummary: string;
  keyTakeaways: string[];
  topics: string[];
  keyEntities: KeyEntity[];
  extractedTables: ExtractedTable[];
  qaDataset: QAPair[];
  structuredSections: StructuredSection[];
  ragChunks: RAGChunk[];
  markdownRepresentation: string;
  flashcards?: Flashcard[];
  quizQuestions?: QuizQuestion[];
  cheatSheet?: CheatSheetItem[];
  pageDigest?: PageDigestItem[];
}

export interface PageDigestItem {
  id: number;
  label: string;
  oneLineSummary: string;
  simpleExplanation: string;
  keyTags: string[];
  urduExplanation?: string;
  pageNumber?: number;
}

export interface Flashcard {
  id: number;
  questionOrTerm: string;
  answerOrDefinition: string;
  category: string;
  keyFormula?: string;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface CheatSheetItem {
  topic: string;
  category: string;
  formulaOrLaw: string;
  keyPoints: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  mode?: '1-line' | 'detailed';
  citations?: string[];
  timestamp: string;
}

export interface OneLineSummaryResult {
  oneLineAnswer: string;
  simpleExplanation: string;
  urduExplanation?: string;
  keyTakeaways: string[];
}

export interface SampleDoc {
  id: string;
  name: string;
  category: string;
  pages: number;
  description: string;
}
