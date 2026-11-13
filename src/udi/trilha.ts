import type { ChecklistHri, Passo, Resultado } from "./tipos";

function passo(lista: Passo[], titulo: string, detalhe: string, nivel: Passo["nivel"]): void {
  lista.push({ numero: lista.length + 1, titulo, detalhe, nivel });
}

function validacaoCampo(resultado: Resultado, ai: string, rotulo: string): { texto: string; nivel: Passo["nivel"] } {
  const erros = resultado.erros.filter((msg) => msg.includes(`(${ai})`) || msg.includes(rotulo));
  const avisos = resultado.avisos.filter((msg) => msg.includes(`(${ai})`) || msg.includes(rotulo));
  if (erros.length) return { texto: erros.join(" "), nivel: "erro" };
  if (avisos.length) return { texto: avisos.join(" "), nivel: "aviso" };
  return { texto: "Validação do campo sem erro.", nivel: "ok" };
}

export function montarTrilha(
  resultado: Resultado,
  conferencia: { rotulo: string; detalhe: string },
  checklist: ChecklistHri | null,
  temImagem: boolean,
): Passo[] {
  const lista: Passo[] = [];
  passo(
    lista,
    "Prefixo de simbologia",
    resultado.simbologia
      ? `Detectado ${resultado.simbologia}. Os prefixos tratados como GS1 são ]d2, ]C1, ]Q3 e ]e0.`
      : "Nenhum prefixo AIM no início. Os prefixos GS1 procurados são ]d2, ]C1, ]Q3 e ]e0.",
    "info",
  );
  const motivo =
    resultado.agencia === "HIBCC"
      ? "O dado começa com + ou com um delimitador $ da tabela HIBCC."
      : resultado.agencia === "ICCBBA"
        ? "O dado começa com = ou &."
        : resultado.agencia === "GS1"
          ? "O dado segue AI GS1, parênteses, Digital Link ou um prefixo GS1."
          : "Nenhum desses sinais foi encontrado.";
  passo(lista, "Agência", `${resultado.agenciaNome}. ${motivo}`, resultado.agencia === "DESCONHECIDA" ? "erro" : "ok");

  if (resultado.campos.length === 0) {
    passo(lista, "Campos", "Nenhum campo foi separado.", "erro");
  }
  for (const campo of resultado.campos) {
    const validacao = validacaoCampo(resultado, campo.ai, campo.rotulo);
    const linhas = [
      `Delimitador/AI: ${campo.ai}`,
      `Valor: ${campo.valor}`,
      campo.detalhe,
      validacao.texto,
    ].filter(Boolean);
    passo(lista, `Campo ${campo.rotulo}`, linhas.join("\n"), validacao.nivel);
  }

  const nivelPlanilha =
    conferencia.rotulo === "OK" ? "ok" : conferencia.rotulo === "Sem planilha" || conferencia.rotulo === "Sem DI" ? "info" : "aviso";
  passo(lista, "Conferência da planilha", `${conferencia.rotulo}. ${conferencia.detalhe}`, nivelPlanilha);

  if (resultado.agencia !== "GS1") {
    passo(lista, "Conferência do HRI", "A regra de HRI usada aqui é da GS1 e não se aplica a esta agência.", "info");
  } else if (!checklist) {
    passo(lista, "Conferência do HRI", resultado.hri || "Sem HRI.", "info");
  } else {
    const marcas = [
      `HRI esperado: ${resultado.hri || "(vazio)"}`,
      checklist.presenteConfere ? "HRI presente e conferido." : "HRI ainda não marcado como conferido.",
      checklist.textoNaoHri === "ausente"
        ? "Sem texto não-HRI informado."
        : checklist.textoNaoHri === "regra-ok"
          ? "Texto não-HRI marcado como dentro da regra."
          : "Texto não-HRI marcado fora da regra.",
      checklist.datasComoNoCodigo ? "Datas do HRI marcadas como no AI." : "Datas do HRI ainda não conferidas.",
      checklist.url8200 === "nao-ha"
        ? "Não há AI (8200)."
        : checklist.url8200 === "nao-aparece"
          ? "URL do (8200) marcada como ausente do HRI."
          : "URL do (8200) marcada como impressa no HRI.",
      checklist.cienteArvore
        ? "Ciência registrada: a árvore de decisão só vale com pouco espaço e sem conflito com regulamento."
        : "A ciência sobre a árvore de decisão ainda não foi marcada.",
    ];
    passo(lista, "Conferência do HRI", marcas.join("\n"), checklist.presenteConfere ? "ok" : "info");
  }

  const finais = [
    conferencia.rotulo,
    resultado.vencido ?? "Validade não vencida, ou sem data de validade.",
    resultado.erros.length ? `${resultado.erros.length} erro(s) de sintaxe.` : "Sem erro de sintaxe.",
    temImagem ? "A imagem do quadro foi gravada neste aparelho." : "Sem imagem: leitura digitada ou exemplo.",
  ];
  const nivelFinal = resultado.erros.length || resultado.vencido ? "erro" : conferencia.rotulo === "OK" || conferencia.rotulo === "Sem planilha" ? "ok" : "aviso";
  passo(lista, "Resultado", finais.join("\n"), nivelFinal);
  return lista;
}

export function textoTrilha(passos: Passo[]): string {
  return passos.map((item) => `${item.numero}. ${item.titulo}\n${item.detalhe}`).join("\n\n");
}
