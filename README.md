# InScribe AI

**Not just another chatbot—this is a full‐stack, retrieval-augmented document analysis platform, built end-to-end with production-grade architecture and polished UX.**

---

## ✨ UI Showcase (Dark & Light Mode)

<p align="center">
  <img src="/assets/home-page-dark.png" width="360" alt="Home Dark"/>
  &nbsp;&nbsp;
  <img src="/assets/home-page-light.png" width="360" alt="Home Light"/>
</p>

<p align="center">
  <img src="/assets/sign-in-page-dark.png" width="360" alt="Sign In Dark"/>
  &nbsp;&nbsp;
  <img src="/assets/sign-in-page-light.png" width="360" alt="Sign In Light"/>
</p>

<p align="center">
  <img src="/assets/dashboard-page-dark.png" width="360" alt="Dashboard Dark"/>
  &nbsp;&nbsp;
  <img src="/assets/dashboard-page-light.png" width="360" alt="Dashboard Light"/>
</p>

<p align="center">
  <img src="/assets/document-page-dark.png" width="360" alt="Document Dark"/>
  &nbsp;&nbsp;
  <img src="/assets/document-page-light.png" width="360" alt="Document Light"/>
</p>

---

## 🚀 Why This Project?

I built InScribe AI to demonstrate deep, hands-on experience with modern full-stack development, cloud services, and AI-driven workflows. Rather than a simple “ChatGPT wrapper,” it showcases:

- **Secure file upload & storage**
- **Asynchronous background processing**
- **Vector-based semantic search (RAG)**
- **Custom, responsive dashboard & chat UI**
- **Dark-mode default, theme tokens & micro-animations**

I tackled real engineering challenges—auth, state management, polling, error handling, deployment—learning far more than through small toy projects.

---

## 🤖 AI Assistance Disclaimer

In today’s landscape, leveraging Large Language Models (LLMs) is the modern workflow and a powerful tool when used responsibly. I **did** use LLMs (ChatGPT, embeddings) and Copilot to accelerate boilerplate and prototype certain prompts, but:

- **I drove every design and engineering decision.**
- **I wrote and maintain all core application code, UI components, and backend logic.**
- **I fully understand how each piece of the system works**, from vector storage and retrieval through to the FastAPI background tasks and Next.js UI.

LLMs were a productivity support—**not** a substitute for the real engineering, testing, and architectural trade-offs that went into this project.

---

## 🔍 Retrieval-Augmented Generation (RAG)

Rather than sending an entire PDF to the LLM every time, InScribe AI:

1. **Extracts & splits** the text into manageable chunks.
2. **Generates embeddings** (vector representations) for each chunk using OpenAI Embeddings.
3. **Stores chunks & embeddings** in Supabase’s vector store.
4. **On query**, embeds the user’s question, performs a **vector similarity search** to fetch the top N relevant chunks.
5. **Constructs a prompt** combining those chunks and the question, then calls the LLM to generate a precise answer.

**Advantages of RAG**

- **Cost & speed:** Only a few chunks are sent to the LLM instead of the entire document.
- **Precision:** Answers are grounded in actual document content—no hallucinations.
- **Scalability:** Supports very large PDFs without hitting token limits.

---

## 🏗 Architecture Overview

### Frontend

- **Next.js (App Router)** & **React** (TypeScript)
- **Tailwind CSS** with CSS-variable theming & dark-mode-first tokens
- **Framer Motion** for subtle, spring-based animations
- **Lucide Icons** for crisp SVG actions
- **Supabase JS** for auth & real-time DB interactions
- **Features:**
  - Dashboard with two-column, responsive card grid
  - Quick-action menus (rename/delete) via custom API
  - Document detail page with split summary/chat layout
  - Custom scrollbars, sticky inputs, loading/empty states

### Backend

- **FastAPI** (Python)
- **Supabase service-role client** for secure DB operations
- **LangChain** for summarization (refine chain)
- **OpenAI Embeddings** and **ChatOpenAI**
- **Async background tasks**: upload → extract → summarize → embed → store → mark ready
- **Custom endpoints** for rename & delete actions (clean separation of concerns)
- **CORS, logging, error handling** to production standards

---

## 🛠️ Key Learnings

- **RAG pipelines:** Chunking strategies, embedding storage & retrieval
- **Async processing:** BackgroundTasks in FastAPI, robust status polling
- **Secure full-stack auth & RBAC:** Supabase’s row-level security, anonymized keys
- **Advanced theming:** CSS variables + Tailwind + dark mode toggle UI
- **Micro-interactions:** Spring animations for buttons, cards, toasts
- **API design:** Clean REST endpoints for user-driven actions (rename, delete)
- **Scalable UX:** Responsive layouts, custom scrollbars, modular components

---

## 🔗 Running & Demo

> Live demo or screen recording available upon request—please reach out!  
> Email: kaustubh.siriki@gmail.com
