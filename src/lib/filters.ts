import { DESTINATION } from "./constants";
import { distanceMeters, isWithinSelectedStations } from "./geo";
import { monthlyPackage } from "./format";
import type { Apartment, FiltersState } from "./types";

function packageValue(apt: Apartment): number {
  return monthlyPackage(apt.aluguel, apt.condominio, apt.iptu);
}

export function getVisibleApartments(
  apartments: Apartment[],
  filters: FiltersState
): Apartment[] {
  const roomSet = new Set(filters.rooms);
  const parkingSet = new Set(filters.parkingSpots);

  const list = apartments.filter((apt) => {
    const pkg = packageValue(apt);
    if (filters.minPackage != null && pkg < filters.minPackage) return false;
    if (filters.maxPackage != null && pkg > filters.maxPackage) return false;

    const roomKey = (apt.rooms >= 3 ? 3 : apt.rooms) as 1 | 2 | 3;
    if (roomSet.size > 0 && !roomSet.has(roomKey)) return false;

    const spots = apt.parkingSpots ?? 0;
    const parkingKey = (spots >= 2 ? 2 : spots) as 0 | 1 | 2;
    if (parkingSet.size > 0 && !parkingSet.has(parkingKey)) return false;

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

  return [...list].sort((a, b) => {
    let primary = 0;

    if (filters.sortBy === "pacote") {
      primary = packageValue(a) - packageValue(b);
    } else {
      // distancia (linha reta até o destino)
      primary = distanceMeters(a, DESTINATION) - distanceMeters(b, DESTINATION);
    }

    if (primary !== 0) return primary;

    const byValue = packageValue(a) - packageValue(b);
    if (byValue !== 0) return byValue;
    const byDist =
      distanceMeters(a, DESTINATION) - distanceMeters(b, DESTINATION);
    if (byDist !== 0) return byDist;
    return a.id.localeCompare(b.id);
  });
}
