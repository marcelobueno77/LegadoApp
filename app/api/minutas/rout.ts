import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MinutaItem = {
  name: string; // nome do arquivo
  url: string;  // /minutas/Arquivo.pdf
};

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "minutas");

    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch (e: any) {
      // pasta não existe ainda => lista vazia
      if (e?.code === "ENOENT") {
        return NextResponse.json(
          { items: [] as MinutaItem[] },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      throw e;
    }

    const items: MinutaItem[] = files
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((name) => ({
        name,
        url: `/minutas/${encodeURIComponent(name)}`,
      }));

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao listar minutas." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
