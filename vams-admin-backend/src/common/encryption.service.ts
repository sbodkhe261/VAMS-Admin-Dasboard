import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly secretKey: Buffer;

  constructor() {
    const keyString = process.env.AES_SECRET_KEY || 'vams-system-secure-aes-256-gcm-master-key-32b!';
    this.secretKey = crypto.scryptSync(keyString, 'vams-salt', 32);
  }

  encrypt(text: string): { iv: string; content: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return {
      iv: iv.toString('hex'),
      content: encrypted,
      tag: tag,
    };
  }

  decrypt(encryptedData: { iv: string; content: string; tag: string }): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.secretKey,
      Buffer.from(encryptedData.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
