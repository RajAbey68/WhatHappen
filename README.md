# WhatsApp Analyzer

## Purpose
Analyze exported WhatsApp chats and surface insights with visual analytics and AI-assisted search.

## Outcomes
- Upload chat exports and get structured analysis
- View metrics and visualizations (activity over time, top words, sentiment)
- Ask AI questions (semantic, keyword, financial, sentiment)
- Browse and search messages and participants

## What It Does
- File processing and analysis
  - Accepted by UI: .txt, .zip, .json, .docx, .pdf, .csv
  - Currently processed by server: .txt, .docx, .pdf, .csv, .json (not .zip)
  - Extracts WhatsApp messages, classifies (text/media/system), runs sentiment per text message, and computes:
    - Participants, total messages, date range
    - Messages by participant
    - Daily and hourly distributions
    - Word frequency (top words)
    - Media vs text counts
    - Average message length
- AI-assisted search (requires OPENAI_API_KEY)
  - Semantic search and summaries
  - Financial-topic detection and summarization
  - Keyword search
  - Sentiment breakdowns
- Multi-file aggregation
  - Aggregates metrics across multiple uploads (participants, distributions, word frequencies)

## Primary User Flow
1. Upload chat files in the Upload tab
2. The server processes the file(s) and returns analysis + sample messages
3. View metrics in Analytics
4. Ask questions in AI Chat
5. Browse/search messages in Search

## Tech Stack
- Frontend: Next.js 14 (App Router), React 18, TypeScript, Tailwind, Radix UI/shadcn
- Server: Next.js API routes (Node 18+)
- AI: OpenAI SDK (semantic/financial summaries)
- Parsing/analysis: mammoth (DOCX), pdf-parse (PDF), csv-parse (CSV), natural, sentiment
- Tests: Jest + Testing Library
- Note: Firebase is present but currently disabled in routes

## Setup
1. Requirements: Node >= 18
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Optional: enable AI features by setting an environment variable before running:
   ```bash
   export OPENAI_API_KEY=your_key_here
   ```

## API Endpoints (internal)
- POST `/api/process-file`
  - Body: multipart/form-data with `file`
  - Returns: normalized analysis plus preview messages
- POST `/api/ai-search`
  - Body: `{ query, chatData, searchType?, options? }`
  - Modes: `financial`, `semantic`, `keyword`, `sentiment`

## Data Handling & Privacy
- Processing occurs server-side within this Next.js app.
- AI calls (semantic/financial) send only the provided subset of messages to OpenAI.

## Limitations & Notes
- UI accepts `.zip` but the server currently rejects it.
- Without `OPENAI_API_KEY`, only keyword/sentiment (non-LLM paths) run with fallbacks.
- For performance, only a subset of messages is returned to the client for previews/AI context.
- Firebase integrations are disabled for now.

## Notable Files
- `app/page.tsx`: App shell/tabs and state
- `components/file-upload.tsx`: Upload, progress, multi-file aggregation
- `components/dashboard.tsx`: Visual analytics
- `components/database-viewer.tsx`: Search/browse UI
- `components/ai-chat-interface.tsx`: Chat UI to `/api/ai-search`
- `app/api/process-file/route.ts`: Parsing + metrics + sentiment
- `app/api/ai-search/route.ts`: AI/keyword/sentiment/financial search