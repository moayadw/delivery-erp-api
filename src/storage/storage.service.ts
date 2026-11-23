import { Readable } from 'stream';

// Abstraction so the app doesn't care where files live.
// Today: local disk. Later: S3/MinIO by writing another class that implements this.
export abstract class StorageService {
  abstract save(folder: string, file: { buffer: Buffer; ext: string }): Promise<string>; // returns key
  abstract open(key: string): Promise<Readable>;
  abstract delete(key: string): Promise<void>;
}
