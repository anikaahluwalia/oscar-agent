"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEmailContent } from "@/lib/api";
import { cleanText } from "@/lib/text";

type Content = { html: string | null; text: string };

/**
 * The email page shown in the frame. The frame is sandboxed with scripts off, and
 * this Content-Security-Policy blocks anything loaded from the internet (images,
 * fonts, styles) unless you choose to show images. Links open in a new tab.
 */
/**
 * Tidy the email for the frame: keep its own styles (most marketing emails put them in
 * <head>) and its body's look, and drop anything that could redirect or open a door
 * back to Oscar. With images off, also take out every address an image could load
 * from, so there's nothing to fetch at all. The Content-Security-Policy below blocks
 * those too; this doesn't rely on it.
 */
function prepare(html: string, images: boolean) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("meta, link, base, script, iframe, object, embed, form").forEach((el) => el.remove());
  doc.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  if (!images) {
    doc.querySelectorAll("img, source, input[type=image], video, audio, track, image").forEach((el) => {
      ["src", "srcset", "poster", "href", "xlink:href"].forEach((attr) => {
        const value = el.getAttribute(attr);
        if (value && !value.trim().startsWith("data:")) el.removeAttribute(attr);
      });
    });
    doc.querySelectorAll("[background]").forEach((el) => el.removeAttribute("background"));
    const noUrls = (css: string) => css.replace(/url\(\s*(['"]?)(?!data:)[^)]*\1\s*\)/gi, "none").replace(/@import[^;]*;?/gi, "");
    doc.querySelectorAll("[style]").forEach((el) => el.setAttribute("style", noUrls(el.getAttribute("style") ?? "")));
    doc.querySelectorAll("style").forEach((el) => (el.textContent = noUrls(el.textContent ?? "")));
  }
  const styles = [...doc.querySelectorAll("style")].map((el) => el.outerHTML).join("");
  doc.querySelectorAll("style").forEach((el) => el.remove());
  const bodyAttrs = [...doc.body.attributes].map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join(" ");
  return { styles, bodyAttrs, body: doc.body.innerHTML };
}

/**
 * The email page shown in the frame. The frame is sandboxed with scripts off, and
 * this Content-Security-Policy blocks anything loaded from the internet (images,
 * fonts, styles) unless you choose to show images. Links open in a new tab.
 */
function page(html: string, images: boolean) {
  const { styles, bodyAttrs, body } = prepare(html, images);
  const imgs = images ? "img-src data: https: http:;" : "img-src data:;";
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; ${imgs} font-src data:;">
<meta http-equiv="x-dns-prefetch-control" content="off">
<base target="_blank">
<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;color:#111;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>
${styles}
</head><body ${bodyAttrs}>${body}</body></html>`;
}

/**
 * The whole real email, fetched live from Gmail when you open it, so you can see what
 * it actually is. It looks the way Gmail shows it, but images stay off until you ask:
 * loading them can tell the sender you opened it.
 */
export function EmailBody({ decisionId }: { decisionId: string }) {
  const [content, setContent] = useState<Content | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [images, setImages] = useState(false);

  useEffect(() => {
    let current = true;
    getEmailContent(decisionId).then(
      (c) => current && setContent(c),
      (e) => current && setProblem(e instanceof Error ? e.message : "I couldn't load this email."),
    );
    return () => {
      current = false;
    };
  }, [decisionId]);

  if (problem) return <p className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">{problem}</p>;
  if (!content) return <div className="h-40 animate-pulse rounded-2xl bg-muted/40" aria-label="Loading the email" />;

  if (!content.html) {
    return (
      <div className="max-h-[560px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-muted/40 p-4 text-sm leading-relaxed">
        {cleanText(content.text) ? content.text : <span className="italic text-muted-foreground">This email has no text.</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <iframe
        title="The email"
        // No allow-scripts and no allow-same-origin: the email can't run code or reach Oscar.
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={page(content.html, images)}
        referrerPolicy="no-referrer"
        className="h-[560px] w-full rounded-2xl border bg-white"
      />
      {!images && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5" />
          Images are off, so the sender can&apos;t tell you opened it.
          <Button size="sm" variant="ghost" className="h-11 px-2 text-xs sm:h-7" onClick={() => setImages(true)}>
            Show images
          </Button>
        </div>
      )}
    </div>
  );
}
