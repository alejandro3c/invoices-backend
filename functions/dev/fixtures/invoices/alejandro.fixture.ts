import { buildInvoice, applyInvoices, checkInvoices } from "../builders/invoices.ts";
import { CLIENTS } from "../clients/alejandro.fixture.ts";
import type { Fixture } from "../types.ts";
import { ALEJANDRO } from "../users/alejandro.fixture.ts";

const { acme, globex, lucia, umbrella } = CLIENTS;
const TRANSFER_30 = "Transferencia bancaria a 30 días";

const invoices = [
  // 2025: closed year
  buildInvoice({
    id: "2025-0001",
    user: ALEJANDRO,
    client: acme,
    status: "paid",
    sequenceNumber: 1,
    issueDate: "2025-02-03",
    dueDate: "2025-03-05",
    withholdingRate: 15,
    lines: [{ description: "Desarrollo web — sprint 1", unitPrice: 45, quantity: 40 }],
    paymentTerms: TRANSFER_30,
  }),
  buildInvoice({
    id: "2025-0002",
    user: ALEJANDRO,
    client: globex,
    status: "paid",
    sequenceNumber: 2,
    issueDate: "2025-05-12",
    dueDate: "2025-06-11",
    withholdingRate: 15,
    lines: [
      { description: "Consultoría UX", unitPrice: 1200, discountRate: 10 },
      { description: "Prototipo navegable", unitPrice: 800 },
    ],
    paymentTerms: TRANSFER_30,
  }),
  buildInvoice({
    id: "2025-0003",
    user: ALEJANDRO,
    client: acme,
    status: "cancelled",
    sequenceNumber: 3,
    issueDate: "2025-09-01",
    dueDate: "2025-10-01",
    withholdingRate: 15,
    lines: [{ description: "Mantenimiento web — septiembre", unitPrice: 150 }],
    publicNotes: "Anulada: el cliente canceló el servicio.",
  }),
  buildInvoice({
    id: "2025-0004",
    user: ALEJANDRO,
    client: umbrella,
    status: "paid",
    sequenceNumber: 4,
    issueDate: "2025-11-20",
    dueDate: "2025-12-20",
    withholdingRate: 15,
    lines: [{ description: "Integración con la API de transportistas", unitPrice: 50, quantity: 24 }],
    paymentTerms: "Domiciliación bancaria",
  }),

  // 2026: current year
  buildInvoice({
    id: "2026-0001",
    user: ALEJANDRO,
    client: acme,
    status: "paid",
    sequenceNumber: 1,
    issueDate: "2026-01-15",
    dueDate: "2026-02-14",
    withholdingRate: 15,
    lines: [{ description: "Desarrollo web — sprint 5", unitPrice: 45, quantity: 32 }],
    paymentTerms: TRANSFER_30,
  }),
  buildInvoice({
    id: "2026-0002",
    user: ALEJANDRO,
    client: globex,
    status: "issued",
    sequenceNumber: 2,
    issueDate: "2026-03-01",
    dueDate: "2026-03-31",
    withholdingRate: 15,
    lines: [{ description: "Auditoría de accesibilidad", unitPrice: 1750 }],
    paymentTerms: TRANSFER_30,
    publicNotes: "Vencida: sirve para probar facturas pendientes de cobro.",
  }),
  buildInvoice({
    id: "2026-0003",
    user: ALEJANDRO,
    client: lucia,
    status: "issued",
    sequenceNumber: 3,
    issueDate: "2026-06-10",
    dueDate: "2026-06-10",
    // A private individual: no IRPF withholding
    lines: [{ description: "Diseño de logotipo", unitPrice: 350 }],
    paymentTerms: "Transferencia bancaria al contado",
  }),
  buildInvoice({
    id: "2026-0004",
    user: ALEJANDRO,
    client: acme,
    status: "issued",
    sequenceNumber: 4,
    issueDate: "2026-10-01",
    dueDate: "2026-12-15",
    withholdingRate: 15,
    lines: [
      { description: "Desarrollo web — sprint 9", unitPrice: 45, quantity: 36.5 },
      { description: "Horas extra fin de semana", unitPrice: 60, quantity: 6, discountRate: 20 },
      { description: "Licencia de plugin (12 meses)", unitPrice: 79.99 },
    ],
    paymentTerms: TRANSFER_30,
  }),

  // Drafts: issuing one from the app must take number 2026-0005
  buildInvoice({
    id: "draft-1",
    user: ALEJANDRO,
    client: acme,
    status: "draft",
    issueDate: "2026-10-15",
    dueDate: "2026-11-14",
    withholdingRate: 15,
    lines: [{ description: "Desarrollo web — sprint 10", unitPrice: 45, quantity: 30 }],
    paymentTerms: TRANSFER_30,
  }),
  buildInvoice({
    id: "draft-2",
    user: ALEJANDRO,
    client: globex,
    status: "draft",
    issueDate: "2026-10-20",
    dueDate: null,
    incomeType: "goods_sale",
    lines: [
      { description: "Monitor 27\" 4K", unitPrice: 389, quantity: 2 },
      { description: "Soporte de monitor", unitPrice: 45.5, quantity: 2, discountRate: 5 },
    ],
  }),
];

export const invoicesFixture: Fixture = {
  id: "invoices:alejandro",
  description:
    "Alejandro's invoices in 2025 and 2026: paid, issued (one overdue), cancelled and drafts, with IRPF, discounts, a goods sale and real PDFs",
  version: 1,
  dependsOn: ["clients:alejandro"],

  async up(context) {
    await applyInvoices(context, invoices);
  },

  async check(context) {
    await checkInvoices(context, ALEJANDRO, invoices);
  },
};
