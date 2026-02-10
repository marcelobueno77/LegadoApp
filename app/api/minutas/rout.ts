import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "minutas");

    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        return NextResponse.json({ items: [] });
      }
      throw e;
    }

    const items = files
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .sort((a, b) => b.localeCompare(a))
      .map((filename) => ({
        id: filename,
        filename,
        title: filename.replace(/\.pdf$/i, ""),
        url: `/minutas/${encodeURIComponent(filename)}`,
      }));

    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao listar minutas." },
      { status: 500 }
    );
  }
}
