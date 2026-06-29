import type { TemplateStyle } from "@/types/puzzle";

export const templates: TemplateStyle[] = [
  { id: "clean-classic", name: "Clean Classic", description: "Crisp rules and generous white space", accent: "#273b31", paper: "#fffefa", fontFamily: "serif", borderStyle: "line" },
  { id: "vintage-nostalgia", name: "Vintage Nostalgia", description: "Warm, familiar, and editorial", accent: "#9a5b35", paper: "#fbf4e8", fontFamily: "serif", borderStyle: "double", artwork: "/template-art/starburst.svg" },
  { id: "church-memories", name: "Church Memories", description: "Quiet elegance with traditional details", accent: "#5f5448", paper: "#fffdf7", fontFamily: "serif", borderStyle: "ornate", artwork: "/template-art/window.svg" },
  { id: "black-heritage", name: "Black Heritage Nostalgia", description: "Bold framing and archival warmth", accent: "#7b3f28", paper: "#fcf7ed", fontFamily: "sans", borderStyle: "double", artwork: "/template-art/quilt.svg" },
  { id: "botanical-calm", name: "Botanical Calm", description: "Soft leaves and a restful garden feel", accent: "#52705a", paper: "#f8fbf5", fontFamily: "serif", borderStyle: "line", artwork: "/template-art/botanical.svg" },
  { id: "midcentury-play", name: "Midcentury Play", description: "Optimistic starbursts and 1950s energy", accent: "#b55236", paper: "#fff6e7", fontFamily: "sans", borderStyle: "double", artwork: "/template-art/starburst.svg" },
  { id: "sunday-hymnal", name: "Sunday Hymnal", description: "Stained-glass geometry and classic type", accent: "#625174", paper: "#fdf9f0", fontFamily: "serif", borderStyle: "ornate", artwork: "/template-art/window.svg" },
  { id: "heritage-quilt", name: "Heritage Quilt", description: "Geometric textile-inspired framing", accent: "#8d4933", paper: "#fff9ef", fontFamily: "sans", borderStyle: "double", artwork: "/template-art/quilt.svg" },
  { id: "coastal-breeze", name: "Coastal Breeze", description: "Open space with gentle wave details", accent: "#3f7180", paper: "#f7fcfd", fontFamily: "sans", borderStyle: "line", artwork: "/template-art/waves.svg" },
  { id: "bold-large-print", name: "Bold Large Print", description: "Maximum contrast and effortless reading", accent: "#1f2823", paper: "#ffffff", fontFamily: "sans", borderStyle: "none" },
];
