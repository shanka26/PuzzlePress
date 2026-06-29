import type { ResearchInput, ResearchProject } from "@/types/research";

export type GenerationTask = "market-research" | "metadata" | "outline" | "section" | "puzzle" | "words" | "blurb" | "full-project";
export interface GenerationRequest { task: GenerationTask; input: ResearchInput; project?: ResearchProject; sectionId?: string; puzzleId?: string }
export interface AIProvider { readonly name: string; generate(request: GenerationRequest): Promise<ResearchProject> }
