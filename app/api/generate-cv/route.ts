import { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";


const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey
  ? new Groq({
      apiKey: groqApiKey,
    })
  : null;

type Experience = {
  company: string;
  role: string;
  duration: string;
  description: string;
};

type Education = {
  institution: string;
  degree: string;
  year: string;
};

type Certification = {
  name: string;
  issuer: string;
  year: string;
};

type TailoredCV = {
  full_name: string;
  email: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  summary: string;
  experience: {
    company: string;
    role: string;
    duration: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    year: string;
    details?: string[];
  }[];
  skills_sections: {
    title: string;
    items: string[];
  }[];
  certifications?: {
    name: string;
    issuer?: string;
    year?: string;
  }[];
};

/**
 * Groq sometimes returns JSON wrapped in markdown fences or with leading prose.
 * Try several extractions before giving up.
 */
function parseGroqJsonToTailoredCv(raw: string): TailoredCV {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];

  const fullFence = trimmed.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/);
  if (fullFence) {
    candidates.push(fullFence[1].trim());
  }

  if (trimmed.startsWith("```")) {
    let inner = trimmed.replace(/^```(?:json)?\s*\r?\n?/i, "");
    inner = inner.replace(/\r?\n?```\s*$/i, "").trim();
    if (inner) candidates.push(inner);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  const seen = new Set<string>();
  let lastError: unknown;
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    try {
      return JSON.parse(c) as TailoredCV;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function buildSystemPrompt() {
  return `
You are an elite Executive Resume Writer and ATS (Applicant Tracking System) Optimization Specialist.

Given a candidate's raw information and a target job description, your objective is to completely optimize the CV content to achieve a maximum ATS match score while remaining compelling to human recruiters, without fabricating any information.

Core Directives:
1. Zero-Hallucination Rule: You are strictly forbidden from adding programming languages, frameworks, degrees, or job titles that the candidate did not explicitly provide. Do not hallucinate skills or experiences to match the Job Description (JD).
2. Strategic Reframing: Pivot the candidate's existing experience to highlight valid overlaps with the JD. Reframe their true accomplishments to speak directly to the target role's requirements, but do not invent new responsibilities.
3. ATS Keyword Mapping: Where the candidate's actual skills and experiences intersect with the JD's requirements, mirror the specific terminology mentioned in the JD. 
4. High-Impact Bullet Points: Every bullet point must follow the XYZ format: "Accomplished [X] as measured by [Y], by doing [Z]".
    * Start with a strong, high-signal action verb (e.g., Architected, Spearheaded, Optimized).
    * Clearly state the technical or strategic action.
    * Metric Integrity: Do not invent metrics, percentages, or scale. If the raw data lacks quantitative data, focus entirely on qualitative impact using strong, direct, and sensory language.
5. Density and Signal: Maintain a direct and impactful writing style. Eliminate filler words, passive voice, and generic "responsible for" phrasing. Keep bullets concise and tightly packed with true technical keywords.
6. Strict Formatting: Escape all LaTeX-sensitive characters by adding a backslash: %, $, &, #, _, {, }, ~, ^. (e.g., \\%).

Return ONLY a minified JSON object matching the following schema. Do not include markdown code blocks, backticks, or any conversational text:
{
  "full_name": string,
  "email": string,
  "phone": string,
  "linkedin": string,
  "location": string,
  "summary": "2-3 sentences max. Dense with true keywords, stating the candidate's core value proposition for this specific role in a highly direct tone.",
  "experience": [
    {
      "company": string,
      "role": "Strict Title Preservation: You must use the exact job titles provided by the candidate.",
      "duration": string,
      "bullets": string[]
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string,
      "year": string,
      "details": string[]
    }
  ],
  "skills_sections": [
    {
      "title": string,
      "items": string[]
    }
  ],
  "certifications": [
    {
      "name": string,
      "issuer": string,
      "year": string
    }
  ]
}

Schema notes (apply when generating JSON):
- experience.bullets: 3-4 heavily optimized, direct bullets per role.
- skills_sections.title: e.g. "Languages", "Frameworks", "Cloud & Tools"; organize the candidate's actual skills, front-loading the ones explicitly requested in the JD.
`.trim();
}

function escapeLatex(text: string | undefined | null): string {
  if (!text) return "";
  const sanitized = text.replace(/\r?\n/g, " ");
  return sanitized
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/&/g, "\\&")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function buildLatex(cv: TailoredCV): string {
  const firstLast = escapeLatex(cv.full_name);
  const email = escapeLatex(cv.email);
  const phone = escapeLatex(cv.phone);
  const linkedin = escapeLatex(cv.linkedin);
  const location = escapeLatex(cv.location);

  const headerPhonePart = cv.phone
    ? `\\raisebox{-0.1\\height}\\faPhone\\ ${phone}`
    : "";
  const headerEmailPart = cv.email
    ? `\\href{mailto:${escapeLatex(cv.email)}}{\\raisebox{-0.2\\height}\\faEnvelope\\ \\underline{${email}}}`
    : "";
  const headerLinkedInPart = cv.linkedin
    ? `\\href{${linkedin}}{\\raisebox{-0.2\\height}\\faLinkedin\\ \\underline{${linkedin}}}`
    : "";

  const headerParts = [headerPhonePart, headerEmailPart, headerLinkedInPart]
    .filter(Boolean)
    .join(" ~ ");

  const educationBlocks = cv.education
    .map((ed) => {
      const eduInstitution = escapeLatex(ed.institution);
      const eduYear = escapeLatex(ed.year);
      const eduDegree = escapeLatex(ed.degree);
      return `\\resumeSubheading
      {${eduInstitution}}{${eduYear}}
      {${eduDegree}}{}`;
    })
    .join("\n\n");

  const experienceBlocks = cv.experience
    .map((exp) => {
      const bullets = exp.bullets
        .map((b) => `\\resumeItem{${escapeLatex(b)}}`)
        .join("\n        ");
      return `\\resumeSubheading
      {${escapeLatex(exp.company)}}{${escapeLatex(exp.duration)}}
      {${escapeLatex(exp.role)}}{}
      \\resumeItemListStart
        ${bullets}
      \\resumeItemListEnd`;
    })
    .join("\n\n");

  const projectsBlocks = cv.experience
    .map((exp) => {
      const bullets = exp.bullets
        .slice(0, 3)
        .map((b) => `\\resumeItem{${escapeLatex(b)}}`)
        .join("\n            ");

      return `\\resumeProjectHeading
          {\\textbf{${escapeLatex(exp.role)}} $|$ \\emph{${escapeLatex(exp.company)}}}{${escapeLatex(
            exp.duration
          )}}
          \\resumeItemListStart
            ${bullets}
          \\resumeItemListEnd 
          \\vspace{-13pt}`;
    })
    .join("\n      ");

  const skillsFlat = cv.skills_sections.flatMap((s) => s.items);
  const courseworkItems = skillsFlat
    .slice(0, 8)
    .map((i) => `\\item\\small ${escapeLatex(i)}`)
    .join("\n                ");

  const technicalSkillLines =
    cv.skills_sections.length > 0
      ? cv.skills_sections
          .map((section) => {
            const title = escapeLatex(section.title);
            const items = section.items.map(escapeLatex).join(", ");
            return `\\textbf{${title}}{: ${items}} \\\\`;
          })
          .join("\n     ")
      : `\\textbf{Skills}{: } \\\\`;

  const certificationsBlocks =
    cv.certifications && cv.certifications.length
      ? cv.certifications
          .map((c) => {
            const certName = escapeLatex(c.name);
            const certYear = escapeLatex(c.year || "");
            const certIssuer = escapeLatex(c.issuer || "");
            return `\\resumeSubheading
      {${certName}}{${certYear}}
      {${certIssuer}}{}`;
          })
          .join("\n\n")
      : "";

  const certificationsSection =
    certificationsBlocks.length > 0
      ? `
\\section{Certifications}
  \\resumeSubHeadingListStart
    ${certificationsBlocks}
  \\resumeSubHeadingListEnd
\\vspace{-16pt}`
      : "";

  // NOTE: Jake's template uses titlesec.sty; your TeX Live install may not have it.
  // We conditionally enable it when available, otherwise LaTeX still compiles.
  return `
%-------------------------
% Resume in Latex
% Author : Jake Gutierrez
% Based off of: https://github.com/sb2nov/resume
% License : MIT
%------------------------

\\documentclass[letterpaper,11pt]{article}

\\usepackage{latexsym}
\\IfFileExists{fullpage.sty}{
  \\usepackage[empty]{fullpage}
}{}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\IfFileExists{titlesec.sty}{
  \\usepackage{titlesec}
  \\titleformat{\\section}{
    \\vspace{-4pt}\\scshape\\raggedright\\large\\bfseries
  }{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
}{}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{fontawesome5}
\\usepackage{multicol}
\\setlength{\\multicolsep}{-3.0pt}
\\setlength{\\columnsep}{-1pt}
\\input{glyphtounicode}

\\pagestyle{fancy}
\\fancyhf{} % clear all header and footer fields
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

% Adjust margins (slightly more compact)
\\addtolength{\\oddsidemargin}{-0.65in}
\\addtolength{\\evensidemargin}{-0.55in}
\\addtolength{\\textwidth}{1.22in}
\\addtolength{\\topmargin}{-.75in}
\\addtolength{\\textheight}{1.42in}

\\urlstyle{same}

\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

% Ensure that generate pdf is machine readable/ATS parsable
\\pdfgentounicode=1

%-------------------------
% Custom commands
\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-2pt}}
  }
}

\\newcommand{\\classesList}[4]{
    \\item\\small{
        {#1 #2 #3 #4 \\vspace{-2pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & \\textbf{\\small #2} \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubSubheading}[2]{
  \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\textit{\\small#1} & \\textit{\\small #2} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{1.001\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & \\textbf{\\small #2}\\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}

\\renewcommand\\labelitemi{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.0in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

\\begin{document}

%----------HEADING----------
\\begin{center}
    {\\Huge \\scshape ${firstLast}} \\\\ \\vspace{1pt}
    ${location} \\\\ \\vspace{1pt}
    \\small ${headerParts} \\\\ \\vspace{-8pt}
\\end{center}

%-----------EDUCATION-----------
\\section{Education}
  \\resumeSubHeadingListStart
    ${educationBlocks}
  \\resumeSubHeadingListEnd

%------RELEVANT COURSEWORK-------
\\section{Relevant Coursework}
    \\begin{multicols}{4}
        \\begin{itemize}[itemsep=-5pt, parsep=3pt]
            ${courseworkItems}
        \\end{itemize}
    \\end{multicols}
    \\vspace*{2.0\\multicolsep}

%-----------EXPERIENCE-----------
\\section{Experience}
  \\resumeSubHeadingListStart
    ${experienceBlocks}
  \\resumeSubHeadingListEnd
\\vspace{-16pt}

%-----------PROJECTS-----------
\\section{Projects}
    \\vspace{-5pt}
    \\resumeSubHeadingListStart
      ${projectsBlocks}
    \\resumeSubHeadingListEnd
\\vspace{14pt}

%-----------TECHNICAL SKILLS-----------
\\section{Technical Skills}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     ${technicalSkillLines}
    }}
 \\end{itemize}
 \\vspace{-16pt}

${certificationsSection}

\\end{document}
`.trim();
}

export async function POST(req: NextRequest) {
  if (!groqApiKey || !groq) {
    return new Response(
      JSON.stringify({
        error:
          "GROQ_API_KEY is not set. Please configure it in .env.local.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: {
    fullName: string;
    email: string;
    phone?: string;
    linkedin?: string;
    location?: string;
    experiences: Experience[];
    education: Education[];
    skills: string;
    certifications: Certification[];
    jobDescription: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!body.fullName || !body.email || !body.jobDescription) {
    return new Response(
      JSON.stringify({
        error: "fullName, email, and jobDescription are required.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const system = buildSystemPrompt();
    const prompt = `
TARGET JOB DESCRIPTION:
${body.jobDescription}

CANDIDATE RAW DATA:
${JSON.stringify({
  full_name: body.fullName,
  email: body.email,
  phone: body.phone,
  linkedin: body.linkedin,
  location: body.location,
  experiences: body.experiences,
  education: body.education,
  skills_raw: body.skills,
  certifications: body.certifications,
})}

INSTRUCTIONS:
1. Analyze the TARGET JOB DESCRIPTION to extract primary required skills, core competencies, and exact technical vocabulary.
2. Rewrite the CANDIDATE RAW DATA to perfectly align with those extracted elements. 
3. Elevate relevant experience to the top of bullet lists and rephrase previous duties to demonstrate proficiency in the target role's requirements.
4. Output ONLY the raw, valid JSON object requested in the system prompt.
`.trim();

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error("[Groq] Empty message content.", {
        id: (completion as { id?: string }).id,
        choices: completion.choices?.length,
      });
      throw new Error("Unexpected response format from Groq.");
    }

    let cv: TailoredCV;
    try {
      cv = parseGroqJsonToTailoredCv(text);
    } catch (parseErr) {
      console.error("[Groq] JSON parse failed after extraction attempts.");
      console.error("[Groq] Parse error:", parseErr);
      console.error("[Groq] Raw response length:", text.length);
      console.error("[Groq] Raw response (full):\n", text);
      console.error("[Groq] Completion meta:", {
        id: (completion as { id?: string }).id,
        model: (completion as { model?: string }).model,
        finish_reason: completion.choices?.[0]?.finish_reason,
      });
      throw new Error(
        "Failed to parse Groq response as JSON. Check server logs for [Groq] lines.",
      );
    }

    const latexSource = buildLatex(cv);
    console.log("LaTeX being written (full content):\n", latexSource);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-gen-"));
    const texPath = path.join(tmpDir, "cv.tex");
    const pdfPath = path.join(tmpDir, "cv.pdf");

    console.error("CV generation temp dir:", tmpDir);
    console.error("LaTeX output (cv.tex content):\n", latexSource);

    // Write a stable debug file for local inspection.
    // (This is outside the temp dir we use for pdflatex compilation.)
    const debugTexPath = "/tmp/cv-debug.tex";
    try {
      await fs.writeFile(debugTexPath, latexSource, "utf8");
      const debugStat = await fs.stat(debugTexPath);
      console.error(
        "Wrote debug .tex file:",
        debugTexPath,
        "sizeBytes:",
        debugStat.size,
      );
    } catch (e) {
      console.error("Failed to write debug .tex file:", debugTexPath, e);
    }

    await fs.writeFile(texPath, latexSource, "utf8");

    try {
      const texStat = await fs.stat(texPath);
      console.error("Wrote .tex file:", texPath, "sizeBytes:", texStat.size);
      await fs.access(texPath);
      console.error(".tex file access check: OK");

      const texbin = "/Library/TeX/texbin";
      const pdflatexPath = `${texbin}/pdflatex`;
      const childEnvPath =
        "/Library/TeX/texbin:/usr/local/bin:/usr/bin:/bin";

      console.error("Running pdflatex:");
      console.error("  executable:", pdflatexPath);
      console.error("  cwd:", tmpDir);
      console.error("  args:", [
        "-interaction=nonstopmode",
        "-halt-on-error",
        "cv.tex",
      ]);
      console.error("  child PATH:", childEnvPath);

      const compileResult = await new Promise<{
        stdout: string;
        stderr: string;
      }>((resolve, reject) => {
        execFile(
          pdflatexPath,
          ["-interaction=nonstopmode", "-halt-on-error", "cv.tex"],
          {
            cwd: tmpDir,
            env: {
              ...process.env,
              PATH: childEnvPath,
            },
          },
          (error, stdout, stderr) => {
            if (error) {
              const e: any = error;
              e.stdout = stdout;
              e.stderr = stderr;
              reject(e);
              return;
            }
            resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
          },
        );
      });

      console.error("pdflatex stdout:\n", compileResult.stdout);
      console.error("pdflatex stderr:\n", compileResult.stderr);

      // Verify PDF existence after compilation attempt.
      try {
        const pdfStat = await fs.stat(pdfPath);
        console.error(
          "PDF exists after compilation:",
          pdfPath,
          "sizeBytes:",
          pdfStat.size,
        );
      } catch (e) {
        console.error("PDF does NOT exist after compilation:", pdfPath, e);
      }
    } catch (err) {
      const anyErr: any = err;
      console.error("pdflatex compile failed.");
      console.error("Error message:", anyErr?.message);
      console.error("Error code:", anyErr?.code);
      console.error("Error signal:", anyErr?.signal);
      console.error("pdflatex stdout:\n", anyErr?.stdout);
      console.error("pdflatex stderr:\n", anyErr?.stderr);
      console.error("Expected PDF path:", pdfPath);

      try {
        const pdfStat = await fs.stat(pdfPath);
        console.error(
          "PDF exists even after failure:",
          pdfPath,
          "sizeBytes:",
          pdfStat.size,
        );
      } catch (e) {
        console.error("PDF missing after failure:", pdfPath, e);
      }

      throw new Error(
        "Failed to compile LaTeX to PDF. Ensure pdflatex is installed on the server.",
      );
    }

    const pdfBuffer = await fs.readFile(pdfPath);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="tailored-cv.pdf"',
      },
    });
  } catch (err: any) {
    console.error("Error generating CV", err);
    return new Response(
      JSON.stringify({
        error:
          err?.message ||
          "An unexpected error occurred while generating the CV.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

