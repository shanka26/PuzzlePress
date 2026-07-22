import type { BookProject } from "@/types/puzzle";
import { seniorProject } from "./senior-preset";

const KEY = "puzzlepress:projects:v1";
const ACTIVE_KEY = "puzzlepress:active-project:v1";
const DB_NAME = "puzzlepress";
const STORE_NAME = "project-store";
const PROJECTS_RECORD = "projects";

export function loadProjects(): BookProject[] {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(localStorage.getItem(KEY) || "[]") as BookProject[]).map(normalizeProjectLayout); } catch { return []; }
}

export async function loadProjectsAsync(): Promise<BookProject[]> {
  const indexedProjects = await loadProjectsFromIndexedDb();
  return mergeSavedProjects(loadProjects(), indexedProjects);
}

export function normalizeProjectLayout(project: BookProject): BookProject {
  const clampMargin = (value: number) => Math.min(1, Math.max(.5, Number.isFinite(value) ? value : .5));
  const margins = project.settings.margins;
  return seniorProject({
    ...project,
    settings: {
      ...project.settings,
      layoutVersion: 2,
      wordColumns: project.settings.layoutVersion === 2 && project.settings.wordColumns !== undefined && Number(project.settings.wordColumns) !== 1 ? project.settings.wordColumns : "auto",
      margins: { top: clampMargin(margins.top), bottom: clampMargin(margins.bottom), inside: clampMargin(margins.inside), outside: clampMargin(margins.outside) },
    },
  });
}

export function saveProjects(projects: BookProject[]): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(projects);
  void saveProjectsToIndexedDb(projects);
  try {
    localStorage.setItem(KEY, serialized);
  } catch {
    try {
      localStorage.removeItem(KEY);
      localStorage.setItem(KEY, JSON.stringify(projects.map(projectForLocalFallback)));
    } catch {
      // Full project data is still written to IndexedDB above; localStorage is only a small fast path.
    }
  }
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

function projectForLocalFallback(project: BookProject): BookProject {
  if (!project.assets) return project;
  const assets = Object.fromEntries(Object.entries(project.assets).map(([key, asset]) => [key, asset ? { ...asset, dataUrl: "" } : asset])) as BookProject["assets"];
  return { ...project, assets };
}

function mergeSavedProjects(localProjects: BookProject[], indexedProjects: BookProject[]): BookProject[] {
  const byId = new Map<string, BookProject>();
  for (const project of [...indexedProjects, ...localProjects]) {
    const existing = byId.get(project.id);
    if (!existing) {
      byId.set(project.id, project);
      continue;
    }
    const projectTime = Date.parse(project.updatedAt || "");
    const existingTime = Date.parse(existing.updatedAt || "");
    const preferred = projectTime >= existingTime ? project : existing;
    const fallback = preferred === project ? existing : project;
    byId.set(project.id, preserveAssetData(preferred, fallback));
  }
  return [...byId.values()]
    .map(normalizeProjectLayout)
    .sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
}

function preserveAssetData(project: BookProject, fallback: BookProject): BookProject {
  if (!project.assets || !fallback.assets) return project;
  const assets = { ...project.assets };
  for (const key of Object.keys(assets) as Array<keyof NonNullable<BookProject["assets"]>>) {
    const asset = assets[key];
    const fallbackAsset = fallback.assets[key];
    if (asset && fallbackAsset?.dataUrl && !asset.dataUrl) assets[key] = fallbackAsset;
  }
  return { ...project, assets };
}

function openProjectsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(request.error || new Error("Could not open project storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function loadProjectsFromIndexedDb(): Promise<BookProject[]> {
  if (typeof window === "undefined") return [];
  try {
    const db = await openProjectsDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(PROJECTS_RECORD);
      request.onerror = () => reject(request.error || new Error("Could not read saved projects."));
      request.onsuccess = () => resolve(((request.result || []) as BookProject[]).map(normalizeProjectLayout));
      transaction.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

async function saveProjectsToIndexedDb(projects: BookProject[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openProjectsDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put(projects, PROJECTS_RECORD);
      request.onerror = () => reject(request.error || new Error("Could not save projects."));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error || new Error("Could not save projects."));
    });
  } catch (error) {
    console.error("PuzzlePress could not save projects to IndexedDB.", error);
  }
}
