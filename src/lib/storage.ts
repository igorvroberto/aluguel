/**
 * Persistência centralizada via `/api/apartments` → `data/apartments.json`.
 * Sem localStorage: todos os clientes veem o mesmo estado do servidor.
 */
import type { Apartment } from "./types";
import {
  createApartments,
  fetchApartments,
  patchApartment,
  removeApartment,
} from "./apartments-api";

export async function loadApartments(): Promise<Apartment[]> {
  return fetchApartments();
}

export async function saveApartmentBatch(
  inputs: Array<Partial<Apartment>>
): Promise<Apartment[]> {
  const result = await createApartments(
    inputs as Parameters<typeof createApartments>[0]
  );
  return result.apartments;
}

export async function updateApartmentFields(
  id: string,
  patch: Partial<Apartment>
): Promise<Apartment> {
  const result = await patchApartment(id, patch);
  return result.apartment;
}

export async function deleteApartmentById(id: string): Promise<void> {
  await removeApartment(id);
}
