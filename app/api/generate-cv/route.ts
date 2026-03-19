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

function buildSystemPrompt() {
  return `
You are an expert CV writer and LaTeX CV formatter.

Given a candidate's raw information and a target job description, you will:
- Rewrite the CV content to be tailored for this specific role.
- Emphasize the most relevant skills and experience.
- Use concise, impact-focused bullet points with strong verbs and where possible, metrics.
- Maintain a professional, neutral tone that would fit a senior software role CV.

Return ONLY a minified JSON object with the following shape (no markdown, no backticks, no explanation):
{
  "full_name": string,
  "email": string,
  "phone": string,
  "linkedin": string,
  "location": string,
  "summary": string,
  "experience": [
    {
      "company": string,
      "role": string,
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

Rules:
- Escape any LaTeX-sensitive characters by adding a backslash: %, $, &, #, _, {, }, ~, ^.
- Bullet points should be brief and high signal.
- Tailor language to match key phrases and competencies in the job description.
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
      const eduLocation = location;
      return `\\resumeSubheading
      {${eduInstitution}}{${eduYear}}
      {${eduDegree}}{${eduLocation}}`;
    })
    .join("\n\n");

  const experienceBlocks = cv.experience
    .map((exp) => {
      const bullets = exp.bullets
        .map((b) => `\\resumeItem{${escapeLatex(b)}}`)
        .join("\n        ");
      return `\\resumeSubheading
      {${escapeLatex(exp.company)}}{${escapeLatex(exp.duration)}}
      {${escapeLatex(exp.role)}}{${location}}
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
      {${certIssuer}}{${location}}`;
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
\\vspace{-15pt}

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
    const userPayload = {
      candidate_profile: {
        full_name: body.fullName,
        email: body.email,
        phone: body.phone,
        linkedin: body.linkedin,
        location: body.location,
        experiences: body.experiences,
        education: body.education,
        skills_raw: body.skills,
        certifications: body.certifications,
      },
      job_description: body.jobDescription,
    };

    const system = buildSystemPrompt();
    const prompt = `Here is the candidate data and job description as JSON. Return only the JSON object described above.\n\n${JSON.stringify(userPayload)}`;

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
      throw new Error("Unexpected response format from Groq.");
    }

    let cv: TailoredCV;
    try {
      cv = JSON.parse(text) as TailoredCV;
    } catch {
      throw new Error("Failed to parse Groq response as JSON.");
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

