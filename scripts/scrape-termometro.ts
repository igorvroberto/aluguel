/**
 * Teste CLI da API Termômetro → imóveis.
 * Uso: npx tsx scripts/scrape-termometro.ts [--save]
 */
import { addApartments } from "../src/lib/apartments-store";
import { fetchTermometroApartments } from "../src/lib/termometro";

async function main() {
  const save = process.argv.includes("--save");
  console.log("termometro: buscando anúncios…");
  const result = await fetchTermometroApartments({
    raio: 2000,
    maxPages: 2,
    limite: 50,
  });
  console.log(
    JSON.stringify(
      {
        scanned: result.scanned,
        mapped: result.apartments.length,
        requests: result.requests,
        fontes: result.fontes,
        warnings: result.warnings,
        sample: result.apartments.slice(0, 3).map((a) => ({
          id: a.id,
          title: a.title,
          address: a.address,
          aluguel: a.aluguel,
          portal: a.portal,
          url: a.externalUrl,
        })),
      },
      null,
      2
    )
  );

  if (save && result.apartments.length > 0) {
    const saved = await addApartments(result.apartments, { dedupeByUrl: true });
    console.log(
      `salvo: +${saved.added.length} (skipped ${saved.skipped}, persisted=${saved.persisted})`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
