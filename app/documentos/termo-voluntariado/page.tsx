import FormTermo from "./FormTermo";

export default function Page() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold">Termo de Voluntariado</h1>
      <p className="text-sm opacity-80 mt-1">
        Informe seu CPF e selecione sua cidade para gerar o termo preenchido.
      </p>

      <div className="mt-6">
        <FormTermo />
      </div>
    </div>
  );
}
