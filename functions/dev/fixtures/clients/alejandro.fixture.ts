import { applyClients, checkClients, type FixtureClient } from "../builders/clients.ts";
import type { Fixture } from "../types.ts";
import { ALEJANDRO } from "../users/alejandro.fixture.ts";

export const CLIENTS = {
  acme: {
    id: "acme",
    userId: ALEJANDRO.uid,
    taxId: "B12345678",
    legalName: "Acme Soluciones SL",
    billingAddress: {
      addressLine: "Calle Mayor 10, 3º B",
      postalCode: "28013",
      city: "Madrid",
      province: "Madrid",
      country: "España",
    },
    email: "facturacion@acme.test",
    phone: "+34 910 000 001",
    notes: "Indicar el número de pedido en el concepto.",
  },
  globex: {
    id: "globex",
    userId: ALEJANDRO.uid,
    taxId: "A87654321",
    legalName: "Globex Ibérica SA",
    billingAddress: {
      addressLine: "Avinguda Diagonal 200",
      postalCode: "08018",
      city: "Barcelona",
      province: "Barcelona",
      country: "España",
    },
    email: "cuentas@globex.test",
  },
  lucia: {
    id: "lucia-martin",
    userId: ALEJANDRO.uid,
    taxId: "12345678Z",
    legalName: "Lucía Martín Pérez",
    billingAddress: {
      addressLine: "Calle Larios 5",
      postalCode: "29005",
      city: "Málaga",
      province: "Málaga",
      country: "España",
    },
  },
  umbrella: {
    id: "umbrella",
    userId: ALEJANDRO.uid,
    taxId: "B50123456",
    legalName: "Umbrella Logística SL",
    billingAddress: {
      addressLine: "Paseo de la Independencia 24",
      postalCode: "50004",
      city: "Zaragoza",
      province: "Zaragoza",
      country: "España",
    },
    email: "administracion@umbrella.test",
  },
  nube: {
    id: "estudio-nube",
    userId: ALEJANDRO.uid,
    taxId: "B55555555",
    legalName: "Estudio Nube SL",
    billingAddress: {
      addressLine: "Carrer de Colón 1",
      postalCode: "46004",
      city: "Valencia",
      province: "Valencia",
      country: "España",
    },
    phone: "+34 960 000 002",
  },
} satisfies Record<string, FixtureClient>;

const clients = Object.values(CLIENTS);

export const clientsFixture: Fixture = {
  id: "clients:alejandro",
  description:
    "Alejandro's clients: three companies, a freelancer with only the required fields and one without invoices",
  version: 1,
  dependsOn: ["users:alejandro"],

  async up(context) {
    await applyClients(context, clients);
  },

  async check(context) {
    await checkClients(context, ALEJANDRO.uid, clients);
  },
};
