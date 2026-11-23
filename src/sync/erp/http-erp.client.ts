import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnsureDeliveryInput, ErpClient, PushReceiptInput } from './erp-client';

// Talks to the small fake ERP in /mock-erp. Used when ERP_DRIVER=mock (the default).
@Injectable()
export class HttpErpClient extends ErpClient {
  private readonly baseUrl: string;

  constructor(cfg: ConfigService) {
    super();
    this.baseUrl = cfg.get<string>('ERP_BASE_URL', 'http://localhost:4000');
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new Error(`ERP unreachable: ${(e as Error).message}`);
    }
    if (!res.ok) throw new Error(`ERP responded ${res.status}`);
    return (await res.json()) as T;
  }

  async ensureDelivery(input: EnsureDeliveryInput) {
    const r = await this.post<{ reference: string }>('/deliveries', input);
    return r.reference;
  }

  async pushReceipt(input: PushReceiptInput) {
    const { file, ...rest } = input; // the fake ERP only needs the details, not the file bytes
    const r = await this.post<{ documentNumber: string }>('/receipts', rest);
    return { erpDocumentNumber: r.documentNumber };
  }
}
