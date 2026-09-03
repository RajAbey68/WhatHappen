declare module 'crypto-js' {
  export const SHA256: (message: any, cfg?: any) => { toString: (encoder?: any) => string };
  export const HmacSHA256: (message: any, key: any) => { toString: (encoder?: any) => string };
  export const enc: {
    Hex: any;
    Utf8: any;
    Base64: any;
    Latin1: any;
  };
  const CryptoJS: {
    SHA256: typeof SHA256;
    HmacSHA256: typeof HmacSHA256;
    enc: typeof enc;
    [key: string]: any;
  };
  export default CryptoJS;
}
