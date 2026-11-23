import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnsureDeliveryInput, ErpClient, PushReceiptInput } from './erp-client';

// Real Odoo, over its JSON-RPC API (POST /jsonrpc). Needs Odoo 17 with the "Project" app installed.
//
// How our data maps to Odoo:
//   Project   -> project.project
//   Delivery  -> project.task   (inside that project)
//   Receipt   -> ir.attachment  (the scanned file, attached to the task)
//
// Idempotency uses Odoo's own "external ID" table (ir.model.data): every record we create is
// registered under module "delivery_erp" with OUR id as its name. Before creating anything we look
// that name up, so sending the same thing twice (a retry) never creates a duplicate in Odoo.
const XML_MODULE = 'delivery_erp';

@Injectable()
export class OdooErpClient extends ErpClient {
  private readonly url: string;
  private readonly db: string;
  private readonly login: string;
  private readonly password: string;
  private uid: number | null = null;

  constructor(cfg: ConfigService) {
    super();
    this.url = cfg.get<string>('ODOO_URL', 'http://localhost:8069').replace(/\/$/, '');
    this.db = cfg.get<string>('ODOO_DB', 'odoo');
    this.login = cfg.get<string>('ODOO_LOGIN', 'admin');
    this.password = cfg.get<string>('ODOO_PASSWORD', 'admin');
  }

  // ---------- low level: one JSON-RPC call ----------
  private async rpc<T>(service: 'common' | 'object', method: string, args: unknown[]): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new Error(`Odoo unreachable: ${(e as Error).message}`);
    }
    if (!res.ok) throw new Error(`Odoo responded HTTP ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message?: string; data?: { message?: string } } };
    if (json.error) throw new Error(`Odoo error: ${json.error.data?.message ?? json.error.message ?? 'unknown'}`);
    return json.result as T;
  }

  private async authenticate(): Promise<number> {
    if (this.uid) return this.uid;
    const uid = await this.rpc<number | false>('common', 'authenticate', [this.db, this.login, this.password, {}]);
    if (!uid) throw new Error('Odoo login failed: check ODOO_DB, ODOO_LOGIN and ODOO_PASSWORD');
    this.uid = uid;
    return uid;
  }

  private async call<T>(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
    const uid = await this.authenticate();
    return this.rpc<T>('object', 'execute_kw', [this.db, uid, this.password, model, method, args, kwargs]);
  }

  // ---------- find-or-create by our own id ----------
  private async ensure(model: string, externalId: string, values: Record<string, unknown>): Promise<number> {
    const rows = await this.call<{ id: number; res_id: number }[]>('ir.model.data', 'search_read', [
      [['module', '=', XML_MODULE], ['name', '=', externalId], ['model', '=', model]],
    ], { fields: ['id', 'res_id'], limit: 1 });

    if (rows.length) {
      const stillThere = await this.call<number[]>(model, 'search', [[['id', '=', rows[0].res_id]]], { limit: 1 });
      if (stillThere.length) return rows[0].res_id; // already sent before: reuse it
    }

    const id = await this.call<number>(model, 'create', [values]);
    try {
      if (rows.length) {
        // The record was deleted inside Odoo: point our existing external ID at the new one.
        await this.call('ir.model.data', 'write', [[rows[0].id], { res_id: id }]);
      } else {
        await this.call('ir.model.data', 'create', [{ module: XML_MODULE, name: externalId, model, res_id: id }]);
      }
    } catch (e) {
      // Don't leave an unregistered record behind: the retry would create a second one.
      await this.call(model, 'unlink', [[id]]).catch(() => undefined);
      throw e;
    }
    return id;
  }

  // ---------- ErpClient ----------
  async ensureDelivery(input: EnsureDeliveryInput): Promise<string> {
    const projectId = await this.ensure('project.project', input.projectExternalId, { name: input.projectName });
    const taskId = await this.ensure('project.task', input.externalId, {
      name: input.title,
      project_id: projectId,
      date_deadline: `${input.deliveryDate} 00:00:00`,
    });
    return String(taskId);
  }

  async pushReceipt(input: PushReceiptInput): Promise<{ erpDocumentNumber: string }> {
    if (!input.file) throw new Error('Receipt has no file to attach');
    const label = [input.type, input.amount, input.fileName].filter(Boolean).join(' - ');
    const attachmentId = await this.ensure('ir.attachment', input.externalId, {
      name: label,
      res_model: 'project.task',
      res_id: Number(input.deliveryReference),
      datas: input.file.content.toString('base64'),
      mimetype: input.file.mimeType,
      description: `Type: ${input.type}\nAmount: ${input.amount ?? 'n/a'}\nSource receipt id: ${input.externalId}`,
    });
    return { erpDocumentNumber: `ATT-${attachmentId}` };
  }
}
