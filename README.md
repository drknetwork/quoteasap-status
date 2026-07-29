# QuoteASAP Status

Public status page for QuoteASAP, published at GitHub Pages. Zero cost, no server: a GitHub Actions cron job (`check.mjs`, every 5 minutes) polls the endpoints in `config.json`, appends results to a rolling history, and regenerates the static site on the `gh-pages` branch.

Deliberately a separate, public repository from the main (private) product codebase — GitHub Pages on the free plan only works for public repos, and this way the private repo never has to be made public just to get a free status page. Nothing proprietary lives here: `config.json` is just a list of public URLs, `check.mjs` is a generic HTTP checker.

To add/remove a monitored endpoint, edit `config.json` and push — the next scheduled run picks it up.
