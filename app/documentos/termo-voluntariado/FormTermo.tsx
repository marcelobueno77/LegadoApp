"use client";

import { useEffect, useMemo, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/app/lib/supabase/client";

const ACTIVITIES_TEXT =
  "O ministério tem como propósito realizar evangelismo prático e relacional por meio da cultura das motos, anunciando o Evangelho, fortalecendo relacionamentos e acompanhando espiritualmente novos membros, participando de momentos de oração, ministração da Palavra e testemunhos, além de colaborar na organização, logística, recepção e segurança de encontros, passeios, moto cultos, viagens e moto células, bem como em ações sociais, promovendo comunhão e contribuindo para a expansão do Reino de Deus.";

// ✅ Tabela/colunas corretas do seu Supabase
const CITIES_TABLE = "cities_registry";
const COL_CITY = "city_uf";
const COL_CNPJ = "cnpj";
const COL_ADDRESS = "address";
const COL_LEADER = "leader_ministry_name";

type ChurchInfo = {
  city_uf: string | null;
  cnpj: string | null;
  address: string | null;
  leader_ministry_name: string | null;
};

// ✅ Formatação CPF/CNPJ
function formatCPF(value: string) {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length !== 11) return d; // se estiver incompleto, não força máscara
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatCNPJ(value: string) {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return d; // se estiver incompleto, não força máscara
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default function FormTermo() {
  const [cpf, setCpf] = useState("");
  const [city, setCity] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ Carrega lista de cidades (da tabela cities_registry)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from(CITIES_TABLE)
        .select(COL_CITY)
        .order(COL_CITY, { ascending: true });

      if (error) {
        console.error("Erro ao carregar cidades:", error);
        setCities([]);
        return;
      }

      const list =
        (data ?? [])
          .map((x: any) => String(x?.[COL_CITY] ?? "").trim())
          .filter(Boolean);

      setCities(Array.from(new Set(list)));
    })();
  }, []);

  const cpfDigits = useMemo(() => cpf.replace(/\D/g, ""), [cpf]);
  const cpfFormatted = useMemo(() => formatCPF(cpfDigits), [cpfDigits]);

  async function handleGenerate() {
    setLoading(true);
    try {
      // 1) Usuário logado (email)
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        alert("Você precisa estar logado para gerar o termo.");
        return;
      }

      // 2) Perfil (full_name, phone)
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;

      // 3) Dados da igreja pelo city_uf (CNPJ, ADDRESS, leader_ministry_name)
      const { data: church, error: churchErr } = await supabase
        .from(CITIES_TABLE)
        .select(`${COL_CITY}, ${COL_CNPJ}, ${COL_ADDRESS}, ${COL_LEADER}`)
        .eq(COL_CITY, city)
        .maybeSingle<ChurchInfo>();

      if (churchErr) throw churchErr;
      if (!church) {
        alert("Não encontrei informações da igreja para essa cidade.");
        return;
      }

      // 4) Carrega PDF template
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

      // ✅ Aqui a gente fixa o ministério como você quer
      const ministry = "Legado MC";

      const leader = church?.leader_ministry_name ?? "";
      const address = church?.address ?? "";

      // ✅ Formata CNPJ
      const cnpjRaw = church?.cnpj ?? "";
      const cnpjFormatted = formatCNPJ(String(cnpjRaw));

      // 🔧 AJUSTAR COORDENADAS (x,y)
      // Topo “Voluntário”
      page1.drawText(fullName, { x: 114, y: 712, size, font, color }); // Nome
      page1.drawText(phone, { x: 129, y: 688, size, font, color }); // Telefone
      page1.drawText(cpfFormatted, { x: 344, y: 688, size, font, color }); // CPF (formatado)
      page1.drawText(email, { x: 192, y: 665, size, font, color }); // Email

      // Seção Igreja
      page1.drawText(address, { x: 134, y: 595, size, font, color }); // Endereço
      page1.drawText(cnpjFormatted, { x: 115, y: 572, size, font, color }); // CNPJ (formatado)
      page1.drawText(ministry, { x: 134, y: 548, size, font, color }); // Ministério
      page1.drawText(leader, { x: 172, y: 525, size, font, color }); // Líder

      // Atividades (texto longo -> quebrar em linhas)
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

      // 5) Exporta e abre
      const out = await pdfDoc.save(); // Uint8Array
      const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;

      const blob = new Blob([ab], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      console.error(e);
      alert("Erro ao gerar o PDF. Veja o console para detalhes.");
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

      <div className="grid gap-3">
        <label className="text-sm font-medium">Cidade (sede)</label>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">Selecione...</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !cpfDigits || !city}
        className="bg-black text-white rounded px-4 py-2 disabled:opacity-60"
      >
        {loading ? "Gerando..." : "Gerar PDF preenchido"}
      </button>

      <p className="text-xs opacity-70">
        Obs: se o texto não cair certinho nos campos, a gente ajusta as coordenadas (x,y) uma vez e pronto.
      </p>
    </div>
  );
}
