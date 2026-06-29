"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Archive, BookCopy, BookOpen, Check, CheckCircle2, ChevronRight, CircleAlert,
  Clock3, Download, FileJson, FileText, FolderOpen, Grid3X3, ImagePlus, Import,
  LayoutDashboard, LayoutTemplate, Menu, Plus, RefreshCw, Save,
  SlidersHorizontal, Sparkles, Trash2, Upload, WandSparkles, Palette, Image,
} from "lucide-react";
import { sampleBook } from "@/data/sample-book";
import { templates } from "@/data/templates";
import { parseCsvProject, parseProjectJson } from "@/lib/importers";
import { generatePuzzle, normalizeWord, validateWords } from "@/lib/puzzle-generator";
import { buildTableOfContents, combinedPageCount } from "@/lib/book-pages";
import { loadProjects, saveProjects } from "@/lib/storage";
import type { BookProject, GridSize, ProjectAsset, Puzzle, TemplateStyle } from "@/types/puzzle";
import { PuzzleGrid } from "./PuzzleGrid";

type View = "dashboard" | "projects" | "import" | "editor" | "review" | "templates" | "preview" | "export";
type PreviewPage = { type: "title" | "text" | "toc" | "divider" | "puzzle" | "solution"; label: string; body?: string; section?: string; puzzle?: Puzzle; page: number };

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function allPuzzles(project: BookProject) {
  return project.sections.flatMap((section) => section.puzzles.map((puzzle) => ({ section, puzzle })));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, encoded] = dataUrl.split(",");
  const mimeType = metadata.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bytes = atob(encoded); const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) buffer[index] = bytes.charCodeAt(index);
  return new Blob([buffer], { type: mimeType });
}

export default function StudioApp() {
  const [projects, setProjects] = useState<BookProject[]>([sampleBook]);
  const [activeId, setActiveId] = useState(sampleBook.id);
  const [view, setView] = useState<View>("dashboard");
  const [selectedPuzzleId, setSelectedPuzzleId] = useState(sampleBook.sections[0].puzzles[0].id);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [solutionMode, setSolutionMode] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = loadProjects();
      if (saved.length) { setProjects(saved); setActiveId(saved[0].id); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  const project = projects.find((item) => item.id === activeId) || projects[0] || sampleBook;
  const puzzlePairs = useMemo(() => allPuzzles(project), [project]);
  const selectedPair = puzzlePairs.find(({ puzzle }) => puzzle.id === selectedPuzzleId) || puzzlePairs[0];
  const generatedCount = puzzlePairs.filter(({ puzzle }) => puzzle.generated).length;

  const previewPages = useMemo<PreviewPage[]>(() => {
    const pages: PreviewPage[] = [
      { type: "title", label: "Title page", page: 1 },
      { type: "text", label: "Copyright", body: project.frontMatter.copyright, page: 2 },
      { type: "text", label: "Welcome", body: project.frontMatter.welcome, page: 3 },
      { type: "text", label: "How to use this book", body: project.frontMatter.howTo, page: 4 },
      { type: "toc", label: "Table of contents", page: 5 },
    ];
    for (const section of project.sections) {
      pages.push({ type: "divider", label: section.name, section: section.name, page: pages.length + 1 });
      for (const puzzle of section.puzzles) pages.push({ type: "puzzle", label: puzzle.title, section: section.name, puzzle, page: pages.length + 1 });
    }
    for (const { section, puzzle } of puzzlePairs) pages.push({ type: "solution", label: `${puzzle.title} — solution`, section: section.name, puzzle, page: pages.length + 1 });
    pages.push(
      { type: "text", label: "Thank you", body: project.backMatter.thankYou, page: pages.length + 1 },
      { type: "text", label: "Other books in the series", body: project.backMatter.otherBooks, page: pages.length + 2 },
      { type: "text", label: "Review request", body: project.backMatter.reviewRequest, page: pages.length + 3 },
    );
    return pages;
  }, [project, puzzlePairs]);

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }

  function commit(next: BookProject, message?: string) {
    next.updatedAt = new Date().toISOString();
    const updated = projects.map((item) => item.id === next.id ? next : item);
    setProjects(updated); saveProjects(updated); if (message) notify(message);
  }

  function updateProject(patch: Partial<BookProject>) { commit({ ...project, ...patch }); }

  function updateSettings(patch: Partial<BookProject["settings"]>) {
    const generationChanged = patch.gridSize !== undefined || patch.directions !== undefined || patch.backwards !== undefined || patch.seed !== undefined;
    const settings = { ...project.settings, ...patch };
    const sections = generationChanged ? project.sections.map((section) => ({
      ...section,
      puzzles: section.puzzles.map((puzzle) => {
        try {
          return { ...puzzle, generated: generatePuzzle(puzzle.words, { gridSize: settings.gridSize, directions: settings.directions, backwards: settings.backwards, seed: `${settings.seed}:${puzzle.id}` }) };
        } catch { return { ...puzzle, generated: undefined }; }
      }),
    })) : project.sections;
    commit({ ...project, sections, settings });
  }

  async function importTemplate(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<TemplateStyle>;
      if (!parsed.name || !parsed.id) throw new Error("Template JSON must include id and name.");
      const imported: TemplateStyle = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description || "Imported custom template",
        accent: parsed.accent || "#273b31",
        paper: parsed.paper || "#fffefa",
        fontFamily: parsed.fontFamily === "sans" ? "sans" : "serif",
        borderStyle: ["line", "double", "ornate", "none"].includes(parsed.borderStyle || "") ? parsed.borderStyle! : "line",
        artwork: typeof parsed.artwork === "string" ? parsed.artwork : undefined,
      };
      const customTemplates = [...(project.customTemplates || []).filter((item) => item.id !== imported.id), imported];
      commit({ ...project, customTemplates, templateId: imported.id }, "Template imported and applied");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not import that template"); }
  }

  async function uploadAsset(kind: "cover" | "decorative" | "divider" | "puzzle", file: File) {
    const dataUrl = await fileToDataUrl(file);
    const asset: ProjectAsset = { name: file.name, mimeType: file.type || "application/octet-stream", dataUrl };
    commit({ ...project, assets: { ...project.assets, [kind]: asset } }, `${file.name} attached`);
  }

  function createProject() {
    const next = clone(sampleBook);
    next.id = crypto.randomUUID(); next.title = "Untitled Word Search Book"; next.subtitle = "A large-print puzzle collection"; next.sections = [];
    next.updatedAt = new Date().toISOString();
    const updated = [next, ...projects]; setProjects(updated); saveProjects(updated); setActiveId(next.id); setView("import"); notify("New project created");
  }

  function deleteProject(id: string) {
    if (projects.length === 1 || !window.confirm("Delete this project from local storage?")) return;
    const updated = projects.filter((item) => item.id !== id); setProjects(updated); saveProjects(updated); setActiveId(updated[0].id); notify("Project deleted");
  }

  function editPuzzle(puzzleId: string, patch: Partial<Puzzle>) {
    const sections = project.sections.map((section) => ({ ...section, puzzles: section.puzzles.map((puzzle) => puzzle.id === puzzleId ? { ...puzzle, ...patch, generated: undefined } : puzzle) }));
    commit({ ...project, sections });
  }

  function ensureGenerated(target = project) {
    let failures = 0;
    const sections = target.sections.map((section) => ({ ...section, puzzles: section.puzzles.map((puzzle) => {
      try {
        return { ...puzzle, generated: generatePuzzle(puzzle.words, { gridSize: target.settings.gridSize, directions: target.settings.directions, backwards: target.settings.backwards, seed: `${target.settings.seed}:${puzzle.id}` }) };
      } catch { failures++; return { ...puzzle, generated: undefined }; }
    }) }));
    const next = { ...target, sections }; commit(next);
    if (failures) notify(`${failures} puzzle${failures === 1 ? "" : "s"} need attention`); else notify("All puzzle grids generated");
    return next;
  }

  function navigate(next: View) {
    if ((next === "review" || next === "preview" || next === "export") && generatedCount < puzzlePairs.length && puzzlePairs.length) ensureGenerated();
    setView(next); if (next === "preview") setPreviewIndex(0);
  }

  async function importFile(file: File) {
    try {
      const text = await file.text();
      const imported = file.name.toLowerCase().endsWith(".csv") ? parseCsvProject(text, project) : parseProjectJson(text, project);
      const updated = [imported, ...projects.filter((item) => item.id !== imported.id)];
      setProjects(updated); saveProjects(updated); setActiveId(imported.id); setSelectedPuzzleId(imported.sections[0]?.puzzles[0]?.id || ""); setView("editor"); notify(`${file.name} imported successfully`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not import that file"); }
  }

  function exportJson() { downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`); }

  async function exportPdf(kind: "interior" | "solutions" | "combined") {
    setBusy(true);
    try {
      const ready = ensureGenerated();
      const response = await fetch("/api/export/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: ready, kind }) });
      if (!response.ok) throw new Error(await response.text());
      downloadBlob(await response.blob(), `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${kind}.pdf`); notify("Print-ready PDF exported");
    } catch (error) { notify(error instanceof Error ? error.message : "PDF export failed"); } finally { setBusy(false); }
  }

  const nav = [
    { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard },
    { id: "projects" as View, label: "Book projects", icon: BookCopy },
    { id: "import" as View, label: "Import data", icon: Import },
    { id: "editor" as View, label: "Book editor", icon: FileText },
    { id: "review" as View, label: "Puzzle review", icon: Grid3X3 },
    { id: "templates" as View, label: "Templates", icon: LayoutTemplate },
    { id: "preview" as View, label: "Page preview", icon: BookOpen },
    { id: "export" as View, label: "Export", icon: Download },
  ];
  const activeLabel = nav.find((item) => item.id === view)?.label;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span /></div><div className="brand-name">PuzzlePress</div></div>
        <div className="sidebar-book"><BookOpen size={14} /><div><span>Current book</span><strong>{project.title}</strong></div></div>
        <div className="nav-label">Workspace</div>
        {nav.slice(0, 2).map((item) => <NavItem key={item.id} {...item} active={view === item.id} onClick={() => navigate(item.id)} />)}
        <Link className="nav-button" href="/research"><Sparkles size={17} strokeWidth={1.8} /><span>Research & generator</span></Link>
        <div className="nav-label">Create</div>
        {nav.slice(2).map((item) => <NavItem key={item.id} {...item} active={view === item.id} onClick={() => navigate(item.id)} />)}
        <div className="sidebar-footer">Local-first workspace<br /><span>Saved privately in this browser</span></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <div className="crumb"><span>Workspace</span><ChevronRight size={13} /><strong>{activeLabel}</strong></div>
            <div className="active-book"><BookOpen size={13} /><span>Working on</span><strong>{project.title}</strong></div>
          </div>
          <div className="top-actions">
            <button className="button ghost small" onClick={() => { saveProjects(projects); notify("Saved locally"); }}><Save size={14} /> Save</button>
            <button className="button primary small" onClick={() => navigate("preview")}><BookOpen size={14} /> Preview book</button>
          </div>
        </header>

        {view === "dashboard" && <Dashboard projects={projects} onCreate={createProject} onOpen={(id) => { setActiveId(id); setView("editor"); }} />}
        {view === "projects" && <Projects projects={projects} onCreate={createProject} onOpen={(id) => { setActiveId(id); setView("editor"); }} onDelete={deleteProject} />}
        {view === "import" && <ImportView project={project} fileRef={fileRef} onFile={importFile} onUseDemo={() => { const demo = clone(sampleBook); demo.id = crypto.randomUUID(); demo.updatedAt = new Date().toISOString(); const updated = [demo, ...projects]; setProjects(updated); saveProjects(updated); setActiveId(demo.id); setView("editor"); notify("Demo book added"); }} />}
        {view === "editor" && <Editor project={project} selectedPair={selectedPair} onSelect={setSelectedPuzzleId} onUpdate={updateProject} onEditPuzzle={editPuzzle} onGenerate={() => ensureGenerated()} />}
        {view === "review" && <Review project={project} pairs={puzzlePairs} selectedPair={selectedPair} solution={solutionMode} onSolution={setSolutionMode} onSelect={setSelectedPuzzleId} onGenerate={() => ensureGenerated()} />}
        {view === "templates" && <TemplatesView project={project} templateStyles={[...templates, ...(project.customTemplates || [])]} onSelect={(templateId) => { updateProject({ templateId }); notify("Template applied"); }} onExport={() => { const template = [...templates, ...(project.customTemplates || [])].find((item) => item.id === project.templateId); downloadBlob(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }), `${template?.id || "template"}.json`); }} onImport={importTemplate} onAsset={uploadAsset} />}
        {view === "preview" && <Preview project={project} templateStyles={[...templates, ...(project.customTemplates || [])]} pages={previewPages} index={Math.min(previewIndex, previewPages.length - 1)} onIndex={setPreviewIndex} onSettings={updateSettings} />}
        {view === "export" && <ExportView project={project} generatedCount={generatedCount} total={puzzlePairs.length} busy={busy} onPdf={exportPdf} onJson={exportJson} onCover={() => { const cover = project.assets?.cover; if (cover) downloadBlob(dataUrlToBlob(cover.dataUrl), cover.name); }} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NavItem({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Menu; active: boolean; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>;
}

function Heading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}

function Dashboard({ projects, onCreate, onOpen }: { projects: BookProject[]; onCreate: () => void; onOpen: (id: string) => void }) {
  const puzzles = projects.reduce((sum, item) => sum + allPuzzles(item).length, 0);
  return <div className="content">
    <Heading eyebrow="Good afternoon" title="Your publishing desk" subtitle="Everything you need to shape the next book in your series." action={<button className="button primary" onClick={onCreate}><Plus size={16} /> New book project</button>} />
    <div className="stats">
      <Stat label="Book projects" value={projects.length} note="Stored locally" />
      <Stat label="Puzzles" value={puzzles} note="Across all books" />
      <Stat label="Print format" value="8.5×11" note="KDP paperback" />
      <Stat label="Workspace" value="Local" note="Private by default" />
    </div>
    <div className="panel">
      <div className="panel-header"><div><div className="panel-title">Recent projects</div><div className="panel-kicker">Pick up where you left off</div></div><button className="button small" onClick={onCreate}><Plus size={14} /> New project</button></div>
      <div className="panel-body"><div className="projects-grid">{projects.slice(0, 3).map((project, index) => <ProjectCard key={project.id} project={project} index={index} onOpen={() => onOpen(project.id)} />)}</div></div>
    </div>
  </div>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) { return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>; }

function ProjectCard({ project, index, onOpen, onDelete }: { project: BookProject; index: number; onOpen: () => void; onDelete?: () => void }) {
  const palettes = [["#e9dfd0", "#654936"], ["#d9e2db", "#344c3e"], ["#e8d9ca", "#74462e"]]; const [bg, fg] = palettes[index % palettes.length];
  const coverImage = project.assets?.cover?.mimeType.startsWith("image/") ? project.assets.cover.dataUrl : undefined;
  return <article className="project-card">
    <button style={{ border: 0, padding: 0, width: "100%", textAlign: "left", color: "inherit" }} onClick={onOpen}>
      <div className={`cover-mini ${coverImage ? "has-cover" : ""}`} style={{ backgroundColor: bg, backgroundImage: coverImage ? `url(${coverImage})` : undefined }}><div className="cover-series">{project.series || "Puzzle collection"}</div><div className="cover-title" style={{ color: fg }}>{project.title}</div><div className="cover-orbit" /></div>
      <div className="project-info"><div className="project-name">{project.title}</div><div className="project-meta"><span className="tag">{project.status}</span><span>{allPuzzles(project).length} puzzles</span><span>•</span><span><Clock3 size={10} style={{ display: "inline" }} /> local</span></div></div>
    </button>
    {onDelete && <div style={{ padding: "0 16px 14px", display: "flex", justifyContent: "flex-end" }}><button className="button ghost small" onClick={onDelete}><Trash2 size={13} /> Delete</button></div>}
  </article>;
}

function Projects({ projects, onCreate, onOpen, onDelete }: { projects: BookProject[]; onCreate: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return <div className="content"><Heading eyebrow="Library" title="Book projects" subtitle="Your locally saved publishing projects." action={<button className="button primary" onClick={onCreate}><Plus size={16} /> New book project</button>} /><div className="projects-grid">{projects.map((project, i) => <ProjectCard key={project.id} project={project} index={i} onOpen={() => onOpen(project.id)} onDelete={() => onDelete(project.id)} />)}</div></div>;
}

function ImportView({ project, fileRef, onFile, onUseDemo }: { project: BookProject; fileRef: React.RefObject<HTMLInputElement | null>; onFile: (file: File) => void; onUseDemo: () => void }) {
  return <div className="content"><Heading eyebrow="Step 1 of 5" title="Bring in your puzzle data" subtitle={`Import content into ${project.title}. CSV and structured JSON are supported.`} />
    <div className="editor-grid">
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Import a file</div><div className="panel-kicker">CSV or PuzzlePress JSON</div></div></div><div className="panel-body">
        <button className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onFile(file); }} onClick={() => fileRef.current?.click()}>
          <span><span className="drop-icon"><Upload size={23} /></span><h3>Drop your manuscript here</h3><p>Choose a .csv or .json file. Nothing leaves your browser until you explicitly export it.</p><span className="button primary"><FolderOpen size={15} /> Choose file</span></span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,.json,application/json,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); }} />
      </div></div>
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Expected format</div><div className="panel-kicker">Flexible, human-readable source files</div></div></div><div className="panel-body">
        <div className="export-card"><div className="export-icon"><FileJson size={21} /></div><div className="export-info"><strong>Structured JSON</strong><span>Best for titles, sections, blurbs, and complete project backups.</span></div></div>
        <div className="export-card"><div className="export-icon"><FileText size={21} /></div><div className="export-info"><strong>Simple CSV</strong><span>Use columns: book_title, section, puzzle, blurb, words. Separate words with |.</span></div></div>
        <button className="button" style={{ width: "100%", marginTop: 8 }} onClick={onUseDemo}><Sparkles size={15} /> Start with the 1950s demo book</button>
      </div></div>
    </div>
  </div>;
}

function Editor({ project, selectedPair, onSelect, onUpdate, onEditPuzzle, onGenerate }: { project: BookProject; selectedPair?: ReturnType<typeof allPuzzles>[number]; onSelect: (id: string) => void; onUpdate: (patch: Partial<BookProject>) => void; onEditPuzzle: (id: string, patch: Partial<Puzzle>) => void; onGenerate: () => void }) {
  const issues = selectedPair ? validateWords(selectedPair.puzzle.words, project.settings.gridSize) : [];
  return <div className="content"><Heading eyebrow="Step 2 of 5" title="Shape the manuscript" subtitle="Edit book details, sections, puzzle titles, and word lists." action={<button className="button primary" onClick={onGenerate}><WandSparkles size={15} /> Generate all grids</button>} />
    <div className="editor-grid">
      <div style={{ display: "grid", gap: 20 }}>
        <div className="panel"><div className="panel-header"><div className="panel-title">Book details</div></div><div className="panel-body"><div className="field-grid">
          <Field label="Book title" full value={project.title} onChange={(title) => onUpdate({ title })} />
          <Field label="Subtitle" full value={project.subtitle} onChange={(subtitle) => onUpdate({ subtitle })} />
          <Field label="Series" value={project.series} onChange={(series) => onUpdate({ series })} />
          <Field label="Author / publisher" value={project.author} onChange={(author) => onUpdate({ author })} />
        </div></div></div>
        <div className="panel"><div className="panel-header"><div><div className="panel-title">Table of contents</div><div className="panel-kicker">Automatically included in preview and PDF · {project.sections.length} sections · {allPuzzles(project).length} puzzles</div></div><span className="tag"><Check size={11} /> Auto page</span></div><div className="section-list">{project.sections.length ? project.sections.map((section) => <div className="section-row" key={section.id}><div className="section-row-head"><Archive size={14} /><strong>{section.name}</strong><span className="tag">{section.puzzles.length}</span></div>{section.puzzles.map((puzzle) => <div className={`puzzle-row ${selectedPair?.puzzle.id === puzzle.id ? "active" : ""}`} key={puzzle.id}><Grid3X3 size={13} /><button onClick={() => onSelect(puzzle.id)}>{puzzle.title}</button><span>{puzzle.words.length}</span></div>)}</div>) : <div className="empty">Import data to add sections and puzzles.</div>}</div></div>
      </div>
      <div className="panel"><div className="panel-header"><div><div className="panel-title">{selectedPair?.puzzle.title || "Select a puzzle"}</div><div className="panel-kicker">{selectedPair ? selectedPair.section.name : "No puzzle selected"}</div></div>{selectedPair?.puzzle.generated && <span className="tag"><Check size={11} /> Generated</span>}</div>
        {selectedPair && <div className="panel-body">
          <div className="field-grid"><Field label="Puzzle title" full value={selectedPair.puzzle.title} onChange={(title) => onEditPuzzle(selectedPair.puzzle.id, { title })} /><div className="field full"><label htmlFor="nostalgia-blurb">Nostalgia blurb</label><textarea id="nostalgia-blurb" className="textarea" value={selectedPair.puzzle.blurb || ""} onChange={(event) => onEditPuzzle(selectedPair.puzzle.id, { blurb: event.target.value })} /></div></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "22px 0 10px" }}><div><div className="stat-label">Word list</div><div className="panel-kicker">Display wording stays separate from grid lettering</div></div><button className="button small" onClick={() => onEditPuzzle(selectedPair.puzzle.id, { words: [...selectedPair.puzzle.words, "NEW WORD"] })}><Plus size={13} /> Add word</button></div>
          <div className="word-editor">{selectedPair.puzzle.words.map((word, index) => <div className="word-item" key={`${index}-${word}`}><input className="input" value={word} aria-label={`Word ${index + 1}`} onChange={(event) => { const words = [...selectedPair.puzzle.words]; words[index] = event.target.value; onEditPuzzle(selectedPair.puzzle.id, { words }); }} /><span className="word-normalized" title={normalizeWord(word)}>{normalizeWord(word)}</span><button className="button ghost icon-button small" aria-label={`Delete ${word}`} onClick={() => onEditPuzzle(selectedPair.puzzle.id, { words: selectedPair.puzzle.words.filter((_, i) => i !== index) })}><Trash2 size={13} /></button></div>)}</div>
          {issues.slice(0, 3).map((issue, index) => <div className="issue" key={`${issue.word}-${index}`}>{issue.message}</div>)}
        </div>}
      </div>
    </div>
  </div>;
}

function Field({ label, value, onChange, full = false }: { label: string; value: string; onChange: (value: string) => void; full?: boolean }) { const id = useId(); return <div className={`field ${full ? "full" : ""}`}><label htmlFor={id}>{label}</label><input id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} /></div>; }

function Review({ project, pairs, selectedPair, solution, onSolution, onSelect, onGenerate }: { project: BookProject; pairs: ReturnType<typeof allPuzzles>; selectedPair?: ReturnType<typeof allPuzzles>[number]; solution: boolean; onSolution: (value: boolean) => void; onSelect: (id: string) => void; onGenerate: () => void }) {
  const issues = pairs.flatMap(({ puzzle }) => validateWords(puzzle.words, project.settings.gridSize));
  return <div className="content"><Heading eyebrow="Step 3 of 5" title="Review every puzzle" subtitle="Inspect generated grids and catch manuscript issues before layout." action={<div style={{ display: "flex", gap: 8 }}><button className={`button ${!solution ? "dark" : ""}`} onClick={() => onSolution(false)}>Puzzle</button><button className={`button ${solution ? "dark" : ""}`} onClick={() => onSolution(true)}>Solution</button></div>} />
    <div className="review-layout">
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Puzzles</div><div className="panel-kicker">{pairs.length - issues.filter((issue) => issue.severity === "error").length} ready · {issues.length} notices</div></div><button className="button icon-button small" onClick={onGenerate} aria-label="Regenerate puzzles"><RefreshCw size={14} /></button></div><div className="review-list">{pairs.map(({ section, puzzle }, index) => <button className={`review-item ${puzzle.id === selectedPair?.puzzle.id ? "active" : ""}`} onClick={() => onSelect(puzzle.id)} key={puzzle.id}><span className="review-number">{String(index + 1).padStart(2, "0")}</span><span><span className="review-item-title">{puzzle.title}</span><span className="review-item-meta">{section.name} · {puzzle.words.length} words</span></span></button>)}</div></div>
      <div className="panel"><div className="panel-header"><div><div className="panel-title">{selectedPair?.puzzle.title || "No puzzle"}</div><div className="panel-kicker">{selectedPair?.puzzle.generated?.size || project.settings.gridSize}×{selectedPair?.puzzle.generated?.size || project.settings.gridSize} · {solution ? "answer key" : "player view"}</div></div><span className="tag">{selectedPair?.puzzle.generated ? "All words placed" : "Needs generation"}</span></div><div className="panel-body">{selectedPair?.puzzle.generated ? <PuzzleGrid puzzle={selectedPair.puzzle.generated} solution={solution} /> : <div className="empty"><CircleAlert size={24} /><p>Could not generate this puzzle with the current settings.</p><button className="button" onClick={onGenerate}>Try again</button></div>}</div></div>
    </div>
  </div>;
}

function TemplatesView({ project, templateStyles, onSelect, onExport, onImport, onAsset }: { project: BookProject; templateStyles: TemplateStyle[]; onSelect: (id: string) => void; onExport: () => void; onImport: (file: File) => void; onAsset: (kind: "cover" | "decorative" | "divider" | "puzzle", file: File) => void }) {
  const templateInput = useRef<HTMLInputElement>(null);
  const decorativeInput = useRef<HTMLInputElement>(null);
  const dividerInput = useRef<HTMLInputElement>(null);
  const puzzleInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const selectedTemplate = templateStyles.find((item) => item.id === project.templateId);
  return <div className="content"><Heading eyebrow="Step 4 of 5" title="Style and artwork" subtitle={`Designing ${project.title}. Choose an interior, then attach the art that belongs to this book.`} action={<button className="button" onClick={onExport}><FileJson size={15} /> Export selected template</button>} />
    <div className="editor-grid template-editor"><div className="panel"><div className="panel-header"><div><div className="panel-title">Interior template</div><div className="panel-kicker">Selected: {selectedTemplate?.name || "None"}</div></div><button className="button small" onClick={() => templateInput.current?.click()}><Upload size={14} /> Import template</button></div><div className="panel-body"><div className="template-grid">{templateStyles.map((template) => <button className={`template-card ${project.templateId === template.id ? "selected" : ""}`} key={template.id} onClick={() => onSelect(template.id)}><div className="template-thumb" style={{ background: template.paper, color: template.accent }}>{template.artwork && <span className="template-svg" style={{ backgroundImage: `url(${template.artwork})` }} />}<div className="template-page"><div className="template-page-title" style={{ background: template.accent }} /><div className="template-lines" /></div></div><div className="template-name">{template.name}</div><div className="template-desc">{template.description}</div>{project.templateId === template.id && <span className="check"><Check size={13} /></span>}</button>)}</div></div></div>
      <div className="panel artwork-panel"><div className="panel-header"><div><div className="panel-title">Book artwork</div><div className="panel-kicker">Files stay attached to this book project</div></div><Palette size={18} /></div><div className="panel-body">
        <div className="art-help"><strong>Build the visual package</strong><span>Add a cover first, then optional title-page and section art. Replace any file at any time.</span></div>
        <div className="art-grid">
          <ArtCard icon={BookOpen} title="Book cover" note="Finished PNG, JPEG, or PDF" asset={project.assets?.cover} onClick={() => coverInput.current?.click()} featured />
          <ArtCard icon={Sparkles} title="Title-page art" note="PNG or JPEG decoration" asset={project.assets?.decorative} onClick={() => decorativeInput.current?.click()} />
          <ArtCard icon={Image} title="Section art" note="PNG or JPEG divider image" asset={project.assets?.divider} onClick={() => dividerInput.current?.click()} />
          <ArtCard icon={Grid3X3} title="Puzzle-page art" note="Subtle PNG or JPEG page accent" asset={project.assets?.puzzle} onClick={() => puzzleInput.current?.click()} />
        </div>
        <input ref={templateInput} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} />
        <input ref={decorativeInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("decorative", file); event.target.value = ""; }} />
        <input ref={dividerInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("divider", file); event.target.value = ""; }} />
        <input ref={puzzleInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("puzzle", file); event.target.value = ""; }} />
        <input ref={coverInput} type="file" accept="image/png,image/jpeg,application/pdf,.pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("cover", file); event.target.value = ""; }} />
        <div className="art-tip"><CheckCircle2 size={15} /><span>Artwork is included in project JSON backups. Uploaded covers can be downloaded again from Export.</span></div>
      </div></div>
    </div>
  </div>;
}

function ArtCard({ icon: Icon, title, note, asset, onClick, featured = false }: { icon: typeof Upload; title: string; note: string; asset?: ProjectAsset; onClick: () => void; featured?: boolean }) {
  const imagePreview = asset?.mimeType.startsWith("image/") ? asset.dataUrl : undefined;
  return <button className={`art-card ${featured ? "featured" : ""} ${asset ? "attached" : ""}`} onClick={onClick}>
    <span className="art-preview" style={imagePreview ? { backgroundImage: `url(${imagePreview})` } : undefined}>{!imagePreview && <Icon size={featured ? 28 : 22} strokeWidth={1.5} />}{asset && <span className="art-check"><Check size={11} /></span>}</span>
    <span className="art-copy"><strong>{title}</strong><small>{asset?.name || note}</small><em>{asset ? "Click to replace" : "+ Add file"}</em></span>
  </button>;
}

function Preview({ project, templateStyles, pages, index, onIndex, onSettings }: { project: BookProject; templateStyles: TemplateStyle[]; pages: PreviewPage[]; index: number; onIndex: (index: number) => void; onSettings: (settings: Partial<BookProject["settings"]>) => void }) {
  const page = pages[index]; const template = templateStyles.find((item) => item.id === project.templateId) || templates[0];
  return <div className="content" style={{ maxWidth: "none" }}><Heading eyebrow="Step 5 of 5" title="Preview the finished book" subtitle={`${pages.length} generated pages · 8.5 × 11 in · ${project.settings.bleed ? "bleed" : "no bleed"}`} action={<div style={{ display: "flex", gap: 7 }}><button className="button" disabled={index <= 0} onClick={() => onIndex(index - 1)}>Previous</button><button className="button" disabled={index >= pages.length - 1} onClick={() => onIndex(index + 1)}>Next</button></div>} />
    <div className="preview-workspace">
      <div className="thumbnail-list">{pages.map((item, itemIndex) => <button className={`page-thumb ${itemIndex === index ? "active" : ""}`} key={`${item.type}-${itemIndex}`} onClick={() => onIndex(itemIndex)}><div className="page-thumb-sheet"><span>{item.type === "puzzle" ? <Grid3X3 size={24} strokeWidth={1} /> : item.type === "solution" ? <CheckCircle2 size={22} strokeWidth={1} /> : item.label}</span></div><div className="page-thumb-label">{item.page}. {item.label}</div></button>)}</div>
      <div className="page-stage"><BookPage project={project} page={page} template={template} /></div>
      <div className="panel preview-settings"><div className="panel-header"><div><div className="panel-title">Page settings</div><div className="panel-kicker">Live print preview</div></div><SlidersHorizontal size={17} /></div><div className="panel-body"><div className="settings-list">
        <div className="setting-row"><label>Grid size</label><select className="select" value={project.settings.gridSize} onChange={(event) => onSettings({ gridSize: event.target.value === "auto" ? "auto" : Number(event.target.value) as GridSize })}><option value="15">15 × 15</option><option value="17">17 × 17</option><option value="20">20 × 20</option><option value="auto">Auto-fit</option></select></div>
        <div className="setting-row"><label>Word-list columns</label><select className="select" value={project.settings.wordColumns ?? 2} onChange={(event) => onSettings({ wordColumns: Number(event.target.value) as 1 | 2 | 3 | 4 })}><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select></div>
        <div className="toggle-row"><span>Large-print mode</span><button className={`toggle ${project.settings.largePrint ? "on" : ""}`} aria-label="Toggle large-print mode" onClick={() => onSettings({ largePrint: !project.settings.largePrint })} /></div>
        <div className="toggle-row"><span>Allow backwards</span><button className={`toggle ${project.settings.backwards ? "on" : ""}`} aria-label="Toggle backwards words" onClick={() => onSettings({ backwards: !project.settings.backwards })} /></div>
        <div className="toggle-row"><span>Full bleed</span><button className={`toggle ${project.settings.bleed ? "on" : ""}`} aria-label="Toggle bleed" onClick={() => onSettings({ bleed: !project.settings.bleed })} /></div>
        <div className="setting-row"><label>Allowed directions</label>{(["horizontal", "vertical", "diagonal"] as const).map((direction) => <label className="check-row" key={direction}><input type="checkbox" checked={project.settings.directions.includes(direction)} onChange={() => { const directions = project.settings.directions.includes(direction) ? project.settings.directions.filter((item) => item !== direction) : [...project.settings.directions, direction]; if (directions.length) onSettings({ directions }); }} /> <span>{direction[0].toUpperCase() + direction.slice(1)}</span></label>)}</div>
        <div className="setting-row"><label>Deterministic seed</label><input className="input" value={project.settings.seed} onChange={(event) => onSettings({ seed: event.target.value })} /></div>
        <div className="setting-row"><label>Margins (inches)</label><div className="margin-grid">{(["top", "bottom", "inside", "outside"] as const).map((side) => <label key={side}><span>{side}</span><input className="input" type="number" min="0.25" max="1.5" step="0.05" value={project.settings.margins[side]} onChange={(event) => onSettings({ margins: { ...project.settings.margins, [side]: Number(event.target.value) } })} /></label>)}</div></div>
        <div className="issue"><strong>Odd/even aware.</strong> Inside gutter swaps automatically on facing pages during PDF export.</div>
      </div></div></div>
    </div>
  </div>;
}

function BookPage({ project, page, template }: { project: BookProject; page: PreviewPage; template: (typeof templates)[number] }) {
  const style = { "--book-accent": template.accent, "--book-paper": template.paper } as React.CSSProperties;
  const border = template.borderStyle !== "none" ? <div className={`book-page-border ${template.borderStyle}`} /> : null;
  const templateArt = template.artwork ? <div className="book-template-art" style={{ backgroundImage: `url(${template.artwork})` }} /> : null;
  const pageClass = `book-page ${template.fontFamily === "sans" ? "sans" : ""} ${project.settings.largePrint ? "large-print" : ""}`;
  if (!page) return <div className="book-page" />;
  if (page.type === "title") return <div className={pageClass} style={{ ...style, backgroundImage: project.assets?.decorative ? `linear-gradient(rgba(255,255,255,.86),rgba(255,255,255,.86)),url(${project.assets.decorative.dataUrl})` : undefined, backgroundSize: "cover" }}>{border}<div style={{ margin: "auto", textAlign: "center", maxWidth: "85%" }}><div className="book-section">{project.series}</div><h2 className="serif" style={{ fontSize: "clamp(35px, 6vw, 68px)", lineHeight: .92, margin: "20px 0" }}>{project.title}</h2><hr className="book-rule" /><p style={{ fontSize: "clamp(11px, 1.5vw, 18px)" }}>{project.subtitle}</p><p style={{ marginTop: 55, font: "600 10px var(--font-sans)" }}>{project.author}</p></div><span className="page-number">{page.page}</span></div>;
  if (page.type === "text") return <div className={pageClass} style={style}>{border}<div className="text-page-content"><h2 className="serif">{page.label}</h2><hr className="book-rule" /><p>{page.body}</p></div><span className="page-number">{page.page}</span></div>;
  if (page.type === "toc") return <div className={pageClass} style={style}>{border}<div className="toc-page"><div className="book-section">Inside this book</div><h2 className="serif">Table of Contents</h2><hr className="book-rule" /><div className="toc-list">{buildTableOfContents(project).map((entry) => <div className={`toc-entry ${entry.level}`} key={`${entry.label}-${entry.page}`}><span>{entry.label}</span><i /><b>{entry.page}</b></div>)}</div></div><span className="page-number">{page.page}</span></div>;
  if (page.type === "divider") return <div className={pageClass} style={{ ...style, backgroundImage: project.assets?.divider ? `linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.82)),url(${project.assets.divider.dataUrl})` : undefined, backgroundSize: "cover" }}>{border}<div style={{ margin: "auto", textAlign: "center" }}><div className="book-section">Section</div><h2 className="serif" style={{ fontSize: "clamp(38px, 6vw, 72px)", margin: "14px 0" }}>{page.label}</h2><hr className="book-rule" /><p style={{ fontStyle: "italic", fontSize: "clamp(10px, 1.3vw, 16px)" }}>{project.sections.find((s) => s.name === page.section)?.description}</p></div><span className="page-number">{page.page}</span></div>;
  let generated = page.puzzle?.generated;
  if (!generated && page.puzzle?.words.length) {
    try {
      generated = generatePuzzle(page.puzzle.words, { gridSize: project.settings.gridSize, directions: project.settings.directions, backwards: project.settings.backwards, seed: `${project.settings.seed}:${page.puzzle.id}` });
    } catch { generated = undefined; }
  }
  return <div className={pageClass} style={{ ...style, backgroundImage: page.type === "puzzle" && project.assets?.puzzle ? `linear-gradient(rgba(255,255,255,.92),rgba(255,255,255,.92)),url(${project.assets.puzzle.dataUrl})` : undefined, backgroundSize: "cover" }}>{border}{templateArt}<div className="book-page-head"><div className="book-section">{page.type === "solution" ? "Solution" : page.section}</div><h2 className="book-title serif">{page.puzzle?.title}</h2></div>{page.type === "puzzle" && <div className="book-words" style={{ gridTemplateColumns: `repeat(${project.settings.wordColumns ?? 2}, minmax(0, 1fr))` }}>{page.puzzle?.words.map((word, wordIndex) => <div key={`${word}-${wordIndex}`}>{word}</div>)}</div>}{generated ? <PuzzleGrid puzzle={generated} solution={page.type === "solution"} className="book-grid" /> : <div className="empty">Grid not generated</div>}{page.puzzle?.blurb && page.type === "puzzle" && <div className="book-blurb">{page.puzzle.blurb}</div>}<span className="page-number">{page.page}</span></div>;
}

function ExportView({ project, generatedCount, total, busy, onPdf, onJson, onCover }: { project: BookProject; generatedCount: number; total: number; busy: boolean; onPdf: (kind: "interior" | "solutions" | "combined") => void; onJson: () => void; onCover: () => void }) {
  const issues = allPuzzles(project).flatMap(({ puzzle }) => validateWords(puzzle.words, project.settings.gridSize)); const errors = issues.filter((item) => item.severity === "error");
  return <div className="content"><Heading eyebrow="Ready for press" title="Export your book" subtitle="Create print-ready files and keep a portable project backup." />
    <div className="export-grid"><div className="panel"><div className="panel-header"><div><div className="panel-title">Publishing files</div><div className="panel-kicker">Generated locally and on this app’s PDF endpoint</div></div></div><div className="panel-body">
      <ExportCard icon={BookOpen} title="Combined interior PDF" note="Front matter, dividers, puzzles, and answer key" action="Export PDF" disabled={busy || !!errors.length} onClick={() => onPdf("combined")} />
      <ExportCard icon={Grid3X3} title="Puzzle interior PDF" note="Book pages without the answer key" action="Export PDF" disabled={busy || !!errors.length} onClick={() => onPdf("interior")} />
      <ExportCard icon={CheckCircle2} title="Solutions PDF" note="Compact answer-key pages only" action="Export PDF" disabled={busy || !!errors.length} onClick={() => onPdf("solutions")} />
      <ExportCard icon={FileJson} title="Project backup" note="Portable JSON with settings, content, and grids" action="Export JSON" disabled={false} onClick={onJson} />
      <ExportCard icon={ImagePlus} title="Uploaded cover file" note={project.assets?.cover?.name || "Attach a finished cover image or PDF in Style and artwork"} action={project.assets?.cover ? "Download" : "Needs cover"} disabled={!project.assets?.cover} onClick={onCover} />
    </div></div>
    <div style={{ display: "grid", gap: 20 }}><div className="panel"><div className="panel-header"><div><div className="panel-title">Preflight check</div><div className="panel-kicker">KDP paperback readiness</div></div></div><div className="panel-body preflight">
      <Preflight ok={generatedCount === total} text={`${generatedCount} of ${total} puzzle grids generated`} />
      <Preflight ok={!errors.length} text={errors.length ? `${errors.length} blocking word-list issues` : "All words fit the selected grid size"} />
      <Preflight ok text="8.5 × 11 inch page size" />
      <Preflight ok text={`${project.settings.bleed ? "Bleed" : "No-bleed"} margin profile applied`} />
      <Preflight ok text="Black-and-white print-safe interior" />
    </div></div><div className="panel"><div className="panel-body"><div className="stat-label">Estimated book</div><div className="stat-value">{combinedPageCount(project)}</div><div className="stat-note">pages including contents and answer key</div></div></div></div>
    </div>
  </div>;
}

function ExportCard({ icon: Icon, title, note, action, disabled, onClick }: { icon: typeof BookOpen; title: string; note: string; action: string; disabled: boolean; onClick: () => void }) { return <div className="export-card"><div className="export-icon"><Icon size={21} /></div><div className="export-info"><strong>{title}</strong><span>{note}</span></div><button className="button small" disabled={disabled} onClick={onClick}><Download size={13} /> {action}</button></div>; }
function Preflight({ ok, text }: { ok: boolean; text: string }) { return <div className={`preflight-row ${ok ? "success" : "warning"}`}>{ok ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}<span>{text}</span></div>; }
