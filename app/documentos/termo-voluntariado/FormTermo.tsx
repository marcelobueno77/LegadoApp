"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/app/lib/supabase/client";

const ACTIVITIES_TEXT =
  "O ministério tem como propósito realizar evangelismo prático e relacional por meio da cultura das motos, anunciando o Evangelho, fortalecendo relacionamentos e acompanhando espiritualmente novos membros, participando de momentos de oração, ministração da Palavra e testemunhos, além de colaborar na organização, logística, recepção e segurança de encontros, passeios, moto cultos, viagens e moto células, bem como em ações sociais, promovendo comunhão e contribuindo para a expansão do Reino de Deus.";

// ✅ Tabela/colunas corretas do seu Supabase
const CITIES_TABLE = "cities_registry";
const COL_CITY = "city_uf";
const COL_CHURCH = "church_name";
const COL_CNPJ = "cnpj";
const COL_ADDRESS = "address";
const COL_LEADER = "leader_ministry_name";

type ChurchInfo = {
  city_uf: string | null;
  church_name: string | null;
  cnpj: string | null;
  address: string | null;
  leader_ministry_name: string | null;
};

function formatCPF(value: string) {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length !== 11) return d;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatCNPJ(value: string) {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return d;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default function FormTermo() {
  const router = useRouter();

  const [cpf, setCpf] = useState("");
  const [search, setSearch] = useState("");
  const [selectedChurch, setSelectedChurch] = useState<ChurchInfo | null>(null);
  const [churches, setChurches] = useState<ChurchInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ Carrega cidades + igrejas da tabela cities_registry
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from(CITIES_TABLE)
        .select(`${COL_CITY}, ${COL_CHURCH}, ${COL_CNPJ}, ${COL_ADDRESS}, ${COL_LEADER}`)
        .order(COL_CITY, { ascending: true });

      if (error) {
        console.error("Erro ao carregar cidades/igrejas:", error);
        setChurches([]);
        return;
      }

      const list = (data ?? []).map((item: any) => ({
        city_uf: item?.[COL_CITY] ?? null,
        church_name: item?.[COL_CHURCH] ?? null,
        cnpj: item?.[COL_CNPJ] ?? null,
        address: item?.[COL_ADDRESS] ?? null,
        leader_ministry_name: item?.[COL_LEADER] ?? null,
      }));

      setChurches(list);
    })();
  }, []);

  const cpfDigits = useMemo(() => cpf.replace(/\D/g, ""), [cpf]);
  const cpfFormatted = useMemo(() => formatCPF(cpfDigits), [cpfDigits]);

  const filteredChurches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];

    return churches.filter((item) => {
      const city = String(item.city_uf ?? "").toLowerCase();
      const church = String(item.church_name ?? "").toLowerCase();

      return city.includes(term) || church.includes(term);
    });
  }, [search, churches]);

  async function handleGenerate() {
    const newTab = window.open("", "_blank");

    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        alert("Você precisa estar logado para gerar o termo.");
        if (newTab) newTab.close();
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;

      if (!selectedChurch) {
        alert("Selecione uma igreja ou cidade válida.");
        if (newTab) newTab.close();
        return;
      }

      const church = selectedChurch;

      const templateBytes = await fetch("/templates/termo-voluntariado.pdf").then((r) =>
        r.arrayBuffer()
      );

      const pdfDoc = await PDFDocument.load(templateBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const page1 = pdfDoc.getPage(0);

      const size = 9;
      const color = rgb(0, 0, 0);

      const fullName = profile?.full_name ?? "";
      const phone = profile?.phone ?? "";
      const email = user.email ?? "";

      const ministry = "Legado MC";

      const leader = church?.leader_ministry_name ?? "";
      const address = church?.address ?? "";

      const cnpjRaw = church?.cnpj ?? "";
      const cnpjFormatted = formatCNPJ(String(cnpjRaw));

      page1.drawText(fullName, { x: 114, y: 712, size, font, color });
      page1.drawText(phone, { x: 129, y: 688, size, font, color });
      page1.drawText(cpfFormatted, { x: 344, y: 688, size, font, color });
      page1.drawText(email, { x: 192, y: 665, size, font, color });

      page1.drawText(address, { x: 134, y: 595, size, font, color });
      page1.drawText(cnpjFormatted, { x: 115, y: 572, size, font, color });
      page1.drawText(ministry, { x: 134, y: 548, size, font, color });
      page1.drawText(leader, { x: 172, y: 525, size, font, color });

      const maxWidth = 440;
      const lineHeight = 9;
      let y = 495;

      const words = ACTIVITIES_TEXT.trim().split(/\s+/);
      let line = "";

      for (const w of words) {
        const testLine = line.length > 0 ? line + " " + w : w;
        const width = font.widthOfTextAtSize(testLine, size);

        if (width > maxWidth) {
          page1.drawText(line.trim(), { x: 75, y, size, font, color });
          y -= lineHeight;
          line = w;
        } else {
          line = testLine;
        }
      }

      if (line) page1.drawText(line.trim(), { x: 75, y, size, font, color });

      const out = await pdfDoc.save();
      const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;

      const blob = new Blob([ab], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      if (newTab) {
        newTab.location.href = url;
        newTab.focus();
      } else {
        window.location.href = url;
      }

      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      console.error(e);
      alert("Erro ao gerar o PDF. Veja o console para detalhes.");
      if (newTab) newTab.close();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <label className="text-sm font-medium">CPF</label>
        <input
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          placeholder="Digite seu CPF"
          className="border rounded px-3 py-2"
          inputMode="numeric"
        />
      </div>

      <div className="grid gap-3 relative">
        <label className="text-sm font-medium">
          Digite o nome da sua Igreja ou o nome da sua Cidade
        </label>

        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedChurch(null);
          }}
          placeholder="Ex: Bola de Neve Curitiba ou Curitiba/PR"
          className="border rounded px-3 py-2"
        />

        {!selectedChurch && filteredChurches.length > 0 && (
          <div className="border rounded bg-white shadow-sm max-h-60 overflow-auto">
            {filteredChurches.map((item, idx) => {
              const label = `${item.church_name ?? "Sem nome"} - ${item.city_uf ?? "Sem cidade"}`;

              return (
                <button
                  key={`${item.church_name}-${item.city_uf}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedChurch(item);
                    setSearch(label);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b last:border-b-0"
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => router.push("/documentos")}
          className="border rounded px-4 py-2"
          disabled={loading}
        >
          Voltar
        </button>

        <button
          onClick={handleGenerate}
          disabled={loading || !cpfDigits || !selectedChurch}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-60"
        >
          {loading ? "Gerando..." : "Gerar PDF preenchido"}
        </button>
      </div>

      <p className="text-xs opacity-70">
        Obs: se o texto não cair certinho nos campos, a gente ajusta as coordenadas (x,y) uma vez e pronto.
      </p>
    </div>
  );
}