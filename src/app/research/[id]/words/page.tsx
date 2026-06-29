import { ResearchWorkspace } from "@/components/research/ResearchApp";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ResearchWorkspace id={id} mode="words" />; }
