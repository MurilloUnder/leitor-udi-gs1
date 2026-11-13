/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.txt?raw" {
  const conteudo: string;
  export default conteudo;
}
