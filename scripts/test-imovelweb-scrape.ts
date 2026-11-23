/**
 * Teste Imovelweb (Firefox). Sem SCRAPE_PROXY_URL residencial,
 * o Turnstile costuma ficar em "Um momento…".
 *
 * Uso: SCRAPE_PROXY_URL=http://user:pass@host:port npx tsx scripts/test-imovelweb-scrape.ts
 */
import { firefox } from "playwright";

const URL =
  "https://www.imovelweb.com.br/apartamentos-aluguel-perdizes-sao-paulo.html";

async function main() {
  const proxy = (process.env.SCRAPE_PROXY_URL || "").trim();
  console.log(
    JSON.stringify({
      url: URL,
      proxy: proxy ? proxy.replace(/:[^:@]+@/, ":***@") : null,
    })
  );
  const browser = await firefox.launch({
    headless: true,
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  const page = await browser.newPage({ locale: "pt-BR" });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(20000);
  const title = await page.title();
  const hrefs = await page.$$eval("a[href]", (as) =>
    as
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((h) => /propriedades|apartamento/i.test(h))
  );
  console.log(
    JSON.stringify({
      title,
      blocked: /moment|verifica|attention/i.test(title),
      hrefs: hrefs.length,
      sample: hrefs.slice(0, 5),
    })
  );
  await browser.close();
  if (/moment|verifica|attention/i.test(title) || hrefs.length === 0) {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
