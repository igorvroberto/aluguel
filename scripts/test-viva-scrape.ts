/**
 * Teste pequeno: scrape Viva Real (Firefox) → lista de anúncios.
 * Uso: npx tsx scripts/test-viva-scrape.ts
 */
import {
  closeSharedBrowser,
  scrapeVivaRealFirefox,
} from "../src/lib/portal-playwright";

const URL =
  "https://www.vivareal.com.br/aluguel/sp/sao-paulo/zona-oeste/perdizes/apartamento_residencial/";

async function main() {
  const maxPages = Number(process.env.MAX_PAGES || 3);
  console.log("viva+firefox: abrindo", URL, "maxPages=", maxPages);
  const items = await scrapeVivaRealFirefox(URL, { scrollSteps: 5, maxPages });
  console.log(
    JSON.stringify(
      {
        count: items.length,
        sample: items.slice(0, 5).map((i) => ({
          id: i.id,
          titulo: i.titulo,
          aluguel: i.aluguel,
          condominio: i.condominio,
          iptu: i.iptu,
          quartos: i.quartos,
          areaM2: i.areaM2,
          vagas: i.vagas,
          bairro: i.bairro,
          link: i.linkAnuncio,
        })),
      },
      null,
      2
    )
  );
  await closeSharedBrowser();
  if (items.length === 0) process.exit(2);
}

main().catch(async (e) => {
  console.error(e);
  await closeSharedBrowser();
  process.exit(1);
});
