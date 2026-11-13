import { describe, expect, it } from "vitest";
import { escolherCameraPrincipal, pontuarCamera, restricoesCamera } from "../src/camera";

describe("escolha da câmera", () => {
  it("prefere a traseira principal e evita ultra-wide e macro", () => {
    const cameras = [
      { deviceId: "frente", label: "Front Camera" },
      { deviceId: "ultra", label: "Ultra Wide, facing back" },
      { deviceId: "macro", label: "Macro Camera, facing back" },
      { deviceId: "tele", label: "Telephoto, facing back" },
      { deviceId: "principal", label: "camera2 0, facing back" },
    ];
    expect(escolherCameraPrincipal(cameras)).toBe("principal");
    expect(pontuarCamera("Ultra Wide, facing back")).toBeLessThan(pontuarCamera("camera2 0, facing back"));
  });

  it("pede 4K na lente traseira e também na lente escolhida", () => {
    const aberta = restricoesCamera();
    expect(aberta[0].facingMode).toEqual({ ideal: "environment" });
    expect(aberta[0].width).toEqual({ ideal: 3840 });
    expect(aberta[0].height).toEqual({ ideal: 2160 });
    expect(aberta.some((item) => typeof item.width === "object" && item.width?.ideal === 1920)).toBe(true);
    const escolhida = restricoesCamera("principal");
    expect(escolhida[0].deviceId).toEqual({ exact: "principal" });
    expect(escolhida[0].width).toEqual({ ideal: 3840 });
    expect(escolhida.at(-1)).toEqual({ deviceId: { exact: "principal" } });
  });
});
