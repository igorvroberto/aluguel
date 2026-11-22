import { isWithinSelectedStations } from "./geo";
import { monthlyPackage } from "./format";
import type { Apartment, FiltersState, RouteAnalysis } from "./types";

export function getVisibleApartments(
  apartments: Apartment[],
  filters: FiltersState,
  analyses: Record<string, RouteAnalysis>
): Apartment[] {
  const roomSet = new Set(filters.rooms);

  let list = apartments.filter((apt) => {
    const pacote = monthlyPackage(apt.aluguel, apt.condominio, apt.iptu);
    if (pacote > filters.maxPackage) return false;

    const roomKey = (apt.rooms >= 3 ? 3 : apt.rooms) as 1 | 2 | 3;
    if (roomSet.size > 0 && !roomSet.has(roomKey)) return false;

    if (filters.statuses && filters.statuses.length > 0) {
      const status = apt.status || "Candidato";
      if (!filters.statuses.includes(status)) return false;
    }

    if (
      !isWithinSelectedStations(
        apt,
        filters.stationIds,
        filters.stationRadiusMeters
      )
    ) {
      return false;
    }

    return true;
  });

  list = [...list].sort((a, b) => {
    if (filters.sortBy === "pacote") {
      return (
        monthlyPackage(a.aluguel, a.condominio, a.iptu) -
        monthlyPackage(b.aluguel, b.condominio, b.iptu)
      );
    }
    if (filters.sortBy === "distancia") {
      const da = analyses[a.id]?.distanceMeters ?? Number.POSITIVE_INFINITY;
      const db = analyses[b.id]?.distanceMeters ?? Number.POSITIVE_INFINITY;
      return da - db;
    }
    const ea = analyses[a.id]?.elevationGain ?? Number.POSITIVE_INFINITY;
    const eb = analyses[b.id]?.elevationGain ?? Number.POSITIVE_INFINITY;
    return ea - eb;
  });

  return list;
}
