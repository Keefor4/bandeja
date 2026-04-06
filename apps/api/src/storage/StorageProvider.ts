export interface StorageProvider {
  upload(filename: string, data: Buffer, mimeType: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  getUrl(path: string): string;
  delete(path: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
