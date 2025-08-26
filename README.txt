WhatsApp Analyzer

Purpose
Analyze exported WhatsApp chats and surface insights with visual analytics and AI-assisted search.

Outcomes
- Upload chat exports and get structured analysis
- View metrics and visualizations (activity over time, top words, sentiment)
- Ask AI questions (semantic, keyword, financial, sentiment)
- Browse and search messages and participants

What It Does
- File processing and analysis
  - UI accepts: .txt, .zip, .json, .docx, .pdf, .csv
  - Server processes: .txt, .docx, .pdf, .csv, .json (not .zip)
  - Extracts WhatsApp messages, classifies (text/media/system), sentiment per text message, and computes participants, totals, date range, messages by participant, daily/hourly distributions, word frequency, media vs text counts, average message length
- AI-assisted search (requires OPENAI_API_KEY)
  - Semantic search and summaries
  - Financial-topic detection and summarization
  - Keyword search
  - Sentiment breakdowns
- Multi-file aggregation across uploads

Primary User Flow
1) Upload chat files in the Upload tab
2) Server processes file(s) and returns analysis + sample messages
3) View metrics in Analytics
4) Ask questions in AI Chat
5) Browse/search messages in Search

Tech Stack
- Frontend: Next.js 14, React 18, TypeScript, Tailwind, Radix UI/shadcn
- Server: Next.js API routes (Node 18+)
- AI: OpenAI SDK
- Parsing/analysis: mammoth, pdf-parse, csv-parse, natural, sentiment
- Tests: Jest + Testing Library
- Firebase present but disabled in routes

Setup
- Node >= 18
- Install: npm install
- Dev server: npm run dev
- Optional: export OPENAI_API_KEY=your_key_here

API Endpoints (internal)
- POST /api/process-file: multipart/form-data with file; returns analysis + preview
- POST /api/ai-search: { query, chatData, searchType?, options? }; modes: financial, semantic, keyword, sentiment

Data Handling & Privacy
- Processing happens within this app; AI calls only send provided subsets to OpenAI when used.

Limitations & Notes
- UI accepts .zip, server currently rejects .zip
- Without OPENAI_API_KEY, only keyword/sentiment non-LLM paths run with fallbacks
- Client receives only a subset of messages for performance
- Firebase integrations disabled

Notable Files
- app/page.tsx
- components/file-upload.tsx
- components/dashboard.tsx
- components/database-viewer.tsx
- components/ai-chat-interface.tsx
- app/api/process-file/route.ts
- app/api/ai-search/route.ts