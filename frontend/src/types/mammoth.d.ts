declare module 'mammoth/mammoth.browser' {
  interface MammothMessage {
    type: 'warning' | 'error';
    message: string;
  }
  interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }
  interface MammothArrayBufferInput {
    arrayBuffer: ArrayBuffer;
  }
  interface Mammoth {
    convertToHtml: (input: MammothArrayBufferInput) => Promise<MammothResult>;
    extractRawText: (input: MammothArrayBufferInput) => Promise<MammothResult>;
  }
  const mammoth: Mammoth;
  export default mammoth;
}
