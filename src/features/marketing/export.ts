import type { Article } from "./data.ts";
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
/** Downloaded document only. Every owner-supplied value is escaped, never inserted as HTML. */
export function brandedDocument(input: Readonly<{
    article: Article;
    origin: string;
}>): string {
    const { article: a, origin } = input;
    const blocks = a.blog.split(/\n\s*\n/).map(block => {
        const heading = /^(#{1,3}) (.*)$/s.exec(block);
        if (heading)
            return `<h${heading[1]?.length}>${escape(heading[2] ?? "")}</h${heading[1]?.length}>`;
        if (/^\[Sign up to 30 Days, 30 Insights\]\(\/free-value\)$/.test(block))
            return `<p><a href="${escape(origin)}/free-value">Sign up to 30 Days, 30 Insights →</a></p>`;
        return `<p>${escape(block).replaceAll("\n", "<br>")}</p>`;
    }).join("\n");
    const images = a.images.map(i => `<figure><img src="${escape(i.url)}" alt="${escape(i.caption)}"><figcaption>${escape(i.caption)}</figcaption></figure>`).join("\n");
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(a.title)}</title><style>@font-face{font-family:Instrument;src:url('${escape(origin)}/assets/fonts/instrument-serif-regular.woff2')}@font-face{font-family:Geist;src:url('${escape(origin)}/assets/fonts/geist.woff2')}*{box-sizing:border-box}body{margin:0;background:#11110f;color:#f2f0e9;font:17px/1.8 Geist,Arial,sans-serif}main{max-width:760px;margin:auto;padding:64px 28px}h1,h2,h3{font-family:Instrument,Georgia,serif;font-weight:400;line-height:1.2}h1{font-size:52px}h2{font-size:34px;margin-top:48px}h3{font-size:28px}p{white-space:normal}a{color:#d6b679}img{width:100%;border-radius:8px}figure{margin:36px 0}figcaption{font-size:14px;color:#aaa79c}.brand{letter-spacing:.2em;text-transform:uppercase;color:#c7b07b;font-size:12px}pre{white-space:pre-wrap;font:inherit}hr{border:0;border-top:1px solid #35352d;margin:56px 0}</style><main><p class="brand">Elite Body System</p>${blocks}${images}<hr><h2>YouTube script</h2><pre>${escape(a.script)}</pre>${a.sourceUrl ? `<p>Research source: <a href="${escape(a.sourceUrl)}">${escape(a.sourceTitle || "YouTube video")}</a></p>` : ""}</main></html>`;
}
