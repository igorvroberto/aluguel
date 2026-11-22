"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { searchSaoPauloAddresses, type GeocodeSuggestion } from "@/lib/geocoding";
import type { ExtractedListing } from "@/lib/listing-parser";
import type { NewApartmentInput } from "@/lib/types";

interface AddApartmentModalProps {
  open: boolean;
  mapboxToken?: string;
  onClose: () => void;
  onSave: (input: NewApartmentInput) => void;
}

const emptyForm = {
  title: "",
  address: "",
  lat: "",
  lng: "",
  rooms: "2",
  aluguel: "",
  condominio: "",
  iptu: "",
  areaM2: "",
  parkingSpots: "",
  portaria24h: false,
  externalUrl: "",
  notes: "",
};

type FormState = typeof emptyForm;

function applyExtracted(prev: FormState, data: ExtractedListing, url?: string): FormState {
  return {
    ...prev,
    title: data.title || prev.title,
    address: data.address || prev.address,
    aluguel:
      data.aluguel != null ? String(data.aluguel) : prev.aluguel,
    condominio:
      data.condominio != null ? String(data.condominio) : prev.condominio,
    iptu: data.iptu != null ? String(data.iptu) : prev.iptu,
    rooms: data.rooms != null ? String(data.rooms) : prev.rooms,
    areaM2: data.areaM2 != null ? String(data.areaM2) : prev.areaM2,
    parkingSpots:
      data.parkingSpots != null ? String(data.parkingSpots) : prev.parkingSpots,
    externalUrl: url || prev.externalUrl,
    notes: data.description
      ? data.description.slice(0, 280)
      : prev.notes,
  };
}

export function AddApartmentModal({
  open,
  mapboxToken,
  onClose,
  onSave,
}: AddApartmentModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [listingUrl, setListingUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextGeocodeRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setListingUrl("");
      setPasteText("");
      setShowPaste(false);
      setSuggestions([]);
      setError(null);
      setInfo(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !mapboxToken) return;
    if (skipNextGeocodeRef.current) {
      skipNextGeocodeRef.current = false;
      return;
    }
    const q = form.address.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchSaoPauloAddresses(mapboxToken, q);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.address, mapboxToken, open]);

  if (!open) return null;

  const pickSuggestion = (s: GeocodeSuggestion) => {
    skipNextGeocodeRef.current = true;
    setForm((prev) => ({
      ...prev,
      address: s.address,
      lat: String(s.lat),
      lng: String(s.lng),
      title: prev.title || s.placeName.split(",")[0],
    }));
    setSuggestions([]);
  };

  const geocodeAddress = async (address: string) => {
    if (!mapboxToken || !address.trim()) return;
    setGeocoding(true);
    try {
      const results = await searchSaoPauloAddresses(mapboxToken, address);
      if (results[0]) {
        skipNextGeocodeRef.current = true;
        setForm((prev) => ({
          ...prev,
          address: prev.address || results[0].address,
          lat: String(results[0].lat),
          lng: String(results[0].lng),
        }));
        setInfo((msg) =>
          msg
            ? `${msg} Coordenadas preenchidas via geocoding.`
            : "Coordenadas preenchidas via geocoding."
        );
      }
    } catch {
      // keep manual lat/lng
    } finally {
      setGeocoding(false);
    }
  };

  const runExtract = async (mode: "url" | "text") => {
    setError(null);
    setInfo(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/scrape-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "url"
            ? { url: listingUrl.trim() }
            : { text: pasteText.trim() }
        ),
      });
      const data = (await res.json()) as {
        ok: boolean;
        data?: ExtractedListing;
        message?: string;
        error?: string;
        suggestPaste?: boolean;
        blocked?: boolean;
      };

      if (data.suggestPaste || data.blocked) {
        setShowPaste(true);
      }

      if (!data.ok || !data.data) {
        setError(
          data.error ||
            "Não foi possível extrair o anúncio. Tente colar o texto."
        );
        return;
      }

      const next = applyExtracted(form, data.data, listingUrl.trim() || undefined);
      setForm(next);
      setInfo(data.message || "Dados preenchidos. Revise antes de salvar.");

      if (next.address) {
        await geocodeAddress(next.address);
      }
    } catch {
      setShowPaste(true);
      setError(
        "Falha ao extrair. Cole o texto da descrição do anúncio no campo alternativo."
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const aluguel = Number(form.aluguel);
    const condominio = Number(form.condominio);
    const iptu = Number(form.iptu);
    const rooms = Number(form.rooms);
    const areaM2 = form.areaM2 ? Number(form.areaM2) : undefined;
    const parkingSpots = form.parkingSpots
      ? Number(form.parkingSpots)
      : undefined;

    if (!form.title.trim() || !form.address.trim()) {
      setError("Preencha título e endereço.");
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError("Selecione um endereço geocodificado (lat/lng obrigatórios).");
      return;
    }
    if (!Number.isFinite(aluguel) || aluguel < 0) {
      setError("Informe um valor de aluguel válido.");
      return;
    }

    onSave({
      title: form.title.trim(),
      address: form.address.trim(),
      lat,
      lng,
      rooms: Math.max(1, rooms || 1),
      aluguel,
      condominio: Number.isFinite(condominio) ? condominio : 0,
      iptu: Number.isFinite(iptu) ? iptu : 0,
      areaM2: Number.isFinite(areaM2) ? areaM2 : undefined,
      parkingSpots: Number.isFinite(parkingSpots) ? parkingSpots : undefined,
      portaria24h: form.portaria24h,
      externalUrl:
        form.externalUrl.trim() ||
        listingUrl.trim() ||
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      notes: form.notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-apt-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2
            id="add-apt-title"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Adicionar Imóvel
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-3">
            <label className="block text-sm">
              <span className="mb-1 flex items-center gap-1.5 font-medium text-slate-700">
                <Link2 className="h-4 w-4 text-teal-700" aria-hidden />
                Colar URL do anúncio (QuintoAndar, ZAP Imóveis, Viva Real,
                Imovelweb)
              </span>
              <div className="flex gap-2">
                <input
                  value={listingUrl}
                  onChange={(e) => setListingUrl(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                  placeholder="https://www.quintoandar.com.br/imovel/…"
                />
                <button
                  type="button"
                  disabled={extracting || !listingUrl.trim()}
                  onClick={() => void runExtract("url")}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {extracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  Extrair Dados
                </button>
              </div>
            </label>

            {(showPaste || pasteText) && (
              <label className="mt-3 block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Colar texto do anúncio
                </span>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                  placeholder="Cole aqui o título, endereço, aluguel, condomínio, IPTU, quartos…"
                />
                <button
                  type="button"
                  disabled={extracting || pasteText.trim().length < 20}
                  onClick={() => void runExtract("text")}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                >
                  Extrair do texto
                </button>
              </label>
            )}

            {!showPaste && (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-teal-800 hover:underline"
                onClick={() => setShowPaste(true)}
              >
                Portal bloqueou? Colar texto do anúncio…
              </button>
            )}
          </div>

          {!mapboxToken && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Sem <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> o
              autocompletar fica desativado. Informe lat/lng manualmente.
            </p>
          )}

          {info && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {info}
              {geocoding ? " Geocodificando…" : ""}
            </p>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Título</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
              placeholder="Ex.: Apto 2 dorms na Turiassu"
            />
          </label>

          <div className="relative">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Endereço (São Paulo, SP)
              </span>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-9 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                  placeholder="Digite o endereço…"
                  autoComplete="off"
                />
                {(searching || geocoding) && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-700" />
                )}
              </div>
            </label>
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-teal-50"
                    >
                      {s.placeName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Lat</span>
              <input
                required
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Lng</span>
              <input
                required
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-teal-600"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Quartos</span>
              <select
                value={form.rooms}
                onChange={(e) => setForm({ ...form, rooms: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4+</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.portaria24h}
                onChange={(e) =>
                  setForm({ ...form, portaria24h: e.target.checked })
                }
                className="accent-teal-700"
              />
              <span className="font-medium text-slate-700">Portaria 24h</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Aluguel</span>
              <input
                required
                type="number"
                min={0}
                value={form.aluguel}
                onChange={(e) => setForm({ ...form, aluguel: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Cond.</span>
              <input
                type="number"
                min={0}
                value={form.condominio}
                onChange={(e) =>
                  setForm({ ...form, condominio: e.target.value })
                }
                className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">IPTU</span>
              <input
                type="number"
                min={0}
                value={form.iptu}
                onChange={(e) => setForm({ ...form, iptu: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Área (m²)</span>
              <input
                type="number"
                min={0}
                value={form.areaM2}
                onChange={(e) => setForm({ ...form, areaM2: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Vagas</span>
              <input
                type="number"
                min={0}
                value={form.parkingSpots}
                onChange={(e) =>
                  setForm({ ...form, parkingSpots: e.target.value })
                }
                className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Link externo
            </span>
            <input
              value={form.externalUrl}
              onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
              className="w-full rounded-md border border-slate-200 px-3 py-2 outline-none focus:border-teal-600"
              placeholder="https://…"
            />
          </label>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Salvar imóvel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
