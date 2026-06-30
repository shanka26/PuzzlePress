import type { BookProject } from "@/types/puzzle";

const KEY = "puzzlepress:projects:v1";
const ACTIVE_KEY = "puzzlepress:active-project:v1";

export function loadProjects(): BookProject[] {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(localStorage.getItem(KEY) || "[]") as BookProject[]).map(normalizeProjectLayout); } catch { return []; }
}

export function normalizeProjectLayout(project: BookProject): BookProject {
  const clampMargin = (value: number) => Math.min(1, Math.max(.5, Number.isFinite(value) ? value : .5));
  const margins = project.settings.margins;
  return {
    ...project,
    settings: {
      ...project.settings,
      layoutVersion: 2,
      wordColumns: project.settings.layoutVersion === 2 && project.settings.wordColumns !== undefined && Number(project.settings.wordColumns) !== 1 ? project.settings.wordColumns : "auto",
      margins: { top: clampMargin(margins.top), bottom: clampMargin(margins.bottom), inside: clampMargin(margins.inside), outside: clampMargin(margins.outside) },
    },
  };
}

export function saveProjects(projects: BookProject[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function loadActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveProjectId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function upsertProject(projects: BookProject[], project: BookProject): BookProject[] {
  return [project, ...projects.filter((item) => item.id !== project.id)];
}
