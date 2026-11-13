import {
  apagarLeitura,
  gravarConfig,
  gravarImagem,
  gravarLeitura,
  gravarPrefsLote,
  gravarReferencia,
  lerConfig,
  lerFoto,
  lerHistorico,
  lerMiniatura,
  lerPrefsLote,
  lerReferencia,
  limparHistorico,
  medirImagens,
} from "./armazen";
import { conferir, type Conferencia, type LinhaReferencia } from "./conferencia";
import elementos from "./dados/elementos-udi.json";
import { EXEMPLO_GS1, EXEMPLO_HIBCC, EXEMPLO_ISBT } from "./exemplos";
import { excelLote, nomeImagem, pdfLeitura, pdfLote, zipLeituras } from "./exportar";
import { fotosDe } from "./foto";
import { agruparLeituras, leituraAbreLoteNovo, loteAberto, type LoteConferencia, type ModoAgrupamento } from "./lotes";
import { lerPlanilha, planilhaParaCsv, planilhaParaXlsx } from "./planilha";
import { lerCodigo, type Caixa } from "./scan";
import { dataHoraSaoPaulo } from "./udi/tempo";
import { lerUdi } from "./udi/ler";
import { montarTrilha, textoTrilha } from "./udi/trilha";
import type { ChecklistHri, Leitura, Resultado } from "./udi/tipos";

type Aba = "ler" | "planilha" | "historico" | "elementos" | "sobre";

type Estado = {
  aba: Aba;
  substituto: string;
  nivel: string;
  referencia: LinhaReferencia[] | null;
  historico: Leitura[];
  atual: { resultado: Resultado; conferencia: Conferencia; leituraId: string } | null;
  avisoTela: string;
  busca: string;
  filtro: string;
  cameraLigada: boolean;
  modoLote: ModoAgrupamento;
  cortes: string[];
  loteAbertoId: string | null;
  leituraAbertaId: string | null;
  uso: string;
};

const SECOES: Record<string, string> = {
  "Device Identification & Description": "Identificação e descrição do dispositivo",
  "Contact Information": "Informações de contato",
  "Device Packaging & Status": "Embalagem e situação do dispositivo",
  "Device Characteristics": "Características do dispositivo",
  "Licensing, Classification & Nomenclature": "Licença, classificação e nomenclatura",
};

let estado: Estado;
let raiz: HTMLElement;
let fluxo: MediaStream | null = null;
let geracaoCamera = 0;
const miniaturas = new Map<string, string>();
let fotoAberta: { id: string; url: string } | null = null;

function el(tag: string, classe = "", texto = ""): HTMLElement {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto) no.textContent = texto;
  return no;
}

function botao(texto: string, classe: string, acao: () => void): HTMLButtonElement {
  const no = document.createElement("button");
  no.type = "button";
  no.className = classe;
  no.textContent = texto;
  no.addEventListener("click", acao);
  return no;
}

function baixar(nome: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function desenhar(): void {
  const focado = document.activeElement instanceof HTMLElement ? document.activeElement.id : "";
  const cursor = document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null;
  raiz.replaceChildren();
  const app = el("div", "app");
  const topo = el("header", "topo");
  topo.append(el("p", "olho", "RDC 591/2021 · offline"));
  topo.append(el("h1", "", "Leitor UDI"));
  topo.append(el("p", "", "GS1, HIBCC e ISBT 128. Nada sai do aparelho."));
  app.append(topo);
  const miolo = el("main", "grade");
  if (estado.aba === "ler") miolo.append(telaLer());
  if (estado.aba === "planilha") miolo.append(telaPlanilha());
  if (estado.aba === "historico") miolo.append(telaHistorico());
  if (estado.aba === "elementos") miolo.append(telaElementos());
  if (estado.aba === "sobre") miolo.append(telaSobre());
  app.append(miolo);
  app.append(navegacao());
  raiz.append(app);
  if (focado) {
    const deNovo = document.getElementById(focado);
    if (deNovo instanceof HTMLInputElement || deNovo instanceof HTMLTextAreaElement) {
      deNovo.focus();
      if (cursor != null) deNovo.setSelectionRange(cursor, cursor);
    }
  }
}

function navegacao(): HTMLElement {
  const nav = el("nav", "nav");
  const itens: [Aba, string][] = [
    ["ler", "Ler"],
    ["planilha", "Planilha"],
    ["historico", "Histórico"],
    ["elementos", "Elementos"],
    ["sobre", "Sobre"],
  ];
  for (const [aba, nome] of itens) {
    const b = botao(nome, estado.aba === aba ? "ativa" : "", () => {
      pararCamera();
      estado.aba = aba;
      desenhar();
    });
    nav.append(b);
  }
  return nav;
}

function telaLer(): HTMLElement {
  const caixa = el("section", "grade");
  caixa.append(painelLoteAtual());
  if (estado.avisoTela) {
    const faixa = el("p", "faixa aviso", estado.avisoTela);
    caixa.append(faixa);
  }
  const acoes = el("div", "grade");
  acoes.append(botao(estado.cameraLigada ? "Parar câmera" : "Abrir câmera", "botao", () => {
    if (estado.cameraLigada) pararCamera();
    else void abrirCamera();
  }));
  const arquivo = document.createElement("input");
  arquivo.type = "file";
  arquivo.accept = "image/*";
  arquivo.id = "arquivo-imagem";
  arquivo.hidden = true;
  arquivo.addEventListener("change", () => {
    const file = arquivo.files?.[0];
    if (file) void lerArquivo(file);
  });
  const rotulo = document.createElement("label");
  rotulo.className = "botao-sec arquivo";
  rotulo.htmlFor = "arquivo-imagem";
  rotulo.append(document.createTextNode("Escolher imagem"), arquivo);
  acoes.append(rotulo);
  caixa.append(acoes);

  const video = document.createElement("video");
  video.className = "video";
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.id = "visor";
  video.hidden = !estado.cameraLigada;
  caixa.append(video);
  const status = el("p", "ajuda", "");
  status.id = "status-camera";
  caixa.append(status);

  const texto = document.createElement("textarea");
  texto.id = "codigo";
  texto.placeholder = "Cole o código. Ex.: (01)… ou +… ou =/…";
  const sub = document.createElement("input");
  sub.id = "substituto";
  sub.maxLength = 4;
  sub.value = estado.substituto;
  sub.addEventListener("change", () => {
    estado.substituto = sub.value;
    void gravarConfig({ substitutoGs: estado.substituto, nivel: estado.nivel });
  });
  const form = el("div", "cartao grade");
  form.append(el("h2", "", "Colar ou digitar"));
  const lab = el("label", "", "Código lido");
  lab.append(texto);
  form.append(lab);
  const lab2 = el("label", "", "Substituto do GS");
  lab2.append(sub);
  lab2.append(el("span", "ajuda", "O leitor também aceita o GS de verdade (ASCII 29), <GS> e {GS}. O padrão é |."));
  form.append(lab2);
  form.append(botao("Interpretar texto", "botao", () => {
    const valor = texto.value.trim();
    if (!valor) {
      estado.avisoTela = "Cole ou digite um código antes de interpretar.";
      desenhar();
      return;
    }
    void publicar(valor, "texto");
  }));
  caixa.append(form);

  const exemplos = el("div", "cartao");
  exemplos.append(el("h2", "", "Exemplos públicos da FDA"));
  exemplos.append(el("p", "ajuda", "São as três strings da versão 1.4, de 1º de setembro de 2025. Não são produtos reais."));
  const linha = el("div", "grade");
  linha.append(botao("GS1", "botao-sec", () => void publicar(EXEMPLO_GS1, "exemplo")));
  linha.append(botao("HIBCC", "botao-sec", () => void publicar(EXEMPLO_HIBCC, "exemplo")));
  linha.append(botao("ISBT 128", "botao-sec", () => void publicar(EXEMPLO_ISBT, "exemplo")));
  exemplos.append(linha);
  caixa.append(exemplos);
  if (estado.atual) caixa.append(painel(estado.atual.resultado, estado.atual.conferencia, estado.atual.leituraId));
  return caixa;
}

function painel(resultado: Resultado, conferencia: Conferencia, leituraId: string): HTMLElement {
  const cartao = el("article", "cartao");
  cartao.append(el("span", "selo", resultado.agenciaNome));
  const status = el("p", `status ${conferencia.status}`, conferencia.rotulo);
  cartao.append(status);
  cartao.append(el("p", "", conferencia.detalhe));
  if (resultado.vencido) cartao.append(el("p", "faixa alerta", resultado.vencido));
  if (resultado.di) {
    const di = el("p", "");
    di.append(el("strong", "", `${resultado.diRotulo}: `));
    di.append(el("span", "mono", resultado.di));
    cartao.append(di);
  }
  if (Object.keys(conferencia.extras).length) {
    const extra = el("div", "faixa info");
    extra.append(el("strong", "", "Colunas extras da planilha"));
    const ul = document.createElement("ul");
    for (const [chave, valor] of Object.entries(conferencia.extras)) {
      const li = document.createElement("li");
      li.textContent = `${chave}: ${valor}`;
      ul.append(li);
    }
    extra.append(ul);
    cartao.append(extra);
  }
  for (const campo of resultado.campos) {
    const bloco = el("div", "campo");
    bloco.append(el("span", "", campo.rotulo));
    bloco.append(el("strong", "mono", campo.valor));
    if (campo.detalhe) bloco.append(el("span", "", campo.detalhe));
    cartao.append(bloco);
  }
  for (const msg of resultado.erros) cartao.append(el("p", "faixa alerta", msg));
  for (const msg of resultado.avisos) cartao.append(el("p", "faixa aviso", msg));
  for (const msg of resultado.informes) cartao.append(el("p", "faixa info", msg));
  if (resultado.agencia === "GS1") cartao.append(blocoHri(resultado, leituraId));
  else {
    cartao.append(el(
      "p",
      "ajuda",
      "A conferência do texto legível desta tela segue a GS1. Ela não se aplica a HIBCC nem a ISBT 128.",
    ));
  }
  return cartao;
}

function blocoHri(resultado: Resultado, leituraId: string): HTMLElement {
  const box = el("section", "grade");
  box.append(el("h2", "", "Conferência do texto legível (HRI)"));
  box.append(el(
    "p",
    "ajuda",
    "GS1 General Specifications v15, seções 4.14 e 4.14.1, com o GSCN WR14-175 (ratificado em 5 de outubro de 2015). O HRI abaixo é o AI entre parênteses e o dado como está no código.",
  ));
  const pre = el("p", "hri mono", resultado.hri || "(sem campos para o HRI)");
  box.append(pre);
  box.append(botao("Copiar HRI", "botao-sec", () => {
    void navigator.clipboard?.writeText(resultado.hri || "");
  }));
  for (const nota of resultado.hriNotas) box.append(el("p", "faixa info", nota));
  box.append(el(
    "p",
    "ajuda",
    "Se não couber o HRI inteiro, a GS1 pede preferência para a chave GS1 — em geral o GTIN, AI (01).",
  ));
  const leitura = estado.historico.find((item) => item.id === leituraId);
  const check = leitura?.checklist ?? checklistInicial(resultado);
  const lista = el("div", "check");
  lista.append(caixaCheck("O HRI está no rótulo e confere com o texto acima.", check.presenteConfere, (v) => {
    check.presenteConfere = v;
    void salvarCheck(leituraId, check);
  }));
  const sel = document.createElement("select");
  sel.id = "nao-hri";
  for (const [valor, nome] of [
    ["ausente", "Não há texto não-HRI"],
    ["regra-ok", "Há texto não-HRI e a regra foi seguida"],
    ["regra-falha", "Há texto não-HRI fora da regra"],
  ] as const) {
    const op = document.createElement("option");
    op.value = valor;
    op.textContent = nome;
    if (check.textoNaoHri === valor) op.selected = true;
    sel.append(op);
  }
  sel.addEventListener("change", () => {
    check.textoNaoHri = sel.value as ChecklistHri["textoNaoHri"];
    void salvarCheck(leituraId, check);
  });
  const lab = el("label", "", "Texto não-HRI");
  lab.append(sel);
  lab.append(el(
    "span",
    "ajuda",
    "Se o dado não-HRI é exatamente o do HRI, o AI pode ser impresso junto com o título. Se o dado foi reformatado, só o título, sem o AI.",
  ));
  lista.append(lab);
  lista.append(caixaCheck("As datas do HRI estão como no AI, não no formato local.", check.datasComoNoCodigo, (v) => {
    check.datasComoNoCodigo = v;
    void salvarCheck(leituraId, check);
  }));
  if (check.url8200 === "nao-ha") {
    lista.append(el("p", "ajuda", "Não há AI (8200) nesta leitura. A URL desse AI não deve aparecer no HRI."));
  } else {
    const selUrl = document.createElement("select");
    for (const [valor, nome] of [
      ["nao-aparece", "A URL do (8200) não aparece no HRI"],
      ["aparece", "A URL do (8200) apareceu no HRI"],
    ] as const) {
      const op = document.createElement("option");
      op.value = valor;
      op.textContent = nome;
      if (check.url8200 === valor) op.selected = true;
      selUrl.append(op);
    }
    selUrl.addEventListener("change", () => {
      check.url8200 = selUrl.value as ChecklistHri["url8200"];
      void salvarCheck(leituraId, check);
    });
    const labUrl = el("label", "", "AI (8200)");
    labUrl.append(selUrl);
    lista.append(labUrl);
  }
  lista.append(caixaCheck(
    "Estou ciente: a árvore de decisão só vale quando falta espaço e não há conflito com regulamento. O regulamento prevalece.",
    check.cienteArvore,
    (v) => {
      check.cienteArvore = v;
      void salvarCheck(leituraId, check);
    },
  ));
  box.append(lista);
  return box;
}

function caixaCheck(texto: string, marcado: boolean, aoMudar: (valor: boolean) => void): HTMLLabelElement {
  const lab = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = marcado;
  input.addEventListener("change", () => aoMudar(input.checked));
  lab.append(input, document.createTextNode(texto));
  return lab;
}

function checklistInicial(resultado: Resultado): ChecklistHri {
  return {
    presenteConfere: false,
    textoNaoHri: "ausente",
    datasComoNoCodigo: false,
    url8200: resultado.campos.some((c) => c.ai === "8200") ? "nao-aparece" : "nao-ha",
    cienteArvore: false,
  };
}

async function salvarCheck(id: string, checklist: ChecklistHri): Promise<void> {
  const leitura = estado.historico.find((item) => item.id === id);
  if (!leitura) return;
  leitura.checklist = checklist;
  leitura.trilha = montarTrilha(
    leitura.resultado,
    { rotulo: leitura.conferencia, detalhe: leitura.conferenciaDetalhe },
    checklist,
    leitura.temImagem,
  );
  await gravarLeitura(leitura);
}

function telaPlanilha(): HTMLElement {
  const caixa = el("section", "grade");
  const cartao = el("div", "cartao grade");
  cartao.append(el("h2", "", "Planilha de referência"));
  cartao.append(el(
    "p",
    "ajuda",
    "Colunas: modelo, nível de embalagem e GTIN (ou DI). Outras colunas, como quantidade por embalagem, aparecem ao lado da leitura. O arquivo fica só neste aparelho.",
  ));
  const arq = document.createElement("input");
  arq.type = "file";
  arq.accept = ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  arq.addEventListener("change", () => {
    const file = arq.files?.[0];
    if (file) void importar(file);
  });
  cartao.append(arq);
  const nivel = document.createElement("select");
  nivel.id = "nivel";
  const vazio = document.createElement("option");
  vazio.value = "";
  vazio.textContent = "Não comparar o nível";
  nivel.append(vazio);
  const niveis = [...new Set((estado.referencia ?? []).map((l) => l.nivel).filter(Boolean))];
  for (const nome of niveis) {
    const op = document.createElement("option");
    op.value = nome;
    op.textContent = nome;
    if (nome === estado.nivel) op.selected = true;
    nivel.append(op);
  }
  nivel.addEventListener("change", () => {
    estado.nivel = nivel.value;
    void gravarConfig({ substitutoGs: estado.substituto, nivel: estado.nivel });
  });
  const lab = el("label", "", "Nível esperado nesta conferência");
  lab.append(nivel);
  cartao.append(lab);
  cartao.append(el("a", "", "Baixar planilha de exemplo"));
  const link = cartao.querySelector("a");
  if (link) link.setAttribute("href", `${import.meta.env.BASE_URL}exemplos/referencia-exemplo.xlsx`);
  link?.setAttribute("download", "referencia-exemplo.xlsx");
  cartao.append(botao("Apagar referência deste aparelho", "botao-sec", () => {
    estado.referencia = null;
    void gravarReferencia(null);
    desenhar();
  }));
  caixa.append(cartao);
  const lista = el("div", "lista");
  if (!estado.referencia?.length) {
    lista.append(el("p", "cartao", "Nenhuma planilha carregada."));
  } else {
    lista.append(el("p", "ajuda", `${estado.referencia.length} linha(s) neste aparelho.`));
    for (const linha of estado.referencia.slice(0, 80)) {
      const item = el("article", "cartao");
      item.append(el("strong", "", linha.modelo || "Sem modelo"));
      item.append(el("p", "", `${linha.nivel || "sem nível"} · ${linha.di}`));
      lista.append(item);
    }
  }
  caixa.append(lista);
  return caixa;
}

function lotesAtuais(): LoteConferencia[] {
  return agruparLeituras(estado.historico, estado.modoLote, estado.cortes);
}

function painelLoteAtual(): HTMLElement {
  const box = el("div", "cartao");
  const aberto = loteAberto(lotesAtuais());
  if (!aberto) {
    box.append(el("strong", "", "Nenhum lote aberto"));
    box.append(el("p", "ajuda", "A próxima leitura começa uma lista nova."));
    return box;
  }
  box.append(el("p", "olho", "Lote atual"));
  box.append(el("strong", "", `${aberto.quantidade} leitura${aberto.quantidade === 1 ? "" : "s"}`));
  const texto = aberto.variosProdutos
    ? "Vários produtos neste grupo."
    : `${aberto.modelo || "Sem modelo"} · ${aberto.di || "sem DI"}${aberto.lote ? ` · lote ${aberto.lote}` : ""}`;
  box.append(el("p", "ajuda", texto));
  if (estado.modoLote === "produto") {
    box.append(botao("Fechar lista", "botao-sec", () => void fecharLista()));
  }
  return box;
}

async function fecharLista(): Promise<void> {
  const aberto = loteAberto(lotesAtuais());
  const ultimo = aberto?.ids[aberto.ids.length - 1];
  if (!ultimo) return;
  estado.cortes = [...estado.cortes, ultimo];
  await gravarPrefsLote({ modo: estado.modoLote, cortes: estado.cortes });
  estado.avisoTela = "Lista fechada. A próxima leitura abre um lote novo.";
  desenhar();
}

function mudarModo(modo: ModoAgrupamento): void {
  estado.modoLote = modo;
  estado.loteAbertoId = null;
  void gravarPrefsLote({ modo, cortes: estado.cortes });
  desenhar();
}

function telaHistorico(): HTMLElement {
  const caixa = el("section", "grade");
  caixa.append(el("p", "ajuda", estado.uso || "Calculando o espaço usado…"));
  const modos = el("div", "linha");
  for (const [modo, nome] of [
    ["produto", "Por produto"],
    ["dia", "Por dia"],
    ["hora", "Por hora"],
  ] as const) {
    modos.append(botao(nome, estado.modoLote === modo ? "botao" : "botao-sec", () => mudarModo(modo)));
  }
  caixa.append(modos);
  const acoes = el("div", "linha");
  acoes.append(botao("CSV geral", "botao-sec", () => baixar("leituras-udi.csv", planilhaParaCsv(linhasExportacao()))));
  acoes.append(botao("Excel geral", "botao-sec", () => baixar("leituras-udi.xlsx", planilhaParaXlsx(linhasExportacao()))));
  acoes.append(botao("ZIP com imagens", "botao", () => void exportarZip()));
  acoes.append(botao("Apagar +30 dias", "botao-sec", () => void apagarAntigas()));
  acoes.append(botao("Apagar tudo", "botao-sec perigo", () => void apagarTudo()));
  caixa.append(acoes);
  if (estado.leituraAbertaId) {
    const leitura = estado.historico.find((item) => item.id === estado.leituraAbertaId);
    if (leitura) caixa.append(detalheLeitura(leitura));
  }
  const lotes = lotesAtuais();
  if (lotes.length === 0) caixa.append(el("p", "cartao", "Nenhuma leitura neste aparelho."));
  for (const lote of lotes) {
    caixa.append(estado.loteAbertoId === lote.id ? detalheLote(lote) : cartaoLote(lote));
  }
  return caixa;
}

function cartaoLote(lote: LoteConferencia): HTMLElement {
  const item = el("article", "cartao");
  item.append(el("p", "olho", lote.fechado ? "Lista fechada" : "Lote de conferência"));
  item.append(el("strong", "", lote.variosProdutos ? "Vários produtos" : lote.modelo || "Sem modelo na planilha"));
  item.append(el("p", "mono", `${lote.di || "sem DI"}${lote.lote ? ` · lote ${lote.lote}` : ""}`));
  item.append(el("p", "", `${lote.quantidade} leituras · ${lote.ok} OK · ${lote.divergentes} divergentes`));
  item.append(el("p", "mini", `${lote.inicio} → ${lote.fim}`));
  if (lote.validade) item.append(el("p", "mini", `Validade ${lote.validade}`));
  if (lote.seriaisRepetidos.length) {
    item.append(el("p", "faixa aviso", `Série repetida: ${lote.seriaisRepetidos.map((s) => `${s.serie} (${s.vezes}×)`).join(", ")}`));
  }
  item.append(botao("Abrir lote", "botao", () => {
    estado.loteAbertoId = lote.id;
    void garantirMiniaturas(lote.ids);
    desenhar();
  }));
  return item;
}

function detalheLote(lote: LoteConferencia): HTMLElement {
  const box = el("article", "cartao grade");
  box.append(el("h2", "", "Lote de conferência"));
  box.append(el("p", "", `${lote.modelo || "Sem modelo"} · ${lote.quantidade} leituras`));
  box.append(el("p", "mono", `DI ${lote.di || "—"} · lote ${lote.lote || "—"}`));
  box.append(el("p", "", `Validade: ${lote.validade || "não lida"}`));
  box.append(el("p", "", `De ${lote.inicio} até ${lote.fim}`));
  box.append(el("p", "", `${lote.ok} OK · ${lote.divergentes} divergentes`));
  if (lote.seriaisRepetidos.length) {
    box.append(el("p", "faixa aviso", `Mesma série lida mais de uma vez: ${lote.seriaisRepetidos.map((s) => `${s.serie} (${s.vezes}×)`).join(", ")}`));
  }
  const acoes = el("div", "linha");
  acoes.append(botao("Excel deste lote", "botao", () => {
    const itens = leiturasDoLote(lote);
    baixar(`lote-${lote.inicio.slice(0, 10)}.xlsx`, excelLote(lote, itens));
  }));
  acoes.append(botao("PDF deste lote", "botao", () => void baixarPdfLote(lote)));
  acoes.append(botao("Fechar", "botao-sec", () => {
    estado.loteAbertoId = null;
    desenhar();
  }));
  box.append(acoes);
  for (const leitura of leiturasDoLote(lote)) box.append(linhaHistorico(leitura));
  return box;
}

function leiturasDoLote(lote: LoteConferencia): Leitura[] {
  const mapa = new Map(estado.historico.map((item) => [item.id, item]));
  return lote.ids.map((id) => mapa.get(id)).filter((item): item is Leitura => Boolean(item)).reverse();
}

function linhaHistorico(leitura: Leitura): HTMLElement {
  const item = el("article", "cartao linha-hist");
  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = "Miniatura da leitura";
  const url = miniaturas.get(leitura.id);
  if (url) img.src = url;
  else img.hidden = true;
  item.append(img);
  const texto = el("div");
  texto.append(el("p", "mini", leitura.quando));
  texto.append(el("strong", "", leitura.conferencia));
  texto.append(el("p", "mono", leitura.resultado.di || "sem DI"));
  if (leitura.resultado.vencido) texto.append(el("p", "faixa alerta", "Validade vencida"));
  const botoes = el("div", "linha");
  botoes.append(botao("Ver", "botao-sec", () => {
    estado.leituraAbertaId = leitura.id;
    void abrirFoto(leitura.id);
  }));
  botoes.append(botao("PDF", "botao-sec", () => void baixarPdfLeitura(leitura)));
  botoes.append(botao("Apagar", "botao-sec perigo", () => void removerLeitura(leitura.id)));
  texto.append(botoes);
  item.append(texto);
  return item;
}

function detalheLeitura(leitura: Leitura): HTMLElement {
  const box = el("article", "cartao grade");
  box.append(botao("Voltar à lista", "botao-sec", () => {
    estado.leituraAbertaId = null;
    desenhar();
  }));
  box.append(el("h2", "", `${leitura.resultado.agenciaNome} · ${leitura.quando}`));
  if (fotoAberta?.id === leitura.id) {
    const img = document.createElement("img");
    img.className = "foto";
    img.alt = "Imagem capturada na leitura";
    img.src = fotoAberta.url;
    box.append(img);
  } else if (!leitura.temImagem) {
    box.append(el("p", "ajuda", "Esta leitura não tem imagem. Texto e exemplos não gravam foto."));
  }
  const ol = document.createElement("ol");
  ol.className = "passos";
  for (const passo of leitura.trilha ?? []) {
    const li = document.createElement("li");
    li.append(el("strong", "", passo.titulo));
    const p = document.createElement("p");
    p.textContent = passo.detalhe;
    li.append(p);
    ol.append(li);
  }
  box.append(ol);
  return box;
}

function linhasExportacao(): Record<string, string>[] {
  return estado.historico.map((leitura) => ({
    data_hora: leitura.quando,
    origem: leitura.origem,
    agencia: leitura.resultado.agenciaNome,
    bruto: leitura.resultado.bruto,
    di: leitura.resultado.di ?? "",
    conferencia: leitura.conferencia,
    modelo: leitura.modelo,
    nivel: leitura.nivel,
    vencido: leitura.resultado.vencido ? "sim" : "nao",
    hri: leitura.resultado.hri ?? "",
    checklist: leitura.checklist ? JSON.stringify(leitura.checklist) : "",
    campos: leitura.resultado.campos.map((c) => `(${c.ai})=${c.valor}`).join(" "),
    erros: leitura.resultado.erros.join(" | "),
    avisos: leitura.resultado.avisos.join(" | "),
    extras: Object.entries(leitura.extras).map(([k, v]) => `${k}=${v}`).join(" | "),
    trilha: textoTrilha(leitura.trilha ?? []),
  }));
}

async function exportarZip(): Promise<void> {
  const texto = await planilhaParaCsv(linhasExportacao()).text();
  const arquivos: { nome: string; bytes: Uint8Array }[] = [];
  for (const leitura of estado.historico) {
    if (!leitura.temImagem) continue;
    const foto = await lerFoto(leitura.id);
    if (!foto) continue;
    arquivos.push({ nome: nomeImagem(leitura), bytes: new Uint8Array(await foto.arrayBuffer()) });
  }
  baixar("leituras-udi.zip", zipLeituras(texto, arquivos));
}

async function baixarPdfLote(lote: LoteConferencia): Promise<void> {
  const itens = leiturasDoLote(lote).slice().reverse();
  const fotos = new Map<string, Blob | null>();
  for (const leitura of itens) fotos.set(leitura.id, leitura.temImagem ? await lerMiniatura(leitura.id) : null);
  baixar(`lote-${lote.inicio.slice(0, 13).replace(/[^\d]/g, "")}.pdf`, await pdfLote(lote, itens, fotos));
}

async function baixarPdfLeitura(leitura: Leitura): Promise<void> {
  const foto = leitura.temImagem ? await lerFoto(leitura.id) : null;
  baixar(`leitura-${leitura.id.slice(0, 8)}.pdf`, await pdfLeitura(leitura, foto));
}

async function apagarAntigas(): Promise<void> {
  const limite = dataHoraSaoPaulo(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const velhas = estado.historico.filter((item) => item.quando < limite);
  for (const leitura of velhas) await apagarLeitura(leitura.id);
  estado.historico = estado.historico.filter((item) => item.quando >= limite);
  estado.cortes = estado.cortes.filter((id) => estado.historico.some((item) => item.id === id));
  await gravarPrefsLote({ modo: estado.modoLote, cortes: estado.cortes });
  await atualizarUso();
  desenhar();
}

async function apagarTudo(): Promise<void> {
  estado.historico = [];
  estado.cortes = [];
  estado.loteAbertoId = null;
  estado.leituraAbertaId = null;
  await limparHistorico();
  await gravarPrefsLote({ modo: estado.modoLote, cortes: [] });
  for (const url of miniaturas.values()) URL.revokeObjectURL(url);
  miniaturas.clear();
  await atualizarUso();
  desenhar();
}

async function removerLeitura(id: string): Promise<void> {
  await apagarLeitura(id);
  estado.historico = estado.historico.filter((item) => item.id !== id);
  estado.cortes = estado.cortes.filter((corte) => corte !== id);
  const url = miniaturas.get(id);
  if (url) URL.revokeObjectURL(url);
  miniaturas.delete(id);
  if (estado.leituraAbertaId === id) estado.leituraAbertaId = null;
  await gravarPrefsLote({ modo: estado.modoLote, cortes: estado.cortes });
  await atualizarUso();
  desenhar();
}

async function abrirFoto(id: string): Promise<void> {
  if (fotoAberta) URL.revokeObjectURL(fotoAberta.url);
  fotoAberta = null;
  const blob = await lerFoto(id);
  if (blob) fotoAberta = { id, url: URL.createObjectURL(blob) };
  desenhar();
}

async function garantirMiniaturas(ids: string[]): Promise<void> {
  let mudou = false;
  for (const id of ids) {
    if (miniaturas.has(id)) continue;
    const blob = await lerMiniatura(id);
    if (!blob) continue;
    miniaturas.set(id, URL.createObjectURL(blob));
    mudou = true;
  }
  if (mudou && estado.aba === "historico") desenhar();
}

async function atualizarUso(): Promise<void> {
  const medido = await medirImagens();
  const estimado = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const uso = estimado.usage ?? medido.bytes;
  const cota = estimado.quota ? ` de ${formatarBytes(estimado.quota)}` : "";
  estado.uso = `Imagens neste aparelho: ${formatarBytes(medido.bytes)} (${medido.quantidade}). Espaço do navegador: ${formatarBytes(uso)}${cota}. Nada é enviado.`;
}

function formatarBytes(valor: number): string {
  if (valor < 1024) return `${Math.round(valor)} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / 1024 / 1024).toFixed(1)} MB`;
}

function telaElementos(): HTMLElement {
  const caixa = el("section", "grade");
  const aviso = el(
    "p",
    "faixa aviso",
    "O SIUD da Anvisa (RDC 591/2021) não está neste arquivo. Os campos usados no Brasil precisam ser conferidos no material da própria Anvisa.",
  );
  caixa.append(aviso);
  const busca = document.createElement("input");
  busca.id = "busca-elementos";
  busca.placeholder = "Buscar elemento, número ou sigla";
  busca.value = estado.busca;
  busca.addEventListener("input", () => {
    estado.busca = busca.value;
    desenhar();
  });
  caixa.append(busca);
  const filtros = el("div", "linha");
  for (const [valor, nome] of [["", "Todos"], ["R", "R"], ["C", "C"], ["O", "O"], ["A", "A"]] as const) {
    filtros.append(botao(nome, estado.filtro === valor ? "botao" : "botao-sec", () => {
      estado.filtro = valor;
      desenhar();
    }));
  }
  caixa.append(filtros);
  const q = estado.busca.trim().toLowerCase();
  const itens = elementos.itens.filter((item) => {
    const blob = `${item.imdrfNum} ${item.imdrf} ${item.eudamed} ${item.gudid} ${item.secao}`.toLowerCase();
    if (q && !blob.includes(q)) return false;
    if (!estado.filtro) return true;
    return item.imdrfReq === estado.filtro || item.eudamedReq === estado.filtro || item.gudidReq === estado.filtro;
  });
  let secao = "";
  for (const item of itens) {
    if (item.secao !== secao) {
      secao = item.secao;
      caixa.append(el("h2", "", SECOES[secao] ?? secao));
    }
    const card = el("article", "cartao tri");
    card.append(celula("IMDRF", item.imdrfNum ? `${item.imdrfNum}. ${item.imdrf}` : item.imdrf, item.imdrfReq));
    card.append(celula("EUDAMED", item.eudamed, item.eudamedReq));
    card.append(celula("GUDID", item.gudid, item.gudidReq));
    caixa.append(card);
  }
  if (itens.length === 0) caixa.append(el("p", "cartao", "Nenhum elemento com esse filtro."));
  const fontes = el("div", "cartao");
  fontes.append(el("h2", "", "Fontes"));
  fontes.append(el("p", "ajuda", `${elementos.titulo}. Revisão ${elementos.revisao}.`));
  fontes.append(el("p", "ajuda", elementos.credito));
  const ul = document.createElement("ul");
  for (const fonte of elementos.fontes) {
    const li = document.createElement("li");
    li.append(document.createTextNode(`${fonte.base}: ${fonte.referencia} `));
    if (fonte.url) {
      const a = document.createElement("a");
      a.href = fonte.url;
      a.textContent = fonte.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      li.append(a);
    }
    ul.append(li);
  }
  fontes.append(ul);
  for (const nota of elementos.notas) fontes.append(el("p", "ajuda", nota));
  caixa.append(fontes);
  return caixa;
}

function celula(base: string, nome: string, req: string): HTMLElement {
  const box = el("div");
  box.append(el("p", "mini", base));
  box.append(el("strong", "", nome || "—"));
  const codigo = el("p", `req ${req === "--" ? "" : req}`, req ? `${req} · ${legenda(req)}` : "não informado na planilha");
  box.append(codigo);
  return box;
}

function legenda(req: string): string {
  if (req === "R") return "obrigatório";
  if (req === "C") return "obrigatório sob condição";
  if (req === "O") return "opcional";
  if (req === "A") return "preenchido pela base";
  if (req === "--") return "não existe nessa base";
  return req;
}

function telaSobre(): HTMLElement {
  const caixa = el("section", "grade");
  const cartao = el("article", "cartao");
  cartao.append(el("h2", "", "Instalar no Android"));
  const ol = document.createElement("ol");
  for (const passo of [
    "Abra este endereço no Chrome, com internet, na primeira vez.",
    "No menu do Chrome, toque em Instalar app ou Adicionar à tela inicial.",
    "Abra pelo ícone. Depois da primeira carga, a leitura funciona sem internet.",
    "A câmera exige HTTPS. Um arquivo aberto do computador não serve.",
  ]) {
    const li = document.createElement("li");
    li.textContent = passo;
    ol.append(li);
  }
  cartao.append(ol);
  caixa.append(cartao);
  const limites = el("article", "cartao");
  limites.append(el("h2", "", "Limites"));
  const ul = document.createElement("ul");
  for (const frase of [
    "O leitor confere conteúdo e sintaxe. Não mede grau de impressão (ISO/IEC 15415 nem 15416).",
    "Não é um sistema validado e não é um registro GxP.",
    "Se um dia for usado como registro de qualidade, precisa de validação de sistema computadorizado (GAMP 5).",
    "A planilha, o histórico e a conferência ficam no navegador. Não há servidor nem rastreamento.",
  ]) {
    const li = document.createElement("li");
    li.textContent = frase;
    ul.append(li);
  }
  limites.append(ul);
  caixa.append(limites);
  return caixa;
}

async function publicar(
  bruto: string,
  origem: Leitura["origem"],
  fotos: { foto: Blob; mini: Blob } | null = null,
): Promise<void> {
  const antes = lotesAtuais();
  pararCamera();
  const resultado = lerUdi(bruto, { substitutoGs: estado.substituto });
  const conferencia = conferir(resultado.di, resultado.agencia, estado.nivel, estado.referencia);
  const checklist = resultado.agencia === "GS1" ? checklistInicial(resultado) : null;
  const leitura: Leitura = {
    id: crypto.randomUUID(),
    quando: dataHoraSaoPaulo(),
    origem,
    resultado,
    conferencia: conferencia.rotulo,
    conferenciaDetalhe: conferencia.detalhe,
    modelo: conferencia.modelo,
    nivel: conferencia.nivel,
    extras: conferencia.extras,
    checklist,
    trilha: [],
    temImagem: Boolean(fotos),
  };
  leitura.trilha = montarTrilha(resultado, conferencia, checklist, leitura.temImagem);
  if (fotos) {
    await gravarImagem(leitura.id, fotos.foto, fotos.mini);
    miniaturas.set(leitura.id, URL.createObjectURL(fotos.mini));
  }
  const depois = agruparLeituras([leitura, ...estado.historico], estado.modoLote, estado.cortes);
  const loteDaLeitura = depois.find((lote) => lote.ids.includes(leitura.id));
  estado.historico = [leitura, ...estado.historico];
  estado.atual = { resultado, conferencia, leituraId: leitura.id };
  const novoGrupo = leituraAbreLoteNovo(antes, loteDaLeitura);
  estado.avisoTela = novoGrupo ? (estado.modoLote === "produto" ? "Novo lote/produto iniciado" : "Novo grupo iniciado") : "";
  estado.aba = "ler";
  await gravarLeitura(leitura);
  desenhar();
}

async function lerArquivo(file: File): Promise<void> {
  estado.avisoTela = "Lendo a imagem…";
  desenhar();
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("sem canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const lido = await lerCodigo(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!lido) {
      estado.avisoTela = "Não encontrei DataMatrix, QR nem código de barras nessa imagem.";
      desenhar();
      return;
    }
    const fotos = await fotosDe(canvas, canvas.width, canvas.height, lido.caixa);
    await publicar(lido.texto, "imagem", fotos);
  } catch {
    estado.avisoTela = "A imagem não pôde ser lida neste navegador.";
    desenhar();
  }
}

function pararCamera(): void {
  geracaoCamera += 1;
  fluxo?.getTracks().forEach((trilha) => trilha.stop());
  fluxo = null;
  estado.cameraLigada = false;
}

async function abrirCamera(): Promise<void> {
  const video = document.getElementById("visor");
  const status = document.getElementById("status-camera");
  if (!(video instanceof HTMLVideoElement) || !(status instanceof HTMLElement)) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = "Este navegador não abre a câmera. Use a imagem ou cole o código.";
    return;
  }
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch {
    status.textContent = "A câmera não abriu. Confira a permissão. Imagem e texto continuam disponíveis.";
    return;
  }
  estado.cameraLigada = true;
  video.hidden = false;
  video.srcObject = fluxo;
  await video.play();
  status.textContent = "Aponte para o DataMatrix, o QR ou o GS1-128.";
  const minha = ++geracaoCamera;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const nativo = await criarDetector();
  const loop = async () => {
    if (minha !== geracaoCamera || !fluxo || !ctx) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const largura = Math.min(video.videoWidth, 900);
      const altura = Math.round(video.videoHeight * (largura / video.videoWidth));
      canvas.width = largura;
      canvas.height = altura;
      ctx.drawImage(video, 0, 0, largura, altura);
      try {
        let texto = "";
        let caixaCodigo: Caixa | null = null;
        if (nativo) {
          const marcas = await nativo.detect(canvas);
          const marca = marcas.find((item) => item.rawValue);
          texto = marca?.rawValue ?? "";
          if (marca?.boundingBox) {
            caixaCodigo = {
              x: marca.boundingBox.x,
              y: marca.boundingBox.y,
              largura: marca.boundingBox.width,
              altura: marca.boundingBox.height,
            };
          }
        }
        if (!texto) {
          const imagem = ctx.getImageData(0, 0, largura, altura);
          const lido = await lerCodigo(imagem);
          if (lido) {
            texto = lido.texto;
            caixaCodigo = lido.caixa;
          }
        }
        if (texto && minha === geracaoCamera) {
          const fotos = await fotosDe(canvas, largura, altura, caixaCodigo);
          await publicar(texto, "camera", fotos);
          return;
        }
      } catch {
        status.textContent = "A leitura da câmera falhou neste quadro. Continuando…";
      }
    }
    if (minha === geracaoCamera) window.setTimeout(() => void loop(), 450);
  };
  void loop();
}

type LeitorNativo = {
  detect: (fonte: CanvasImageSource) => Promise<{ rawValue?: string; boundingBox?: DOMRectReadOnly }[]>;
};

async function criarDetector(): Promise<LeitorNativo | null> {
  const Fn = (window as unknown as {
    BarcodeDetector?: {
      new (opcoes: { formats: string[] }): LeitorNativo;
      getSupportedFormats: () => Promise<string[]>;
    };
  }).BarcodeDetector;
  if (!Fn) return null;
  try {
    const formatos = await Fn.getSupportedFormats();
    const quer = ["data_matrix", "qr_code", "code_128"].filter((nome) => formatos.includes(nome));
    if (quer.length === 0) return null;
    return new Fn({ formats: quer });
  } catch {
    return null;
  }
}

async function importar(file: File): Promise<void> {
  try {
    const buf = await file.arrayBuffer();
    const linhas = lerPlanilha(buf, file.name);
    estado.referencia = linhas;
    await gravarReferencia(linhas);
    estado.avisoTela = "";
    desenhar();
  } catch (e) {
    estado.avisoTela = e instanceof Error ? e.message : "Não consegui ler a planilha.";
    estado.aba = "ler";
    desenhar();
  }
}

export async function iniciar(no: HTMLElement): Promise<void> {
  raiz = no;
  const config = await lerConfig();
  const prefs = await lerPrefsLote();
  estado = {
    aba: "ler",
    substituto: config.substitutoGs,
    nivel: config.nivel,
    referencia: await lerReferencia(),
    historico: (await lerHistorico()).map(completarLeitura),
    atual: null,
    avisoTela: "",
    busca: "",
    filtro: "",
    cameraLigada: false,
    modoLote: prefs.modo,
    cortes: prefs.cortes,
    loteAbertoId: null,
    leituraAbertaId: null,
    uso: "",
  };
  desenhar();
  void atualizarUso().then(() => {
    if (estado.aba === "historico" || estado.aba === "ler") desenhar();
  });
}

function completarLeitura(leitura: Leitura): Leitura {
  return {
    ...leitura,
    conferenciaDetalhe: leitura.conferenciaDetalhe ?? "",
    trilha: leitura.trilha ?? [],
    temImagem: leitura.temImagem ?? false,
  };
}
