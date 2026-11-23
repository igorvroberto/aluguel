/**
 * Teste Imovelweb (Firefox + SCRAPE_PROXY_URL).
 *
 * Na VPS (com proxy da casa já ok):
 *   cd /opt/radar-imoveis
 *   set -a && source .env && set +a
 *   npx playwright install firefox
 *   npx tsx scripts/test-imovelweb-scrape.ts
 */
import {
  closeSharedBrowser,
  scrapeImovelwebFirefox,
} from "../src/lib/portal-playwright";

const URL =
  "https://www.imovelweb.com.br/apartamentos-aluguel-perdizes-sao-paulo.html";

async function main() {
  const proxy = (process.env.SCRAPE_PROXY_URL || "").trim();
  if (!proxy) {
    console.error(
      "Falta SCRAPE_PROXY_URL no ambiente (.env). Ex.: socks5://100.x.x.x:1080"
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      url: URL,
      proxy: proxy.replace(/:[^:@/]+@/, ":***@"),
    })
  );

  const items = await scrapeImovelwebFirefox(URL, { scrollSteps: 5 });
  console.log(
    JSON.stringify(
      {
        count: items.length,
        sample: items.slice(0, 5).map((i) => ({
          titulo: i.titulo,
          aluguel: i.aluguel,
          quartos: i.quartos,
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
