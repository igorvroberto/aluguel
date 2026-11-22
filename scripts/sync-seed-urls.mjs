#!/usr/bin/env node
/**
 * Preenche externalUrl vazios no volume a partir do seed da imagem.
 * Não sobrescreve URL já existente. Match por id, /imovel/:id ou endereço+preço.
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
if (!seed.length || !target.length) process.exit(0);

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
