import type { ResearchProject } from "@/types/research";

const KEY = "puzzlepress:research-projects:v1";
export function loadResearchProjects(): ResearchProject[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as ResearchProject[]; } catch { return []; }
}
export function saveResearchProjects(projects: ResearchProject[]) { localStorage.setItem(KEY, JSON.stringify(projects)); }
export function saveResearchProject(project: ResearchProject) {
  const projects = loadResearchProjects();
  saveResearchProjects([project, ...projects.filter((item) => item.id !== project.id)]);
}
