export type Agencia = "GS1" | "HIBCC" | "ICCBBA" | "DESCONHECIDA";

export type CampoVisivel = {
  ai: string;
  rotulo: string;
  valor: string;
  detalhe: string;
};

export type Validade = {
  iso: string;
  origem: string;
};

export type Resultado = {
  agencia: Agencia;
  agenciaNome: string;
  bruto: string;
  simbologia: string | null;
  di: string | null;
  diRotulo: string;
  campos: CampoVisivel[];
  erros: string[];
  avisos: string[];
  informes: string[];
  validades: Validade[];
  vencido: string | null;
  hri: string | null;
  hriNotas: string[];
};

export type Dia = { ano: number; mes: number; dia: number };

export type OpcoesLeitura = {
  substitutoGs?: string;
  hoje?: Dia;
  anoCorrente?: number;
};

export type ChecklistHri = {
  presenteConfere: boolean;
  textoNaoHri: "ausente" | "regra-ok" | "regra-falha";
  datasComoNoCodigo: boolean;
  url8200: "nao-ha" | "nao-aparece" | "aparece";
  cienteArvore: boolean;
};

export type Passo = {
  numero: number;
  titulo: string;
  detalhe: string;
  nivel: "ok" | "aviso" | "erro" | "info";
};

export type Leitura = {
  id: string;
  quando: string;
  origem: "camera" | "imagem" | "texto" | "exemplo";
  resultado: Resultado;
  conferencia: string;
  conferenciaDetalhe: string;
  modelo: string;
  nivel: string;
  extras: Record<string, string>;
  checklist: ChecklistHri | null;
  trilha: Passo[];
  temImagem: boolean;
};
