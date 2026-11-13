export type LinhaReferencia = {
  modelo: string;
  nivel: string;
  di: string;
  extras: Record<string, string>;
};

export type StatusConferencia = "ok" | "nao_cadastrado" | "nivel_divergente" | "sem_planilha" | "sem_di";

export type Conferencia = {
  status: StatusConferencia;
  rotulo: string;
  detalhe: string;
  modelo: string;
  nivel: string;
  extras: Record<string, string>;
};

export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarDi(valor: string): string {
  const limpo = valor.trim();
  if (/^\d{8,14}$/.test(limpo)) return limpo.padStart(14, "0");
  return limpo.toUpperCase();
}

export function conferir(
  di: string | null,
  agencia: "GS1" | "HIBCC" | "ICCBBA" | "DESCONHECIDA",
  nivelEsperado: string,
  linhas: LinhaReferencia[] | null,
): Conferencia {
  if (!linhas || linhas.length === 0) {
    return {
      status: "sem_planilha",
      rotulo: "Sem planilha",
      detalhe: "Nenhuma planilha de referência carregada neste aparelho.",
      modelo: "",
      nivel: "",
      extras: {},
    };
  }
  if (!di) {
    return {
      status: "sem_di",
      rotulo: "Sem DI",
      detalhe: "Esta leitura não trouxe um identificador de dispositivo para comparar.",
      modelo: "",
      nivel: "",
      extras: {},
    };
  }
  const chave = normalizarDi(di);
  const iguais = linhas.filter((linha) => normalizarDi(linha.di) === chave);
  const nao = agencia === "GS1" ? "GTIN não cadastrado" : "DI não cadastrado";
  if (iguais.length === 0) {
    return {
      status: "nao_cadastrado",
      rotulo: nao,
      detalhe: `${nao}: ${di}.`,
      modelo: "",
      nivel: "",
      extras: {},
    };
  }
  const nivel = normalizarTexto(nivelEsperado);
  if (!nivel) {
    const niveis = [...new Set(iguais.map((l) => l.nivel).filter(Boolean))];
    return {
      status: "ok",
      rotulo: "OK",
      detalhe: `DI encontrado${niveis.length ? ` nos níveis: ${niveis.join(", ")}` : ""}. Nenhum nível foi escolhido para comparar.`,
      modelo: iguais[0].modelo,
      nivel: iguais[0].nivel,
      extras: iguais[0].extras,
    };
  }
  const noNivel = iguais.filter((linha) => normalizarTexto(linha.nivel) === nivel);
  if (noNivel.length === 0) {
    const niveis = [...new Set(iguais.map((l) => l.nivel).filter(Boolean))];
    return {
      status: "nivel_divergente",
      rotulo: "nível divergente",
      detalhe: `O DI está cadastrado em: ${niveis.join(", ") || "sem nível"}. O nível escolhido foi ${nivelEsperado}.`,
      modelo: iguais[0].modelo,
      nivel: iguais[0].nivel,
      extras: iguais[0].extras,
    };
  }
  return {
    status: "ok",
    rotulo: "OK",
    detalhe: `${noNivel[0].modelo} · ${noNivel[0].nivel}`,
    modelo: noNivel[0].modelo,
    nivel: noNivel[0].nivel,
    extras: noNivel[0].extras,
  };
}
