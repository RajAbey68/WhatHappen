declare module 'adm-zip' {
  interface AdmZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer | null;
    getEntryName(): string;
  }

  interface IAdmZip {
    getEntries(): AdmZipEntry[];
    readAsText(entry: string): string;
    readFile(entry: string): Buffer;
    extractAllTo(target: string, overwrite?: boolean): void;
    extractEntryTo(entry: string, target: string, maintainPath?: boolean, overwrite?: boolean): void;
    addFile(name: string, content: string | Buffer): void;
    toBuffer(): Buffer;
    test(): void;
    deleteFile(name: string): void;
  }

  class AdmZip implements IAdmZip {
    constructor(path?: string | Buffer);
    getEntries(): AdmZipEntry[];
    readAsText(entry: string): string;
    readFile(entry: string): Buffer;
    extractAllTo(target: string, overwrite?: boolean): void;
    extractEntryTo(entry: string, target: string, maintainPath?: boolean, overwrite?: boolean): void;
    addFile(name: string, content: string | Buffer): void;
    toBuffer(): Buffer;
    test(): void;
    deleteFile(name: string): void;
  }

  export default AdmZip;
}
