/**
 * Teste: scrape ZAP (Firefox + URL com zona).
 * Uso: npx tsx scripts/test-zap-scrape.ts
 */
import {
  closeSharedBrowser,
  scrapeZapFirefox,
} from "../src/lib/portal-playwright";

const URL =
  "https://www.zapimoveis.com.br/aluguel/apartamentos/sp+sao-paulo+zona-oeste+perdizes/2-quartos/?transacao=aluguel&tipos=apartamento_residencial&quartos=2";

async function main() {
  const maxPages = Number(process.env.MAX_PAGES || 3);
  console.log("zap+firefox:", URL, "maxPages=", maxPages);
  const items = await scrapeZapFirefox(URL, { scrollSteps: 5, maxPages });
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
