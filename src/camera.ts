export type CameraLista = { deviceId: string; label: string };

const ULTRA = /ultra[\s-]*wide|ultrawide|ultra angular|macro|depth|telephoto|teleobjetiva|\btele\b|bokeh|fisheye|olho de peixe/i;
const FRENTE = /front|user|frontal|face|selfie/i;
const TRAS = /back|rear|traseir|environment/i;

export function pontuarCamera(label: string): number {
  const nome = label.trim();
  if (!nome) return 0;
  let pontos = 0;
  if (TRAS.test(nome)) pontos += 40;
  if (FRENTE.test(nome)) pontos -= 50;
  if (ULTRA.test(nome)) pontos -= 100;
  if (/\b(main|principal|normal|standard|padrão|padrao)\b/i.test(nome)) pontos += 30;
  if (/camera2?\s*0\b/i.test(nome) && TRAS.test(nome)) pontos += 15;
  return pontos;
}

/** Prefere a lente traseira principal e deixa de lado ultra-wide, macro e tele. */
export function escolherCameraPrincipal(cameras: CameraLista[], atualId = ""): string {
  const comId = cameras.filter((camera) => camera.deviceId);
  if (comId.length === 0) return atualId;
  const rotuladas = comId.filter((camera) => camera.label.trim());
  if (rotuladas.length === 0) return atualId || comId[0].deviceId;
  const ordenadas = [...rotuladas].sort(
    (a, b) => pontuarCamera(b.label) - pontuarCamera(a.label) || a.label.localeCompare(b.label),
  );
  const melhor = ordenadas[0];
  if (pontuarCamera(melhor.label) < 0 && atualId) return atualId;
  return melhor.deviceId;
}

type RestricaoExtra = MediaTrackConstraintSet & {
  focusMode?: string;
  exposureMode?: string;
};

/** 4K ideal, depois 1080p, sempre na traseira ou na lente escolhida. */
export function restricoesCamera(deviceId?: string): MediaTrackConstraints[] {
  const alvo: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: "environment" } };
  const foco: RestricaoExtra[] = [{ focusMode: "continuous" }, { exposureMode: "continuous" }];
  return [
    { ...alvo, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 }, advanced: foco },
    { ...alvo, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
    { ...alvo, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    { ...alvo },
  ];
}

export type AjusteCamera = {
  largura: number;
  altura: number;
  tocha: boolean;
  zoomMin: number | null;
  zoomMax: number | null;
  zoomPasso: number | null;
  zoom: number | null;
};

type Capacidades = MediaTrackCapabilities & {
  focusMode?: string[];
  exposureMode?: string[];
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
};

type AjusteExtra = MediaTrackConstraintSet & {
  focusMode?: string;
  exposureMode?: string;
  torch?: boolean;
  zoom?: number;
};

export async function ajustarTrilha(track: MediaStreamTrack): Promise<AjusteCamera> {
  const caps = (track.getCapabilities?.() ?? {}) as Capacidades;
  const pedidos: AjusteExtra[] = [];
  if (caps.focusMode?.includes("continuous")) pedidos.push({ focusMode: "continuous" });
  if (caps.exposureMode?.includes("continuous")) pedidos.push({ exposureMode: "continuous" });
  let zoom: number | null = null;
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    zoom = caps.zoom.min < 1 && caps.zoom.max >= 1 ? 1 : caps.zoom.min;
    pedidos.push({ zoom });
  }
  for (const pedido of pedidos) {
    try {
      await track.applyConstraints({ advanced: [pedido] });
    } catch {
      if (pedido.zoom != null) zoom = null;
    }
  }
  const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
  return {
    largura: settings.width ?? 0,
    altura: settings.height ?? 0,
    tocha: Boolean(caps.torch),
    zoomMin: caps.zoom && caps.zoom.max > caps.zoom.min ? caps.zoom.min : null,
    zoomMax: caps.zoom && caps.zoom.max > caps.zoom.min ? caps.zoom.max : null,
    zoomPasso: caps.zoom?.step ?? null,
    zoom: settings.zoom ?? zoom,
  };
}
