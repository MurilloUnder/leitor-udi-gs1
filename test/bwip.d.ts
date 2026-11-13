declare module "bwip-js" {
  const bwipjs: {
    toBuffer(opcoes: Record<string, unknown>): Promise<Buffer>;
  };
  export default bwipjs;
}
