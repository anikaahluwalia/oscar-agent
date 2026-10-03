"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ORIGIN, getEmailContent, imageThroughOscar } from "@/lib/api";
import { cleanText } from "@/lib/text";

type Content = { html: string | null; text: string };

/** An image address from the email, sent through Oscar; anything that isn't a web address is dropped. */
function throughOscar(value: string | null) {
  const url = value?.trim() ?? "";
  if (url.startsWith("data:")) return url;
  return /^https?:\/\//i.test(url) ? imageThroughOscar(url) : null;
}

/** Tracking pixels: images too small to see, there only to report that you opened the email. */
function isPixel(img: Element) {
  const size = (v: string | null) => (v === null ? null : parseInt(v, 10));
  const w = size(img.getAttribute("width")), h = size(img.getAttribute("height"));
  const style = (img.getAttribute("style") ?? "").replace(/\s/g, "").toLowerCase();
  return (w !== null && w <= 2) || (h !== null && h <= 2) || /(width|height):[01]px|display:none|visibility:hidden/.test(style);
}

/**
 * Tidy the email for the frame: keep its own styles (most marketing emails put them in
 * <head>) and its body's look, and drop anything that could redirect or open a door
 * back to Oscar. Images, when shown, load through Oscar (never straight from the sender),
 * and tracking pixels are taken out. With images off, every address an image could load
 * from is removed, so there's nothing to fetch at all. The Content-Security-Policy below
 * blocks anything else; this doesn't rely on it.
 */
function prepare(html: string, images: boolean) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("meta, link, base, script, iframe, object, embed, form, video, audio").forEach((el) => el.remove());
  doc.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  doc.querySelectorAll("img").forEach((img) => isPixel(img) && img.remove());
  doc.querySelectorAll("img, source, input[type=image], image").forEach((el) => {
    const src = images ? throughOscar(el.getAttribute("src")) : null;
    if (src) el.setAttribute("src", src);
    else el.removeAttribute("src");
    ["srcset", "poster", "href", "xlink:href"].forEach((attr) => el.removeAttribute(attr));
  });
  doc.querySelectorAll("[background]").forEach((el) => {
    const src = images ? throughOscar(el.getAttribute("background")) : null;
    if (src) el.setAttribute("background", src);
    else el.removeAttribute("background");
  });
  const urls = (css: string) =>
    css
      .replace(/@import[^;]*;?/gi, "")
      .replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (_, _q, url: string) => {
        const src = images ? throughOscar(url) : url.trim().startsWith("data:") ? url : null;
        return src ? `url("${src}")` : "none";
      });
  doc.querySelectorAll("[style]").forEach((el) => el.setAttribute("style", urls(el.getAttribute("style") ?? "")));
  doc.querySelectorAll("style").forEach((el) => (el.textContent = urls(el.textContent ?? "")));
  const styles = [...doc.querySelectorAll("style")].map((el) => el.outerHTML).join("");
  doc.querySelectorAll("style").forEach((el) => el.remove());
  const bodyAttrs = [...doc.body.attributes].map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join(" ");
  return { styles, bodyAttrs, body: doc.body.innerHTML };
}

/**
 * The email page shown in the frame. The frame is sandboxed with scripts off, and this
 * Content-Security-Policy lets images come only from Oscar, and nothing else from anywhere.
 * Links open in a new tab.
 */
function page(html: string, images: boolean) {
  const { styles, bodyAttrs, body } = prepare(html, images);
  const imgs = images ? `img-src data: ${API_ORIGIN};` : "img-src data:;";
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; ${imgs} font-src data:;">
<meta http-equiv="x-dns-prefetch-control" content="off">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;color:#111;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>
${styles}
</head><body ${bodyAttrs}>${body}</body></html>`;
}

/**
 * The whole real email, fetched live from Gmail when you open it, so you can see what
 * it actually is. It looks the way Gmail shows it. Images load through Oscar, so the
 * sender never sees your IP address or browser, and you can turn them off.
 */
export function EmailBody({ decisionId }: { decisionId: string }) {
  const [content, setContent] = useState<Content | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [images, setImages] = useState(true);

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
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ImageIcon className="size-3.5" />
        {images
          ? "Images load through Oscar, so the sender never sees your IP address or browser."
          : "Images are off."}
        <Button size="sm" variant="ghost" className="h-11 px-2 text-xs sm:h-7" onClick={() => setImages(!images)}>
          {images ? "Hide images" : "Show images"}
        </Button>
      </div>
    </div>
  );
}
