import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider } from './StorageProvider.js';

export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async upload(filename: string, data: Buffer, _mimeType: string): Promise<string> {
    const fullPath = path.join(this.basePath, path.dirname(filename));
    await fs.mkdir(fullPath, { recursive: true });
    const filePath = path.join(this.basePath, filename);
    await fs.writeFile(filePath, data);
    return filename;
  }

  async download(storagePath: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, storagePath);
    return fs.readFile(filePath);
  }

  getUrl(storagePath: string): string {
    return `/storage/${storagePath}`;
  }

  getLocalPath(storagePath: string): string {
    return path.join(this.basePath, storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    const filePath = path.join(this.basePath, storagePath);
    await fs.unlink(filePath);
  }

  async list(prefix = ''): Promise<string[]> {
    await fs.mkdir(this.basePath, { recursive: true });
    const entries = await fs.readdir(this.basePath);
    return entries.filter((e) => e.startsWith(prefix));
  }
}
