import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function titleFromFileName(fileName: string) {
  // remove extensão
  const base = fileName.replace(/\.pdf$/i, "");

  // troca separadores por espaço
  const spaced = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  // title case simples
  const lowerWords = new Set([
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "para",
    "por",
    "com",
    "a",
    "o",
    "as",
    "os",
  ]);

  const parts = spaced.toLowerCase().split(" ");
  return parts
    .map((w, i) => {
      if (i !== 0 && lowerWords.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export async function GET() {
  try {
    const dirPath = path.join(process.cwd(), "public", "minutas");

    if (!fs.existsSync(dirPath)) {
      // pasta ainda não existe -> lista vazia
      return NextResponse.json({ items: [] });
    }

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => /\.pdf$/i.test(f));

    // ordena por nome (você pode trocar pra data se quiser)
    files.sort((a, b) => b.localeCompare(a));

    const items = files.map((file) => ({
      id: file,
      title: titleFromFileName(file),
      url: `/minutas/${file}`,
    }));

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao listar minutas" },
      { status: 500 }
    );
  }
}
