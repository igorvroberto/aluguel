import { DESTINATION } from "./constants";
import { distanceMeters, isWithinSelectedStations } from "./geo";
import { monthlyPackage } from "./format";
import type { Apartment, FiltersState, RouteAnalysis } from "./types";

function packageValue(apt: Apartment): number {
  return monthlyPackage(apt.aluguel, apt.condominio, apt.iptu);
}

/** Distância a pé Mapbox quando houver; senão linha reta até o destino. */
function sortDistanceMeters(
  apt: Apartment,
  analyses: Record<string, RouteAnalysis>
): number {
  const analyzed = analyses[apt.id]?.distanceMeters;
  if (analyzed != null && Number.isFinite(analyzed)) return analyzed;
  return distanceMeters(apt, DESTINATION);
}

/** Subida acumulada do trajeto a pé analisado; sem análise → infinito (vai ao fim). */
function sortElevationGain(
  apt: Apartment,
  analyses: Record<string, RouteAnalysis>
): number {
  const gain = analyses[apt.id]?.elevationGain;
  if (gain != null && Number.isFinite(gain)) return gain;
  return Number.POSITIVE_INFINITY;
}

export function getVisibleApartments(
  apartments: Apartment[],
  filters: FiltersState,
  analyses: Record<string, RouteAnalysis>
): Apartment[] {
  const roomSet = new Set(filters.rooms);

  const list = apartments.filter((apt) => {
    if (packageValue(apt) > filters.maxPackage) return false;

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

  return [...list].sort((a, b) => {
    let primary = 0;

    if (filters.sortBy === "pacote") {
      primary = packageValue(a) - packageValue(b);
    } else if (filters.sortBy === "distancia") {
      primary =
        sortDistanceMeters(a, analyses) - sortDistanceMeters(b, analyses);
    } else {
      // subida
      primary =
        sortElevationGain(a, analyses) - sortElevationGain(b, analyses);
    }

    if (primary !== 0) return primary;

    // Desempate estável: valor → distância → id
    const byValue = packageValue(a) - packageValue(b);
    if (byValue !== 0) return byValue;
    const byDist =
      sortDistanceMeters(a, analyses) - sortDistanceMeters(b, analyses);
    if (byDist !== 0) return byDist;
    return a.id.localeCompare(b.id);
  });
}
