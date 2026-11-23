import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let loadPromise: Promise<typeof google.maps> | null = null;

const AUTH_HINT =
  "Verifique no Google Cloud: (1) Maps JavaScript API ativada, (2) faturamento ligado, (3) restrições HTTP referrer incluindo este domínio (ex.: https://radar.liganer.com.br/*).";

/** Carrega a Maps JavaScript API (idempotente). */
export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só no browser"));
  }
  if (!apiKey.trim()) {
    return Promise.reject(new Error("Chave Google Maps vazia"));
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

    loadPromise = new Promise<typeof google.maps>((resolve, reject) => {
      const onAuthFailure = () => {
        window.removeEventListener("error", onScriptError);
        loadPromise = null;
        reject(new Error(`Autenticação Google Maps falhou. ${AUTH_HINT}`));
      };

      const onScriptError = (ev: ErrorEvent) => {
        if (
          typeof ev.message === "string" &&
          /Google Maps|maps\.googleapis/i.test(ev.message)
        ) {
          window.gm_authFailure = undefined;
          loadPromise = null;
          reject(new Error(`Falha ao carregar o script do Maps. ${AUTH_HINT}`));
        }
      };

      // Callback global que o Maps chama quando a key é rejeitada.
      window.gm_authFailure = onAuthFailure;
      window.addEventListener("error", onScriptError);

      importLibrary("maps")
        .then(async () => {
          await importLibrary("geometry");
          window.removeEventListener("error", onScriptError);
          // Se auth falhar, o Maps ainda resolve o script e mostra o overlay;
          // gm_authFailure cuida do reject. Damos um tick para capturar.
          await new Promise((r) => setTimeout(r, 0));
          if (!window.google?.maps?.Map) {
            throw new Error(`Maps carregou sem Map. ${AUTH_HINT}`);
          }
          resolve(window.google.maps);
        })
        .catch((err: unknown) => {
          window.gm_authFailure = undefined;
          window.removeEventListener("error", onScriptError);
          loadPromise = null;
          const msg = err instanceof Error ? err.message : String(err);
          reject(new Error(`${msg}. ${AUTH_HINT}`));
        });
    });
  }
  return loadPromise;
}

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
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
