import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let loadPromise: Promise<typeof google.maps> | null = null;

/** Carrega a Maps JavaScript API (idempotente). */
export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só no browser"));
  }
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }
  if (!loadPromise) {
    setOptions({
      key: apiKey,
      v: "weekly",
      libraries: ["geometry"],
    });
    loadPromise = importLibrary("maps")
      .then(async () => {
        await importLibrary("geometry");
        return window.google.maps;
      })
      .catch((err: unknown) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export function svgCircleIcon(opts: {
  fill: string;
  stroke?: string;
  size: number;
  strokeWidth?: number;
}): google.maps.Icon {
  const size = opts.size;
  const stroke = opts.stroke ?? "#ffffff";
  const sw = opts.strokeWidth ?? 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${(size - sw) / 2}" fill="${opts.fill}" stroke="${stroke}" stroke-width="${sw}"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}
