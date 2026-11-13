import { strToU8, zipSync } from "fflate";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import type { LoteConferencia } from "./lotes";
import type { Leitura } from "./udi/tipos";
import { textoTrilha } from "./udi/trilha";

export function zipLeituras(csv: string, imagens: { nome: string; bytes: Uint8Array }[]): Blob {
  const arquivos: Record<string, Uint8Array> = { "leituras.csv": strToU8(csv) };
  for (const imagem of imagens) arquivos[`imagens/${imagem.nome}`] = imagem.bytes;
  const zip = zipSync(arquivos, { level: 6 });
  return new Blob([zip], { type: "application/zip" });
}

export async function pdfLeitura(leitura: Leitura, foto: Blob | null): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 14;
  let y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Leitor UDI — registro da leitura", margem, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${leitura.quando}  ·  ${leitura.resultado.agenciaNome}`, margem, y);
  y += 6;
  doc.text(`Conferência: ${leitura.conferencia}`, margem, y);
  y += 8;
  if (foto) {
    const url = await blobParaDados(foto);
    const props = doc.getImageProperties(url);
    const largura = 180;
    const altura = Math.min(90, (props.height / props.width) * largura);
    doc.addImage(url, "JPEG", margem, y, largura, altura);
    y += altura + 8;
  }
  doc.setFontSize(10);
  for (const passo of leitura.trilha) {
    const bloco = doc.splitTextToSize(`${passo.numero}. ${passo.titulo}\n${passo.detalhe}`, 180);
    const altura = bloco.length * 4.4 + 3;
    if (y + altura > 285) {
      doc.addPage();
      y = 16;
    }
    doc.text(bloco, margem, y);
    y += altura;
  }
  doc.setFontSize(8);
  doc.text("Gerado no aparelho. Nenhum dado foi enviado a um servidor.", margem, 290);
  return doc.output("blob");
}

function blobParaDados(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

export function excelLote(lote: LoteConferencia, leituras: Leitura[]): Blob {
  const resumo = [
    {
      produto: lote.modelo || "Sem modelo",
      di: lote.di,
      lote: lote.lote,
      validade: lote.validade,
      primeira: lote.inicio,
      ultima: lote.fim,
      leituras: lote.quantidade,
      ok: lote.ok,
      divergentes: lote.divergentes,
      series_repetidas: lote.seriaisRepetidos.map((item) => `${item.serie} × ${item.vezes}`).join("; "),
    },
  ];
  const linhas = leituras.map((leitura) => ({
    data_hora: leitura.quando,
    di: leitura.resultado.di ?? "",
    conferencia: leitura.conferencia,
    modelo: leitura.modelo,
    vencido: leitura.resultado.vencido ? "sim" : "nao",
    bruto: leitura.resultado.bruto,
    trilha: textoTrilha(leitura.trilha ?? []),
  }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(resumo), "Resumo");
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(linhas), "Leituras");
  const binario = XLSX.write(livro, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([binario], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function pdfLote(lote: LoteConferencia, leituras: Leitura[], fotos: Map<string, Blob | null>): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 14;
  let y = 16;
  const escrever = (texto: string, tamanho = 10, negrito = false) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    const linhas = doc.splitTextToSize(texto, 180) as string[];
    const altura = linhas.length * (tamanho * 0.45) + 2;
    if (y + altura > 285) {
      doc.addPage();
      y = 16;
    }
    doc.text(linhas, margem, y);
    y += altura;
  };
  escrever("Lote de conferência", 16, true);
  escrever(lote.variosProdutos ? "Vários produtos neste grupo." : `Produto: ${lote.modelo || "Sem modelo"}`);
  escrever(`DI: ${lote.di || "—"}`);
  escrever(`Lote: ${lote.lote || "—"}`);
  escrever(`Validade: ${lote.validade || "—"}`);
  escrever(`De ${lote.inicio} até ${lote.fim}`);
  escrever(`${lote.quantidade} leitura(s). OK: ${lote.ok}. Divergentes: ${lote.divergentes}.`);
  escrever(
    lote.seriaisRepetidos.length
      ? `Séries repetidas: ${lote.seriaisRepetidos.map((item) => `${item.serie} (${item.vezes})`).join(", ")}`
      : "Nenhuma série repetida.",
  );
  y += 2;
  for (const leitura of leituras) {
    escrever(`${leitura.quando} · ${leitura.conferencia}`, 11, true);
    const foto = fotos.get(leitura.id);
    if (foto) {
      const url = await blobParaDados(foto);
      const props = doc.getImageProperties(url);
      const largura = 42;
      const altura = Math.min(32, (props.height / props.width) * largura);
      if (y + altura > 285) {
        doc.addPage();
        y = 16;
      }
      doc.addImage(url, "JPEG", margem, y, largura, altura);
      y += altura + 3;
    }
    escrever(textoTrilha(leitura.trilha ?? []));
  }
  doc.setFontSize(8);
  doc.text("Gerado no aparelho. Nenhum dado foi enviado.", margem, 290);
  return doc.output("blob");
}

export function nomeImagem(leitura: Leitura): string {
  const hora = leitura.quando.replace(/[^\d]/g, "").slice(0, 14);
  return `${hora}-${leitura.resultado.agencia}.jpg`;
}

export { textoTrilha };
