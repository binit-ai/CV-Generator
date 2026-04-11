"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "cv-generator-saved-profile";

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

type SavedFormState = {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  experiences: Experience[];
  education: Education[];
  skills: string;
  certifications: Certification[];
  jobDescription: string;
};

const defaultExperience: Experience = {
  company: "",
  role: "",
  duration: "",
  description: "",
};

const defaultEducation: Education = {
  institution: "",
  degree: "",
  year: "",
};

const defaultCertification: Certification = {
  name: "",
  issuer: "",
  year: "",
};

export default function HomePage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [location, setLocation] = useState("");
  const [experiences, setExperiences] = useState<Experience[]>([
    { company: "", role: "", duration: "", description: "" },
  ]);
  const [education, setEducation] = useState<Education[]>([
    { institution: "", degree: "", year: "" },
  ]);
  const [skills, setSkills] = useState("");
  const [certifications, setCertifications] = useState<Certification[]>([
    { name: "", issuer: "", year: "" },
  ]);
  const [jobDescription, setJobDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "quick">("edit");
  const [hasSavedProfile, setHasSavedProfile] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<SavedFormState>;
      if (typeof data.fullName === "string") setFullName(data.fullName);
      if (typeof data.email === "string") setEmail(data.email);
      if (typeof data.phone === "string") setPhone(data.phone);
      if (typeof data.linkedin === "string") setLinkedin(data.linkedin);
      if (typeof data.location === "string") setLocation(data.location);
      if (Array.isArray(data.experiences) && data.experiences.length > 0) {
        setExperiences(data.experiences);
      }
      if (Array.isArray(data.education) && data.education.length > 0) {
        setEducation(data.education);
      }
      if (typeof data.skills === "string") setSkills(data.skills);
      if (Array.isArray(data.certifications) && data.certifications.length > 0) {
        setCertifications(data.certifications);
      }
      if (typeof data.jobDescription === "string") {
        setJobDescription(data.jobDescription);
      }
      setHasSavedProfile(true);
      setViewMode("quick");
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const saveProfile = () => {
    const payload: SavedFormState = {
      fullName,
      email,
      phone,
      linkedin,
      location,
      experiences,
      education,
      skills,
      certifications,
      jobDescription,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setHasSavedProfile(true);
  };

  const handleExperienceChange = (
    index: number,
    field: keyof Experience,
    value: string,
  ) => {
    setExperiences((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleEducationChange = (
    index: number,
    field: keyof Education,
    value: string,
  ) => {
    setEducation((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleCertificationChange = (
    index: number,
    field: keyof Certification,
    value: string,
  ) => {
    setCertifications((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addExperience = () =>
    setExperiences((prev) => [
      ...prev,
      { company: "", role: "", duration: "", description: "" },
    ]);

  const removeExperience = (index: number) =>
    setExperiences((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });

  const addEducation = () =>
    setEducation((prev) => [...prev, { institution: "", degree: "", year: "" }]);

  const removeEducation = (index: number) =>
    setEducation((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });

  const addCertification = () =>
    setCertifications((prev) => [
      ...prev,
      { name: "", issuer: "", year: "" },
    ]);

  const removeCertification = (index: number) =>
    setCertifications((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-cv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          linkedin,
          location,
          experiences,
          education,
          skills,
          certifications,
          jobDescription,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate CV");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored-cv.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 min-w-0 lg:grid-cols-[2fr,1.3fr]">
      <section className="card p-6 lg:p-8 min-w-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div>
            {viewMode === "quick" ? (
              <>
                <h1 className="text-xl font-semibold text-slate-900">
                  Quick apply
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Paste a target job description. Your saved profile is sent with
                  the request automatically.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-slate-900">
                  Create your tailored CV
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Enter your details and the target job description. Claude will
                  rewrite and structure your CV, then we will render a polished
                  PDF via LaTeX.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {viewMode === "edit" && (
              <button
                type="button"
                onClick={saveProfile}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                Save Profile
              </button>
            )}
            <span className="badge">PDF download</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {viewMode === "quick" ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="section-title mb-0">Target job description</h2>
                  <span className="text-[11px] text-slate-400">
                    Uses your saved profile
                  </span>
                </div>
                <textarea
                  className="input min-h-[180px]"
                  placeholder="Paste the full job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setViewMode("edit")}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  Edit Profile
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Generating PDF..." : "Generate CV"}
                </button>
              </div>
            </>
          ) : (
            <>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Location</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">LinkedIn URL</label>
              <input
                type="url"
                className="input"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <h2 className="section-title">Work experience</h2>
            <div className="space-y-4">
              {experiences.map((exp, idx) => (
                <div key={idx} className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Company</label>
                    <input
                      className="input"
                      value={exp.company}
                      onChange={(e) =>
                        handleExperienceChange(idx, "company", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Role</label>
                    <input
                      className="input"
                      value={exp.role}
                      onChange={(e) =>
                        handleExperienceChange(idx, "role", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Duration</label>
                    <input
                      className="input"
                      placeholder="e.g. 2021 – Present"
                      value={exp.duration}
                      onChange={(e) =>
                        handleExperienceChange(idx, "duration", e.target.value)
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Key achievements</label>
                    <textarea
                      className="input min-h-[70px]"
                      placeholder="Bullet-style achievements, impact, and responsibilities"
                      value={exp.description}
                      onChange={(e) =>
                        handleExperienceChange(
                          idx,
                          "description",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => removeExperience(idx)}
                      disabled={experiences.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-medium text-primary-700 hover:underline"
                onClick={addExperience}
              >
                + Add another experience
              </button>
            </div>
          </div>

          <div>
            <h2 className="section-title">Education</h2>
            <div className="space-y-4">
              {education.map((ed, idx) => (
                <div key={idx} className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">Institution</label>
                    <input
                      className="input"
                      value={ed.institution}
                      onChange={(e) =>
                        handleEducationChange(
                          idx,
                          "institution",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Degree</label>
                    <input
                      className="input"
                      value={ed.degree}
                      onChange={(e) =>
                        handleEducationChange(idx, "degree", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Year</label>
                    <input
                      className="input"
                      value={ed.year}
                      onChange={(e) =>
                        handleEducationChange(idx, "year", e.target.value)
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => removeEducation(idx)}
                      disabled={education.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-medium text-primary-700 hover:underline"
                onClick={addEducation}
              >
                + Add another education
              </button>
            </div>
          </div>

          <div>
            <h2 className="section-title">Skills</h2>
            <textarea
              className="input min-h-[70px]"
              placeholder="Comma-separated or bullet-style skills"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </div>

          <div>
            <h2 className="section-title">Certifications</h2>
            <div className="space-y-4">
              {certifications.map((cert, idx) => (
                <div key={idx} className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="label">Certification</label>
                    <input
                      className="input"
                      value={cert.name}
                      onChange={(e) =>
                        handleCertificationChange(idx, "name", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Issuer</label>
                    <input
                      className="input"
                      value={cert.issuer}
                      onChange={(e) =>
                        handleCertificationChange(
                          idx,
                          "issuer",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Year</label>
                    <input
                      className="input"
                      value={cert.year}
                      onChange={(e) =>
                        handleCertificationChange(idx, "year", e.target.value)
                      }
                    />
                  </div>
                  <div className="md:col-span-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => removeCertification(idx)}
                      disabled={certifications.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-medium text-primary-700 hover:underline"
                onClick={addCertification}
              >
                + Add another certification
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="section-title mb-0">Target job description</h2>
              <span className="text-[11px] text-slate-400">
                Claude will tailor your CV to this
              </span>
            </div>
            <textarea
              className="input min-h-[140px]"
              placeholder="Paste the full job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-500 max-w-xs">
              Your data is used only to generate a one-off tailored CV and is
              not stored server-side beyond the generation step.
            </p>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Generating PDF..." : "Generate tailored CV PDF"}
            </button>
          </div>
            </>
          )}
        </form>
      </section>

      <aside className="space-y-4 min-w-0">
        {hasSavedProfile && fullName.trim() !== "" && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Your profile
            </h2>
            <p className="text-xs text-slate-500 mb-2">
              Saved locally in this browser. Click your name to open Quick
              apply.
            </p>
            <button
              type="button"
              onClick={() => setViewMode("quick")}
              className="text-left w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-900 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              {fullName}
            </button>
          </div>
        )}

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">
            How it works
          </h2>
          <ol className="space-y-2 text-xs text-slate-600 list-decimal list-inside">
            <li>Fill in your core profile and experience.</li>
            <li>Paste the target job description.</li>
            <li>
              We send everything securely to Claude to rewrite and structure
              your CV for this role.
            </li>
            <li>
              The AI output is mapped into a professional LaTeX CV template and
              compiled with `pdflatex` on this server.
            </li>
            <li>Download your tailored CV as a high-quality PDF.</li>
          </ol>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">
            Tips for best results
          </h2>
          <ul className="space-y-2 text-xs text-slate-600 list-disc list-inside">
            <li>Use concrete, impact-focused bullet points in experience.</li>
            <li>Include metrics and outcomes where possible.</li>
            <li>
              Paste the full job description so Claude can align language and
              keywords.
            </li>
            <li>
              Group skills by category (e.g. languages, frameworks, tooling).
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
