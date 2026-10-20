// dist/ のビルド結果を、JS・CSS を埋め込んだ1つのHTMLファイルにまとめる。
// 使い方: npm run build && node scripts/build-single.mjs [出力先]
// --fragment を付けると <html>/<head>/<body> を付けない断片を出力する（ページの枠を自動で付ける公開先向け）。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const fragment = args.includes("--fragment");
const out = args.find((a) => !a.startsWith("--")) ?? "dist/mieru-score.html";
const dir = "dist/assets";
const files = readdirSync(dir);
const js = readFileSync(join(dir, files.find((f) => f.endsWith(".js"))), "utf8");
const css = readFileSync(join(dir, files.find((f) => f.endsWith(".css"))), "utf8");
if (js.includes("</script")) throw new Error("JS に </script が含まれているため埋め込めません");
const favicon = Buffer.from(readFileSync("public/favicon.svg")).toString("base64");

const body = `<title>ジュニアスタッツ</title>
<meta name="theme-color" content="#183c2b">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${favicon}">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
const html = fragment
  ? body
  : `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
</head>
<body>
${body}</body>
</html>
`;
writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
