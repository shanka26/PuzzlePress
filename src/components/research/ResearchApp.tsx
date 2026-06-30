"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookCopy, CheckCircle2, CircleAlert, Download, FileJson, FileText, Plus, RefreshCw, Save, Sparkles, Table2, WandSparkles } from "lucide-react";
import { createDraftResearchProject, generateMockProject, normalizeResearchWord } from "@/lib/ai/mockProvider";
import { loadResearchProjects, saveResearchProject, saveResearchProjects } from "@/lib/research-storage";
import { toBookProject, toPuzzlePressJson, toResearchCsv, toResearchMarkdown } from "@/lib/research-export";
import { validateResearchProject } from "@/lib/research-validation";
import { loadProjects, saveActiveProjectId, saveProjects, upsertProject } from "@/lib/storage";
import { sampleBook } from "@/data/sample-book";
import type { GenerationTask } from "@/lib/ai/types";
import type { ResearchFormat, ResearchInput, ResearchProject } from "@/types/research";

export const researchPresets = ["1950s Nostalgia for Seniors", "Growing Up Black in the 1950s", "Growing Up in Church in the 1950s", "Black Love Word Search", "Black Family Reunion Word Search", "Gospel Music Word Search", "Motown and Soul Word Search", "HBCU Memories Word Search"];
const emptyInput: ResearchInput = { seedIdea: "", targetAudience: "", decade: "", culturalFocus: "", religiousFocus: "", difficultyLevel: "easy-to-medium", tone: ["nostalgic", "joyful"], format: "large-print-word-search", sectionCount: 4, puzzlesPerSection: 5, wordsPerPuzzle: 20 };
type Mode = "overview" | "outline" | "words" | "export";

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "research-project";

function saveAsBookProject(project: ResearchProject) {
  const books = loadProjects();
  const linked = books.find((book) => book.id === project.bookProjectId);
  const bookId = linked?.id || crypto.randomUUID();
  const book = toBookProject(project, structuredClone(linked || sampleBook), bookId);
  saveProjects(upsertProject(books, book));
  saveActiveProjectId(book.id);
  return book;
}

function ResearchFrame({ children, title, linkedBookId }: { children: React.ReactNode; title?: string; linkedBookId?: string }) {
  const studioHref = linkedBookId ? `/?book=${linkedBookId}&view=editor` : "/";
  return <div className="research-shell"><header className="research-topbar"><Link className="research-brand" href="/"><span className="brand-mark"><span /></span><strong>PuzzlePress</strong></Link><div><span>Book workflow · Research & data</span>{title && <strong>{title}</strong>}</div><Link className="button" href={studioHref}><ArrowLeft size={14} /> {linkedBookId ? "Back to linked book" : "Book Studio"}</Link></header>{children}</div>;
}

export function ResearchIndex() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  useEffect(() => { const timer = window.setTimeout(() => setProjects(loadResearchProjects()), 0); return () => window.clearTimeout(timer); }, []);
  function duplicate(project: ResearchProject) { const now = new Date().toISOString(); const copy = structuredClone(project); copy.id = crypto.randomUUID(); copy.bookProjectId = undefined; copy.createdAt = now; copy.updatedAt = now; copy.status = "draft"; copy.seedIdea += " — Copy"; copy.generatedBook.title += " — Copy"; const next = [copy, ...projects]; setProjects(next); saveResearchProjects(next); }
  return <ResearchFrame><main className="research-content"><div className="page-heading"><div><div className="eyebrow">The first stage of your book workflow</div><h1 className="page-title">Research & Data Generator</h1><p className="page-subtitle">Develop the concept, structure, and word lists here, then continue directly into grids, templates, preview, and PDF export.</p></div><Link className="button primary" href="/research/new"><Plus size={15} /> New research project</Link></div>
    {projects.length ? <div className="research-project-grid">{projects.map((project) => <article className="research-card" key={project.id}><div className="research-card-accent"><Sparkles size={20} /></div><div><span className="tag">{project.bookProjectId ? "linked to book" : project.status}</span><h2>{project.generatedBook.title || project.seedIdea}</h2><p>{project.marketResearch.recommendedPositioning || "Ready to generate market positioning and a full outline."}</p><small>{project.sectionCount} sections · {project.sectionCount * project.puzzlesPerSection} puzzles · {project.wordsPerPuzzle} words each</small></div><div className="research-card-actions"><Link className="button primary small" href={`/research/${project.id}`}>Open research</Link>{project.bookProjectId && <Link className="button small" href={`/?book=${project.bookProjectId}&view=editor`}>Open book</Link>}<button className="button small" onClick={() => duplicate(project)}><BookCopy size={13} /> Duplicate</button></div></article>)}</div> : <div className="research-empty"><WandSparkles size={34} /><h2>Start with a book idea</h2><p>The local generator works without an API key and produces deterministic sections, themes, blurbs, and word lists.</p><Link className="button primary" href="/research/new">Create your first project</Link></div>}
  </main></ResearchFrame>;
}

export function ResearchNew() {
  const router = useRouter(); const [input, setInput] = useState<ResearchInput>(emptyInput); const [bookProjectId, setBookProjectId] = useState<string>(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get("bookId");
      const book = id ? loadProjects().find((item) => item.id === id) : undefined;
      if (!book) return;
      const puzzleCounts = book.sections.map((section) => section.puzzles.length);
      const wordCounts = book.sections.flatMap((section) => section.puzzles.map((puzzle) => puzzle.words.length));
      setBookProjectId(book.id);
      setInput((current) => ({ ...current, seedIdea: book.title, sectionCount: Math.max(1, book.sections.length), puzzlesPerSection: Math.max(1, ...puzzleCounts), wordsPerPuzzle: Math.max(3, ...wordCounts) }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const patch = (next: Partial<ResearchInput>) => setInput((current) => ({ ...current, ...next }));
  async function create() {
    if (!input.seedIdea.trim()) { setError("Enter a seed idea before continuing."); return; }
    setBusy(true); setError("");
    const draft = { ...createDraftResearchProject(input), bookProjectId }; saveResearchProject(draft);
    let generated: ResearchProject;
    try {
      const response = await fetch("/api/research/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "full-project", input, project: draft }) });
      if (!response.ok) throw new Error("AI provider unavailable");
      const data = await response.json() as { project: ResearchProject };
      generated = { ...data.project, id: draft.id, createdAt: draft.createdAt, bookProjectId: draft.bookProjectId };
    } catch { generated = generateMockProject(input, draft); }
    const book = saveAsBookProject(generated);
    saveResearchProject({ ...generated, bookProjectId: book.id, status: "generated" });
    router.push(`/?book=${book.id}&view=editor`); setBusy(false);
  }
  return <ResearchFrame linkedBookId={bookProjectId}><main className="research-content narrow"><div className="page-heading"><div><div className="eyebrow">Create a book from an idea</div><h1 className="page-title">{bookProjectId ? "Research and update this book" : "Generate a new book"}</h1><p className="page-subtitle">{bookProjectId ? "The generated content will update this book and return you to its regular editor." : "PuzzlePress will generate the default book, add it to your dashboard, and open it in the regular editor."}</p></div></div>
    <section className="panel"><div className="panel-body research-form"><label className="field full"><span>Broad book idea</span><input className="input" autoFocus value={input.seedIdea} onChange={(event) => patch({ seedIdea: event.target.value })} placeholder="Black Family Reunion Word Search" /></label><div className="preset-row">{researchPresets.map((preset) => <button key={preset} type="button" onClick={() => patch({ seedIdea: preset })}>{preset}</button>)}</div>
      <label className="field"><span>Target audience</span><input className="input" value={input.targetAudience} onChange={(event) => patch({ targetAudience: event.target.value })} placeholder="Seniors, families, gift buyers" /></label><label className="field"><span>Decade or era</span><input className="input" value={input.decade} onChange={(event) => patch({ decade: event.target.value })} placeholder="1950s" /></label><label className="field"><span>Cultural focus</span><input className="input" value={input.culturalFocus} onChange={(event) => patch({ culturalFocus: event.target.value })} /></label><label className="field"><span>Religious focus</span><input className="input" value={input.religiousFocus} onChange={(event) => patch({ religiousFocus: event.target.value })} /></label>
      <label className="field"><span>Format</span><select className="select" value={input.format} onChange={(event) => patch({ format: event.target.value as ResearchFormat })}><option value="large-print-word-search">Large-print senior word search</option><option value="standard-word-search">Standard word search</option><option value="kids-activity">Kids activity book</option><option value="trivia">Trivia book</option><option value="crossword">Crossword</option></select></label><label className="field"><span>Difficulty</span><select className="select" value={input.difficultyLevel} onChange={(event) => patch({ difficultyLevel: event.target.value })}><option>easy</option><option>easy-to-medium</option><option>medium</option><option>challenging</option></select></label>
      <label className="field"><span>Sections</span><input className="input" type="number" min="1" max="20" value={input.sectionCount} onChange={(event) => patch({ sectionCount: Math.min(20, Math.max(1, Number(event.target.value) || 1)) })} /></label><label className="field"><span>Themes / puzzles per section</span><input className="input" type="number" min="1" max="30" value={input.puzzlesPerSection} onChange={(event) => patch({ puzzlesPerSection: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /></label><label className="field"><span>Words per puzzle</span><input className="input" type="number" min="3" max="30" value={input.wordsPerPuzzle} onChange={(event) => patch({ wordsPerPuzzle: Math.min(30, Math.max(3, Number(event.target.value) || 3)) })} /></label><label className="field"><span>Tone (comma separated)</span><input className="input" value={input.tone?.join(", ")} onChange={(event) => patch({ tone: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
      <div className="generation-total"><strong>{input.sectionCount * input.puzzlesPerSection}</strong><span>puzzle themes</span><strong>{input.sectionCount * input.puzzlesPerSection * input.wordsPerPuzzle}</strong><span>total word entries</span></div>
      {error && <div className="research-error"><CircleAlert size={15} />{error}</div>}<div className="research-form-actions"><Link className="button" href="/">Cancel</Link><button className="button primary" disabled={busy} onClick={create}>{busy ? <RefreshCw className="spin" size={15} /> : <Sparkles size={15} />}{busy ? "Generating book…" : "Generate book & open editor"}</button></div>
    </div></section></main></ResearchFrame>;
}

export function ResearchWorkspace({ id, mode }: { id: string; mode: Mode }) {
  const router = useRouter(); const [project, setProject] = useState<ResearchProject | null>(null); const [busy, setBusy] = useState(false); const [provider, setProvider] = useState("Local generator");
  useEffect(() => { const timer = window.setTimeout(() => setProject(loadResearchProjects().find((item) => item.id === id) || null), 0); return () => window.clearTimeout(timer); }, [id]);
  const issues = useMemo(() => project ? validateResearchProject(project, project.format === "large-print-word-search" ? 15 : 20) : [], [project]);
  if (!project) return <ResearchFrame><main className="research-content"><div className="research-empty"><p>Research project not found in this browser.</p><Link className="button" href="/research">Back to research projects</Link></div></main></ResearchFrame>;
  const commit = (next: ResearchProject) => { next.updatedAt = new Date().toISOString(); setProject(next); saveResearchProject(next); };
  const input: ResearchInput = { seedIdea: project.seedIdea, targetAudience: project.targetAudience, decade: project.decade, culturalFocus: project.culturalFocus, religiousFocus: project.religiousFocus, difficultyLevel: project.difficultyLevel, tone: project.tone, format: project.format, sectionCount: project.sectionCount, puzzlesPerSection: project.puzzlesPerSection, wordsPerPuzzle: project.wordsPerPuzzle };
  async function regenerate(task: GenerationTask, sectionId?: string, puzzleId?: string) {
    if (!project) return;
    const current = project;
    setBusy(true);
    try {
      const response = await fetch("/api/research/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, input, project, sectionId, puzzleId }) });
      if (!response.ok) throw new Error("Provider unavailable"); const data = await response.json() as { project: ResearchProject; provider: string }; setProvider(data.provider);
      if (sectionId) { const replacement = data.project.generatedBook.sections.find((section) => section.id === sectionId) || data.project.generatedBook.sections[0]; if (replacement) commit({ ...current, generatedBook: { ...current.generatedBook, sections: current.generatedBook.sections.map((section) => section.id === sectionId ? { ...replacement, id: section.id } : section) } }); }
      else if (puzzleId) { const replacement = data.project.generatedBook.sections.flatMap((section) => section.puzzles).find((puzzle) => puzzle.id === puzzleId) || data.project.generatedBook.sections.flatMap((section) => section.puzzles)[0]; if (replacement) commit({ ...current, generatedBook: { ...current.generatedBook, sections: current.generatedBook.sections.map((section) => ({ ...section, puzzles: section.puzzles.map((puzzle) => puzzle.id === puzzleId ? task === "words" ? { ...puzzle, words: replacement.words } : { ...replacement, id: puzzle.id } : puzzle) })) } }); }
      else commit({ ...data.project, bookProjectId: current.bookProjectId });
    } catch { commit(generateMockProject(input, current)); setProvider("Local deterministic generator"); }
    setBusy(false);
  }
  function convert() {
    if (!project) return;
    const book = saveAsBookProject(project);
    commit({ ...project, bookProjectId: book.id, status: "exported" });
    router.push(`/?book=${book.id}&view=editor`);
  }
  function exportFile(kind: "json" | "csv" | "markdown" | "backup") { if (!project) return; const name = slug(project.generatedBook.title); if (kind === "json") download(JSON.stringify(toPuzzlePressJson(project), null, 2), `${name}.puzzlepress.json`, "application/json"); if (kind === "csv") download(toResearchCsv(project), `${name}.csv`, "text/csv"); if (kind === "markdown") download(toResearchMarkdown(project), `${name}-research.md`, "text/markdown"); if (kind === "backup") download(JSON.stringify(project, null, 2), `${name}-backup.json`, "application/json"); commit({ ...project, status: "exported" }); }
  return <ResearchFrame title={project.generatedBook.title} linkedBookId={project.bookProjectId}><div className="research-layout"><aside className="research-steps"><Link href="/research"><ArrowLeft size={14} /> All projects</Link><p>Workflow</p>{[["overview","Market positioning"],["outline","Book structure"],["words","Review sections & words"],["export","Review & export"]].map(([key,label], index) => <Link className={mode === key ? "active" : ""} key={key} href={`/research/${id}${key === "overview" ? "" : `/${key}`}`}><span>{index + 1}</span>{label}</Link>)}<div className="provider-note"><Sparkles size={14} /><span>{provider}<small>Manual marketplace validation required</small></span></div></aside><main className="research-main">
    {mode === "overview" && <Overview project={project} commit={commit} busy={busy} regenerate={() => regenerate("full-project")} />}
    {mode === "outline" && <Outline project={project} commit={commit} busy={busy} regenerate={regenerate} />}
    {mode === "words" && <Words project={project} commit={commit} busy={busy} regenerate={regenerate} />}
    {mode === "export" && <Export project={project} issues={issues} exportFile={exportFile} convert={convert} commit={commit} />}
  </main></div></ResearchFrame>;
}

function Overview({ project, commit, busy, regenerate }: { project: ResearchProject; commit: (p: ResearchProject) => void; busy: boolean; regenerate: () => void }) {
  const research = project.marketResearch; const setResearch = (patch: Partial<typeof research>) => commit({ ...project, marketResearch: { ...research, ...patch } });
  return <><EditorHeading eyebrow="Steps 2–4 · Research & generation" title="Market positioning" note="AI-assisted hypotheses. Confirm search demand, competition, and phrasing manually before publishing." action={<button className="button primary" disabled={busy} onClick={regenerate}><RefreshCw className={busy ? "spin" : ""} size={14} /> Regenerate all</button>} /><div className="research-two-col"><section className="panel"><div className="panel-header"><div><div className="panel-title">Book metadata</div></div></div><div className="panel-body research-form"><TextField label="Title" value={project.generatedBook.title} onChange={(title) => commit({ ...project, generatedBook: { ...project.generatedBook, title } })} /><TextField label="Subtitle" value={project.generatedBook.subtitle} onChange={(subtitle) => commit({ ...project, generatedBook: { ...project.generatedBook, subtitle } })} /><TextField label="Series" value={project.generatedBook.series || ""} onChange={(series) => commit({ ...project, generatedBook: { ...project.generatedBook, series } })} /><TextField label="Author" value={project.generatedBook.author || ""} onChange={(author) => commit({ ...project, generatedBook: { ...project.generatedBook, author } })} /><TextArea label="Description" value={project.generatedBook.description || ""} onChange={(description) => commit({ ...project, generatedBook: { ...project.generatedBook, description } })} /></div></section><section className="panel"><div className="panel-header"><div><div className="panel-title">Positioning</div></div></div><div className="panel-body research-form"><TextArea label="Audience" value={research.audience} onChange={(audience) => setResearch({ audience })} /><TextArea label="Recommended positioning" value={research.recommendedPositioning} onChange={(recommendedPositioning) => setResearch({ recommendedPositioning })} /><ArrayField label="Keyword ideas" value={research.keywordIdeas} onChange={(keywordIdeas) => setResearch({ keywordIdeas })} /><ArrayField label="Differentiation angles" value={research.differentiationAngles} onChange={(differentiationAngles) => setResearch({ differentiationAngles })} /><ArrayField label="Competition & risk notes" value={[...research.competitionNotes, ...research.riskNotes]} onChange={(riskNotes) => setResearch({ riskNotes, competitionNotes: [] })} /></div></section></div></>;
}

function Outline({ project, commit, busy, regenerate }: { project: ResearchProject; commit: (p: ResearchProject) => void; busy: boolean; regenerate: (task: GenerationTask, sectionId?: string, puzzleId?: string) => void }) {
  const updateSection = (id: string, patch: Record<string, unknown>) => commit({ ...project, generatedBook: { ...project.generatedBook, sections: project.generatedBook.sections.map((section) => section.id === id ? { ...section, ...patch } : section) } });
  return <><EditorHeading eyebrow="Steps 4–5 · Outline" title="Review book structure" note={`${project.generatedBook.sections.length} sections and ${project.generatedBook.sections.reduce((sum, section) => sum + section.puzzles.length, 0)} puzzle themes.`} /><div className="research-section-stack">{project.generatedBook.sections.map((section, index) => <section className="panel" key={section.id}><div className="panel-header"><div><div className="panel-kicker">Section {index + 1}</div><input className="research-title-input" value={section.name} onChange={(event) => updateSection(section.id, { name: event.target.value })} /></div><button className="button small" disabled={busy} onClick={() => regenerate("section", section.id)}><RefreshCw size={13} /> Regenerate section</button></div><div className="panel-body"><textarea className="textarea" value={section.description} onChange={(event) => updateSection(section.id, { description: event.target.value })} /><div className="theme-list">{section.puzzles.map((puzzle, puzzleIndex) => <div key={puzzle.id}><span>{puzzleIndex + 1}</span><input className="input" value={puzzle.title} onChange={(event) => updateSection(section.id, { puzzles: section.puzzles.map((item) => item.id === puzzle.id ? { ...item, title: event.target.value } : item) })} /><button className="button small" onClick={() => regenerate("puzzle", undefined, puzzle.id)}><RefreshCw size={12} /> Theme</button></div>)}</div></div></section>)}</div></>;
}

function Words({ project, commit, busy, regenerate }: { project: ResearchProject; commit: (p: ResearchProject) => void; busy: boolean; regenerate: (task: GenerationTask, sectionId?: string, puzzleId?: string) => void }) {
  const updatePuzzle = (id: string, patch: Record<string, unknown>) => commit({ ...project, generatedBook: { ...project.generatedBook, sections: project.generatedBook.sections.map((section) => ({ ...section, puzzles: section.puzzles.map((puzzle) => puzzle.id === id ? { ...puzzle, ...patch } : puzzle) })) } });
  return <><EditorHeading eyebrow="Step 6 · Word generation" title="Review puzzle content" note="Edit every title, nostalgia blurb, display word, and normalized value before export." /><div className="research-section-stack">{project.generatedBook.sections.map((section) => <details className="research-details" key={section.id} open><summary>{section.name}<span>{section.puzzles.length} puzzles</span></summary>{section.puzzles.map((puzzle) => <article className="word-puzzle" key={puzzle.id}><div className="word-puzzle-head"><input className="research-title-input" value={puzzle.title} onChange={(event) => updatePuzzle(puzzle.id, { title: event.target.value })} /><button className="button small" disabled={busy} onClick={() => regenerate("words", undefined, puzzle.id)}><RefreshCw size={13} /> Regenerate words</button></div><textarea className="textarea" value={puzzle.blurb || ""} onChange={(event) => updatePuzzle(puzzle.id, { blurb: event.target.value })} /><div className="generated-word-grid">{puzzle.words.map((word, index) => <label key={`${puzzle.id}-${index}`}><span>{index + 1}</span><input value={word.display} onChange={(event) => { const display = event.target.value; updatePuzzle(puzzle.id, { words: puzzle.words.map((item, itemIndex) => itemIndex === index ? { ...item, display, normalized: normalizeResearchWord(display) } : item) }); }} /><input className="normalized" value={word.normalized} onChange={(event) => updatePuzzle(puzzle.id, { words: puzzle.words.map((item, itemIndex) => itemIndex === index ? { ...item, normalized: event.target.value.toUpperCase() } : item) })} /></label>)}</div></article>)}</details>)}</div></>;
}

function Export({ project, issues, exportFile, convert, commit }: { project: ResearchProject; issues: ReturnType<typeof validateResearchProject>; exportFile: (kind: "json" | "csv" | "markdown" | "backup") => void; convert: () => void; commit: (p: ResearchProject) => void }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  return <><EditorHeading eyebrow="Step 7 · Preflight" title="Review & export" note="Blocking schema errors disable production exports. Warnings should receive human editorial review." action={<button className="button" onClick={() => commit({ ...project, status: "reviewed" })}><CheckCircle2 size={14} /> Mark reviewed</button>} /><div className="research-two-col"><section className="panel"><div className="panel-header"><div><div className="panel-title">Production files</div><div className="panel-kicker">PuzzlePress-compatible and portable formats</div></div></div><div className="panel-body export-list"><ExportButton icon={FileJson} title="PuzzlePress JSON" note="Current book import schema" disabled={!!errors.length} onClick={() => exportFile("json")} /><ExportButton icon={Table2} title="Flat CSV" note={`Word1…Word${project.wordsPerPuzzle} and normalized columns`} disabled={!!errors.length} onClick={() => exportFile("csv")} /><ExportButton icon={FileText} title="Research report" note="Markdown positioning and production brief" onClick={() => exportFile("markdown")} /><ExportButton icon={Save} title="Project backup" note="Full editable research project JSON" onClick={() => exportFile("backup")} /><ExportButton icon={WandSparkles} title="Convert to book project" note="Continue to grids, layout, and PDF generation" disabled={!!errors.length} onClick={convert} primary /></div></section><section className="panel"><div className="panel-header"><div><div className="panel-title">Validation</div><div className="panel-kicker">{errors.length} errors · {issues.length - errors.length} warnings</div></div></div><div className="panel-body validation-list">{issues.length ? issues.map((issue, index) => <div className={issue.severity} key={`${issue.path}-${index}`}>{issue.severity === "error" ? <CircleAlert size={15} /> : <CircleAlert size={15} />}<span><strong>{issue.path}</strong>{issue.message}</span></div>) : <div className="validation-ok"><CheckCircle2 size={22} />All export checks passed.</div>}</div></section></div></>;
}

function EditorHeading({ eyebrow, title, note, action }: { eyebrow: string; title: string; note: string; action?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{note}</p></div>{action}</div>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <label className="field"><span>{label}</span><input className="input" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <label className="field full"><span>{label}</span><textarea className="textarea" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function ArrayField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) { return <label className="field full"><span>{label} (one per line)</span><textarea className="textarea" value={value.join("\n")} onChange={(event) => onChange(event.target.value.split("\n").filter(Boolean))} /></label>; }
function ExportButton({ icon: Icon, title, note, onClick, disabled, primary }: { icon: typeof Download; title: string; note: string; onClick: () => void; disabled?: boolean; primary?: boolean }) { return <button className={`research-export-button ${primary ? "primary" : ""}`} disabled={disabled} onClick={onClick}><Icon size={20} /><span><strong>{title}</strong><small>{note}</small></span><Download size={15} /></button>; }
