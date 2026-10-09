import sanitizeHtml from "sanitize-html";

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
  allowedSchemesByTag: { img: ["http", "https", "media"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer nofollow" } : attribs,
    }),
  },
};

/** Allow-list HTML sanitiser for CMS rich text. Applied on save; the website applies it again at render. */
export function sanitizeRichText(html: string) {
  return sanitizeHtml(html, OPTIONS);
}
