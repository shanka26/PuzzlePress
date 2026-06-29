import type { BookProject } from "@/types/puzzle";

const KEY = "puzzlepress:projects:v1";

export function loadProjects(): BookProject[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as BookProject[]; } catch { return []; }
}

export function saveProjects(projects: BookProject[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}
