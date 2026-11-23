export interface EnsureDeliveryInput {
  externalId: string; // our delivery id, so the ERP can recognise repeats
  title: string;
  deliveryDate: string; // YYYY-MM-DD
  projectExternalId: string; // our project id
  projectName: string;
}

export interface PushReceiptInput {
  externalId: string; // our receipt id
  deliveryReference: string; // the ERP's reference for the delivery
  type: string;
  amount: string | null;
  fileName: string | null;
  file: { mimeType: string; content: Buffer } | null; // the actual scanned receipt
}

// The sync logic only talks to this interface.
// Two implementations: HttpErpClient (the fake ERP) and OdooErpClient (real Odoo).
export abstract class ErpClient {
  abstract ensureDelivery(input: EnsureDeliveryInput): Promise<string>; // returns ERP reference
  abstract pushReceipt(input: PushReceiptInput): Promise<{ erpDocumentNumber: string }>;
}
