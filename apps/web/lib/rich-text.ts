import sanitizeHtml from "sanitize-html";
import { mediaUrl } from "./content";

/** Same allow-list as the API applies on save; repeated here so stored content is never trusted blindly. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "small", "mark",
    "ul", "ol", "li", "dl", "dt", "dd",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "span", "div",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer nofollow" } : attribs }),
  },
};

/** Resolves media:// references to public URLs, then sanitises. */
export function richText(html: string) {
  const resolved = String(html || "").replace(/media:\/\/(media\/[^"'\s)]+)/g, (_, key: string) => mediaUrl(key) || "");
  return sanitizeHtml(resolved, OPTIONS);
}

/** JSON for <script type="application/ld+json">: escapes characters that could close the script element. */
export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
