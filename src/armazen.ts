import type { LinhaReferencia } from "./conferencia";
import type { ModoAgrupamento } from "./lotes";
import type { Leitura } from "./udi/tipos";

const NOME = "leitor-udi";
const VERSAO = 2;

type PacoteImagem = { foto: Blob; mini: Blob };

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(NOME, VERSAO);
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      if (!banco.objectStoreNames.contains("kv")) banco.createObjectStore("kv");
      if (!banco.objectStoreNames.contains("leituras")) banco.createObjectStore("leituras", { keyPath: "id" });
      if (!banco.objectStoreNames.contains("imagens")) banco.createObjectStore("imagens");
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

async function comLoja<T>(nome: string, modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const banco = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = banco.transaction(nome, modo);
      const pedido = fn(tx.objectStore(nome));
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
    });
  } finally {
    banco.close();
  }
}

export async function lerConfig(): Promise<{ substitutoGs: string; nivel: string }> {
  const bruto = await comLoja<unknown>("kv", "readonly", (loja) => loja.get("config"));
  const config = bruto as { substitutoGs?: string; nivel?: string } | undefined;
  return { substitutoGs: config?.substitutoGs ?? "|", nivel: config?.nivel ?? "" };
}

export async function gravarConfig(config: { substitutoGs: string; nivel: string }): Promise<void> {
  await comLoja("kv", "readwrite", (loja) => loja.put(config, "config"));
}

export async function lerReferencia(): Promise<LinhaReferencia[] | null> {
  const bruto = await comLoja<unknown>("kv", "readonly", (loja) => loja.get("referencia"));
  return (bruto as LinhaReferencia[] | undefined) ?? null;
}

export async function gravarReferencia(linhas: LinhaReferencia[] | null): Promise<void> {
  await comLoja("kv", "readwrite", (loja) => loja.put(linhas, "referencia"));
}

export async function lerHistorico(): Promise<Leitura[]> {
  const lista = await comLoja<Leitura[]>("leituras", "readonly", (loja) => loja.getAll());
  return lista.sort((a, b) => (a.quando < b.quando ? 1 : -1));
}

export async function gravarLeitura(leitura: Leitura): Promise<void> {
  await comLoja("leituras", "readwrite", (loja) => loja.put(leitura));
}

export async function gravarImagem(id: string, foto: Blob, mini: Blob): Promise<void> {
  await comLoja("imagens", "readwrite", (loja) => loja.put({ foto, mini } satisfies PacoteImagem, id));
}

export async function lerFoto(id: string): Promise<Blob | null> {
  const pacote = await comLoja<PacoteImagem | undefined>("imagens", "readonly", (loja) => loja.get(id));
  return pacote?.foto ?? null;
}

export async function lerMiniatura(id: string): Promise<Blob | null> {
  const pacote = await comLoja<PacoteImagem | undefined>("imagens", "readonly", (loja) => loja.get(id));
  return pacote?.mini ?? null;
}

export async function listarImagens(): Promise<{ id: string; foto: Blob }[]> {
  const banco = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = banco.transaction("imagens", "readonly");
      const pedido = tx.objectStore("imagens").openCursor();
      const saida: { id: string; foto: Blob }[] = [];
      pedido.onsuccess = () => {
        const cursor = pedido.result;
        if (!cursor) {
          resolve(saida);
          return;
        }
        const valor = cursor.value as PacoteImagem;
        saida.push({ id: String(cursor.key), foto: valor.foto });
        cursor.continue();
      };
      pedido.onerror = () => reject(pedido.error);
    });
  } finally {
    banco.close();
  }
}

export async function medirImagens(): Promise<{ bytes: number; quantidade: number }> {
  const imagens = await listarImagens();
  const bytes = imagens.reduce((total, item) => total + item.foto.size, 0);
  return { bytes, quantidade: imagens.length };
}

export async function apagarLeitura(id: string): Promise<void> {
  const banco = await abrir();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = banco.transaction(["leituras", "imagens"], "readwrite");
      tx.objectStore("leituras").delete(id);
      tx.objectStore("imagens").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    banco.close();
  }
}

export async function lerPrefsLote(): Promise<{ modo: ModoAgrupamento; cortes: string[] }> {
  const bruto = await comLoja<unknown>("kv", "readonly", (loja) => loja.get("lotes"));
  const prefs = bruto as { modo?: ModoAgrupamento; cortes?: string[] } | undefined;
  const modo = prefs?.modo === "dia" || prefs?.modo === "hora" ? prefs.modo : "produto";
  return { modo, cortes: prefs?.cortes ?? [] };
}

export async function gravarPrefsLote(prefs: { modo: ModoAgrupamento; cortes: string[] }): Promise<void> {
  await comLoja("kv", "readwrite", (loja) => loja.put(prefs, "lotes"));
}

export async function limparHistorico(): Promise<void> {
  const banco = await abrir();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = banco.transaction(["leituras", "imagens"], "readwrite");
      tx.objectStore("leituras").clear();
      tx.objectStore("imagens").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    banco.close();
  }
}
