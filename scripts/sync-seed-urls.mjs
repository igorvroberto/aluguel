#!/usr/bin/env node
/**
 * Volume antigo (seed manual sem links) vs seed da imagem (scrape com /imovel/…).
 * Se o seed tiver bem mais anúncios reais, substitui o volume.
 * Caso contrário, só preenche externalUrl vazio por id/endereço.
 */
import fs from "node:fs";
import path from "node:path";

const seedDir = process.env.APARTMENTS_SEED_DIR || "/app/data-seed";
const targetPath =
  process.env.APARTMENTS_DATA_PATH ||
  path.join(process.env.APARTMENTS_DATA_DIR || "/app/data", "apartments.json");
const seedPath = path.join(seedDir, "apartments.json");

function houseId(url) {
  if (!url) return "";
  const m = String(url).match(/\/imovel\/(\d+)/i);
  return m ? m[1] : "";
}

function keyAddr(a) {
  return [
    String(a.address || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    Number(a.aluguel || 0),
    Number(a.rooms || 0),
  ].join("|");
}

function countListingUrls(list) {
  return list.filter((a) => /\/imovel\/\d+/i.test(String(a.externalUrl || ""))).length;
}

function load(p) {
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

if (!fs.existsSync(seedPath) || !fs.existsSync(targetPath)) {
  process.exit(0);
}

const seed = load(seedPath);
const target = load(targetPath);
if (!seed.length) process.exit(0);

const seedUrls = countListingUrls(seed);
const currentUrls = countListingUrls(target);

function isHandEntered(a) {
  const status = String(a.status || "");
  const source = String(a.source || "").toLowerCase();
  const portal = String(a.portal || "").toLowerCase();
  return status === "Manual" || source === "manual" || portal === "manual";
}

if (seedUrls >= 20 && seedUrls > currentUrls + 5) {
  const byAddr = new Map(
    target.map((a) => [String(a.address || "").trim().toLowerCase(), a])
  );
  const seedIds = new Set(seed.map((s) => s.id));
  const seedAddrs = new Set(
    seed
      .map((s) => String(s.address || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const merged = seed.map((s) => {
    const prev = byAddr.get(String(s.address || "").trim().toLowerCase());
    if (!prev) return s;
    return {
      ...s,
      status: prev.status || s.status,
      comments: prev.comments ?? s.comments,
    };
  });
  // Preserva imóveis inseridos à mão que não estão no seed do scrape.
  let keptManual = 0;
  for (const prev of target) {
    if (!isHandEntered(prev)) continue;
    const addr = String(prev.address || "").trim().toLowerCase();
    if (seedIds.has(prev.id)) continue;
    if (addr && seedAddrs.has(addr)) continue;
    merged.push(prev);
    keptManual += 1;
  }
  fs.writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(
    `seed-urls: volume atualizado com seed (${merged.length} imóveis, ${seedUrls} links, ${keptManual} manuais preservados)`
  );
  process.exit(0);
}

if (!target.length) process.exit(0);

const byId = new Map(seed.map((a) => [a.id, a]));
const byHouse = new Map();
const byAddr = new Map();
for (const a of seed) {
  const hid = houseId(a.externalUrl);
  if (hid) byHouse.set(hid, a);
  byAddr.set(keyAddr(a), a);
}

let patched = 0;
const next = target.map((apt) => {
  const url = String(apt.externalUrl || "").trim();
  if (url && /\/imovel\/\d+/i.test(url)) return apt;

  const fromId = byId.get(apt.id);
  const fromHouse = houseId(url) ? byHouse.get(houseId(url)) : null;
  const fromAddr = byAddr.get(keyAddr(apt));
  const donor = fromId || fromHouse || fromAddr;
  const donorUrl = String(donor?.externalUrl || "").trim();
  if (!donorUrl || !/\/imovel\/\d+/i.test(donorUrl)) return apt;

  patched += 1;
  return { ...apt, externalUrl: donorUrl };
});

if (patched > 0) {
  fs.writeFileSync(targetPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`seed-urls: preenchidos ${patched} link(s) de anúncio a partir do seed`);
} else {
  console.log("seed-urls: nenhum externalUrl vazio para preencher");
}
