## Tailored CV Generator

Full-stack CV generator built with Next.js, Tailwind CSS, Groq, and LaTeX. It tailors your CV to a specific job description and returns a polished PDF.

### Getting started

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment**

Update `.env.local` with your Groq API key:

```bash
GROQ_API_KEY=your_real_key_here
```

3. **Ensure LaTeX is installed**

Install a LaTeX distribution that includes `pdflatex` (e.g. MacTeX on macOS, TeX Live on Linux).

4. **Run the dev server**

```bash
npm run dev
```

Then open `http://localhost:3000` in your browser.

### How it works

- The main form lives in `app/page.tsx`.
- On submit, it posts data and the job description to `app/api/generate-cv/route.ts`.
- The API calls Groq (`llama-3.3-70b-versatile`) via the Groq TypeScript SDK, asking for a structured JSON CV payload.
- The JSON is rendered into a LaTeX CV template, written to a temporary directory, and compiled with `pdflatex`.
- The compiled PDF is streamed back to the browser as a download.

