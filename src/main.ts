import { registerSW } from "virtual:pwa-register";
import { iniciar } from "./ui";
import "./style.css";

registerSW({ immediate: true });

const raiz = document.querySelector("#app");
if (raiz instanceof HTMLElement) iniciar(raiz);
