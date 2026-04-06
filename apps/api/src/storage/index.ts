import { LocalStorageProvider } from './LocalStorageProvider.js';
import type { StorageProvider } from './StorageProvider.js';

let instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!instance) {
    const storagePath = process.env.BANDEJA_STORAGE_PATH ?? 'C:/Users/Tomer/Desktop/Bandeja video';
    instance = new LocalStorageProvider(storagePath);
  }
  return instance;
}

export type { StorageProvider };
