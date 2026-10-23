// Richard's document engine, ported from adlm-studio-site assets/js/doc.js.
//
// One renderer produces every document the studio sends — quotation, invoice,
// receipt, bill of quantities, valuation, letter, report, statement — because
// the moment there are two, they drift. A spec is a plain object: a template
// name, an addressee, and a list of typed blocks. This module turns that into
// the HTML his doc.css styles.
//
// Ported rather than rewritten. The structure, the class names and the
// decisions behind them are his, including the ones that look like details and
// are not:
//
//   * A document a practice sends to its own client is NOT an ADLM document.
//     It carries none of our colour and none of our logo, only the structure
//     and a one-line credit. ADLM's identity is one brand among others, never
//     the fallback — see brandOf().
//   * A bill of quantities and a valuation are never ours, whoever generates
//     them: putting them on our letterhead would claim authorship of somebody
//     else's professional work. FIRM_ONLY enforces that.
//   * Nothing that can be computed is typed, and a line the library cannot
//     price is carried through unpriced rather than quietly totalled as free.
//
// The one thing deliberately NOT carried over is his hardcoded VAT constant.
// His engine assumes 7.5%; ours reads the rate from the same setting checkout
// charges against, so a quotation cannot promise a total the cart disagrees
// with. Callers pass the computed rows in.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ₦, not N. A costing document from a Nigerian practice that says N480,000
// looks like a workaround for a missing glyph.
export function money(n, dp) {
  if (n == null || n === "") return "";
  if (typeof n === "string") return n;
  return `₦${Number(n).toLocaleString("en-NG", {
    minimumFractionDigits: dp || 0,
    maximumFractionDigits: dp || 0,
  })}`;
}

export function num(n) {
  if (n == null || n === "") return "";
  if (typeof n === "string") return n;
  return Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

export function when(iso) {
  if (!iso) return "";
  const d = String(iso).split("-");
  if (d.length !== 3) return String(iso);
  return `${Number(d[2])} ${MONTHS[Number(d[1]) - 1]} ${d[0]}`;
}

// ── brand ──────────────────────────────────────────────────────────────────

const ADLM = {
  name: "ADLM Studio",
  logo: "/ds/logo-light.svg",
  mark: "/ds/mark.svg", // icon only. The watermark is never the lockup
  site: "www.adlmstudio.net",
  phone: "+234 810 650 3524",
  social: "@adlmstudio",

  /* The registered office, and the number it is registered under.
     A letter on a letterhead that carries neither is a letter from nobody in
     particular — and on anything contractual the registration number is what
     identifies which company actually signed.

     RC 7440343 is ADLM Studio's registration with the CAC, confirmed by the
     CEO on 26 Sep 2026 and the number the proposal pages already print. It
     was left empty until then rather than invented. The "Reg No. 3612322" on
     the retired Drive letterhead is not the number ADLM documents carry. */
  address: ["1 Alhaji Abiola Street, Olowora,", "Ikosi, Lagos, Nigeria"],
  reg: "RC 7440343",
  bank: { account: "1634998770", name: "ADLM Studio", bank: "Access Bank" },
  ink: "#091E39",
  accent: "#239CFF",
  band: "#E9F5FF",
  bandSoft: "#F6FBFF",
  credit: false, // ADLM does not credit itself on its own paper
  signature: null,
};

// A firm that has filled in nothing but its name still gets a document that
// looks deliberate: graphite rather than ADLM blue, which reads as neutral
// stationery instead of somebody else's brand.
const NEUTRAL = {
  ink: "#22303F",
  accent: "#C3CBD5",
  band: "color-mix(in srgb, #22303F 7%, #fff)",
  bandSoft: "color-mix(in srgb, #22303F 3.5%, #fff)",
};

const FIRM_ONLY = { boq: 1, valuation: 1 };

function brandOf(spec) {
  const given = (spec && spec.brand) || null;
  const firmOnly = spec && FIRM_ONLY[spec.template];
  const isADLM = !firmOnly && (!given || !given.name || given.name === ADLM.name);

  const b = { ...ADLM };

  if (!isADLM) {
    // Strip the identity back to neutral before the firm's own details go on,
    // so nothing of ours survives by being merely unspecified.
    b.logo = null;
    b.mark = null;
    b.site = "";
    b.phone = "";
    b.social = "";
    b.bank = null;
    b.name = (given && given.name) || "Your practice";
    b.ink = NEUTRAL.ink;
    b.accent = NEUTRAL.accent;
    b.band = NEUTRAL.band;
    b.bandSoft = NEUTRAL.bandSoft;
    b.credit = true;
  }
  if (given) Object.assign(b, given);

  if (!isADLM && given && given.ink && given.band === undefined) {
    b.band = `color-mix(in srgb, ${given.ink} 8%, #fff)`;
    b.bandSoft = `color-mix(in srgb, ${given.ink} 4%, #fff)`;
  }
  if (!isADLM && given && given.credit === undefined) b.credit = true;
  return b;
}

const paletteStyle = (brand) =>
  `--doc-navy:${brand.ink};--doc-blue:${brand.accent};` +
  `--doc-band:${brand.band};--doc-band-soft:${brand.bandSoft}`;

// ── numbering ──────────────────────────────────────────────────────────────

const PREFIX = {
  invoice: "INV", receipt: "RCT", boq: "BOQ", valuation: "VAL", proposal: "PRP",
  statement: "STM", letter: "LTR", report: "RPT",
};

export function docNumber(template, seq, year) {
  const p = PREFIX[template] || "DOC";
  const y = year || new Date().getFullYear();
  return `${p}-${y}-${String(seq == null ? 1 : seq).replace(/\D/g, "").padStart(4, "0")}`;
}

// Each template is a thin configuration of one frame: which chrome it carries,
// and whether it uses the wide invoice measure or the indented content measure.
const TEMPLATES = {
  invoice: { cls: "doc-invoice", band: false, tax: true },
  receipt: { cls: "doc-invoice", band: false, tax: true },
  boq: { cls: "doc-content", band: true, tax: false },
  valuation: { cls: "doc-content", band: true, tax: false },
  letter: { cls: "doc-content", band: true, tax: false },
  // His sixth. He notes it "currently borrows the letter layout", and so
  // does this: a proposal is a letter with a validity date on it, and
  // giving it a layout of its own would be a difference nobody asked for.
  proposal: { cls: "doc-content", band: true, tax: false },
  report: { cls: "doc-content", band: true, tax: false },
  statement: { cls: "doc-content", band: true, tax: false },
};

// ── chrome ─────────────────────────────────────────────────────────────────

// The real Hugeicons, read out of @hugeicons/core-free-icons: Globe02 for the
// website, Call02 for the phone, Location01 for the address and Instagram for
// the handle. They are stroked, not filled, which is how the set is drawn; the
// two shapes that used to sit here were filled approximations.
const hugeicon = (d) =>
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
  `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const GLOBE = hugeicon(
  '<path d="M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12Z"/>' +
    '<path d="M21 15H3"/><path d="M21 9H3"/>' +
    '<path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z"/>',
);
const CALL = hugeicon(
  '<path d="M9.1585 5.71217L8.75584 4.80619C8.49256 4.21382 8.36092 3.91762 8.16405 3.69095C7.91732 3.40688 7.59571 3.19788 7.23592 3.08779C6.94883 2.99994 6.6247 2.99994 5.97645 2.99994C5.02815 2.99994 4.554 2.99994 4.15597 3.18223C3.68711 3.39696 3.26368 3.86322 3.09497 4.35054C2.95175 4.76423 2.99278 5.18937 3.07482 6.03964C3.94815 15.0901 8.91006 20.052 17.9605 20.9254C18.8108 21.0074 19.236 21.0484 19.6496 20.9052C20.137 20.7365 20.6032 20.3131 20.818 19.8442C21.0002 19.4462 21.0002 18.972 21.0002 18.0237C21.0002 17.3755 21.0002 17.0514 20.9124 16.7643C20.8023 16.4045 20.5933 16.0829 20.3092 15.8361C20.0826 15.6393 19.7864 15.5076 19.194 15.2443L18.288 14.8417C17.6465 14.5566 17.3257 14.414 16.9998 14.383C16.6878 14.3533 16.3733 14.3971 16.0813 14.5108C15.7762 14.6296 15.5066 14.8543 14.9672 15.3038C14.4304 15.7511 14.162 15.9748 13.834 16.0946C13.5432 16.2009 13.1588 16.2402 12.8526 16.1951C12.5071 16.1442 12.2426 16.0028 11.7135 15.7201C10.0675 14.8404 9.15977 13.9327 8.28011 12.2867C7.99738 11.7576 7.85602 11.4931 7.80511 11.1476C7.75998 10.8414 7.79932 10.457 7.90554 10.1662C8.02536 9.83822 8.24905 9.5698 8.69643 9.03294C9.14586 8.49362 9.37058 8.22396 9.48939 7.91885C9.60309 7.62688 9.64686 7.31234 9.61719 7.00042C9.58618 6.67446 9.44362 6.3537 9.1585 5.71217Z"/>',
);
const PIN = hugeicon(
  '<path d="M13.6177 21.367C13.1841 21.773 12.6044 22 12.0011 22C11.3978 22 10.8182 21.773 10.3845 21.367C6.41302 17.626 1.09076 13.4469 3.68627 7.37966C5.08963 4.09916 8.45834 2 12.0011 2C15.5439 2 18.9126 4.09916 20.316 7.37966C22.9082 13.4393 17.599 17.6389 13.6177 21.367Z"/>' +
    '<path d="M15.5 11C15.5 12.933 13.933 14.5 12 14.5C10.067 14.5 8.5 12.933 8.5 11C8.5 9.067 10.067 7.5 12 7.5C13.933 7.5 15.5 9.067 15.5 11Z"/>',
);
const IG = hugeicon(
  '<path d="M3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3C16.2426 3 18.364 3 19.682 4.31802C21 5.63604 21 7.75736 21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12Z"/>' +
    '<path d="M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z"/>' +
    '<path d="M17.3748 6.75024H17.2498"/>',
);

// A practice that has not uploaded a mark still needs a letterhead. Falling
// back to ADLM's logo would put our brand on their paper, so the name is set
// as a wordmark instead.
function lockup(brand, h) {
  if (brand.logo) {
    return `<img class="doc-logo" src="${esc(brand.logo)}" alt="${esc(brand.name)}" style="height:${h}pt">`;
  }
  return `<span class="doc-word" style="font-size:${h * 0.62}pt">${esc(brand.name)}</span>`;
}

function frame(t, brand, page, pages) {
  let h = '<div class="doc-frame">';
  if (t.band) {
    h += '<div class="doc-band"></div>';
    // Only the two things somebody reaches for while reading: where to look
    // it up, and what to ring. Everything else is footer (Richard, 5 Oct 2026).
    let contact = "";
    if (brand.site) contact += `<div>${GLOBE}<span>${esc(brand.site)}</span></div>`;
    if (brand.phone) contact += `<div>${CALL}<span>${esc(brand.phone)}</span></div>`;
    h +=
      `<div class="doc-head">${lockup(brand, 26.6)}` +
      (contact ? `<div class="doc-contact">${contact}</div>` : "") +
      "</div>";
  }
  h += '<div class="doc-tab"></div>';
  h +=
    '<div class="doc-mark doc-m-arc"></div>' +
    '<div class="doc-mark doc-m-ring"></div>' +
    '<div class="doc-mark doc-m-dot"></div>' +
    '<div class="doc-mark doc-m-grid"></div>' +
    '<div class="doc-mark doc-m-x"></div>' +
    (brand.mark ? `<div class="doc-mark doc-m-logo"><img src="${esc(brand.mark)}" alt=""></div>` : "");
  h += '<div class="doc-rule"></div>';
  // The small print: the registered address, the handle, the registration
  // number where there is one. A letterhead needs them on the sheet; it does
  // not need them above the first line of the letter.
  let foot = "";
  let addr = brand.address;
  if (typeof addr === "string") addr = [addr];
  if (addr && addr.length) {
    foot += `<span class="doc-foot-i">${PIN}<span>${addr.map(esc).join(" ")}</span></span>`;
  }
  if (brand.social) foot += `<span class="doc-foot-i">${IG}<span>${esc(brand.social)}</span></span>`;
  if (brand.reg) foot += `<span class="doc-foot-i">${esc(brand.reg)}</span>`;
  (brand.lines || []).forEach((l) => {
    foot += `<span class="doc-foot-i">${esc(l)}</span>`;
  });
  h +=
    '<div class="doc-pagefoot">' +
    `<span class="doc-foot">${foot}</span>` +
    `<span class="doc-credit">${brand.credit ? "Powered by ADLM Studio" : ""}</span>` +
    `<span class="doc-pageno">Page ${page} of ${pages}</span>` +
    "</div>";
  return `${h}</div>`;
}

// ── blocks ─────────────────────────────────────────────────────────────────

const cls = (a) => (a === "left" ? "doc-l" : a === "right" ? "doc-r" : "");

function table(b) {
  const cols = b.columns || [];
  let h =
    '<div class="doc-table-wrap"><table class="doc-table"><colgroup>' +
    cols.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ""}>`).join("") +
    "</colgroup><tbody>" +
    /* The header is an ordinary row, not a <thead>.
     *
     * A thead exists so a printer can lift the header out of the flow and
     * redraw it at the top of every fragment of a table. We do not want that:
     * paginate() splits the table itself and writes the header row into every
     * chunk, so each sheet already carries its own in the normal flow. Leaving
     * it a thead asks the browser to do the same job again, and Chrome's
     * repeated-header path lost it entirely in print preview — present in the
     * DOM, right on screen, gone on the page.
     *
     * The cells stay <th>, so the styling, the composer's cell indexing and
     * the table's meaning are all unchanged.
     */
    '<tr class="doc-hrow">' +
    cols.map((c) => `<th class="${cls(c.align)}">${esc(c.label)}</th>`).join("") +
    "</tr>";

  (b.rows || []).forEach((r) => {
    if (r && r.group) {
      h += `<tr class="doc-group"><td class="doc-l" colspan="${cols.length}">${esc(r.group)}</td></tr>`;
      return;
    }
    if (r && r.subtotal) {
      h +=
        '<tr class="doc-sub">' +
        `<td class="doc-l" colspan="${cols.length - 1}">${esc(r.subtotal)}</td>` +
        `<td class="doc-r">${esc(money(r.value))}</td></tr>`;
      return;
    }
    const cells = r && r.cells ? r.cells : r;
    h +=
      `<tr${r && r.unpriced ? ' class="doc-unpriced"' : ""}>` +
      cols
        .map((c, i) => {
          let v = cells[i];
          if (c.money && typeof v === "number") v = money(v);
          else if (c.num && typeof v === "number") v = num(v);
          return `<td class="${cls(c.align)}">${rich(v)}</td>`;
        })
        .join("") +
      "</tr>";
  });
  return `${h}</tbody></table></div>`;
}

function totals(b) {
  const rows = b.rows || [];
  return (
    '<div class="doc-totals">' +
    rows
      .map(([label, value, kind]) =>
        `<div class="doc-bar${kind ? ` doc-${kind}` : ""}">` +
        `<span>${esc(label)}</span>` +
        `<span class="doc-amt">${esc(money(value))}</span></div>`,
      )
      .join("") +
    "</div>"
  );
}

/**
 * Emphasis inside a line.
 *
 * Word keeps it in run properties and the composer keeps it in asterisks, so
 * both arrive here as **bold** and *italic*.
 *
 * Applied strictly AFTER escaping, so a document can never introduce markup:
 * the only two tags that can exist in the output are the two written here.
 * Added because a document whose labels — "Delivery:", "Duration:" — were bold
 * in Word arrived with the bold thrown away, which is half of what made an
 * imported document look flatter than the file it came from.
 */
export function rich(s) {
  return esc(s)
    .replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s([])\*([^*\n]+?)\*(?=[\s).,;:!?\]]|$)/g, "$1<i>$2</i>");
}

const BLOCKS = {
  /* Three levels, and each one a real size. There were two, and both were
     10pt — the same as body text — so a heading was body text in bold and a
     title was body text in bold capitals. A document that arrives with a
     title, six sections and eleven sub-sections had nowhere to put them.
     The tag follows the level too, so the outline is real to a reader. */
  heading: (b) => {
    const lvl = Math.min(3, Math.max(1, Number(b.level) || 2));
    return (
      `<h${lvl} class="doc-h doc-h-${lvl}${b.align === "center" ? " doc-c" : ""}">` +
      `${rich(b.text)}</h${lvl}>`
    );
  },
  para: (b) => `<p class="doc-p">${rich(b.text)}</p>`,
  bullets: (b) =>
    `<ul class="doc-ul">${(b.items || []).map((i) => `<li>${rich(i)}</li>`).join("")}</ul>`,
  // `lines` is an array of address lines. A caller passing a plain string is
  // an easy mistake to make and used to throw from inside .map, which takes
  // down the whole document rather than one block — so a string is treated as
  // the single line it obviously is.
  keyvalue: (b) => {
    const lines = Array.isArray(b.lines) ? b.lines : b.lines ? [b.lines] : [];
    return (
      `<div class="doc-kv"><span class="doc-k">${esc(b.label)}</span>` +
      `<span class="doc-v">${lines.map((l) => `<div>${rich(l)}</div>`).join("")}</span></div>`
    );
  },
  /**
   * A picture in the body of a document — a site photograph, a detail, a
   * screenshot of the model the takeoff came from.
   *
   * Deliberately never wider than the text measure and never taller than
   * about half a page: an image that breaks the column, or one that pushes
   * the paragraph after it onto a second sheet, makes the document look
   * assembled rather than written. loading="lazy" because a proposal with
   * eight photographs should not stall the preview while it draws.
   */
  image: (b) => {
    if (!b.src) return "";
    return (
      '<figure class="doc-figure">' +
      `<img src="${esc(b.src)}" alt="${esc(b.caption || "")}" loading="lazy">` +
      (b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : "") +
      "</figure>"
    );
  },
  hr: () => '<div class="doc-hr"></div>',
  spacer: (b) => `<div class="doc-spacer" style="height:${b.size || 12}pt"></div>`,
  table,
  totals,
  payment: (b, ctx) => {
    const bank = b.account ? b : ctx.brand.bank || {};
    return (
      '<div class="doc-pay"><b>Payment details:</b>' +
      `<div>Account no: ${esc(bank.account)}</div>` +
      `<div>Name: ${esc(bank.name)}</div>` +
      `<div>Bank: ${esc(bank.bank)}</div></div>`
    );
  },
  // OURS, not his: an optional QR beside the signature. `qr` is trusted markup
  // (an <svg> built by the caller), so it is the one value here that is not
  // escaped — everything a reader supplies still goes through esc().
  signature: (b, ctx) => {
    const img = b.image || ctx.brand.signature;
    const sign =
      '<div class="doc-sign">' +
      (img ? `<img src="${esc(img)}" alt="">` : '<div style="height:32.5pt"></div>') +
      '<div class="doc-line"></div>' +
      `<div class="doc-cap">${esc(b.label || "Authorized signature")}</div></div>`;
    if (!b.qr) return sign;
    return (
      `<div class="doc-signrow">${sign}` +
      `<div class="doc-qr">${b.qr}` +
      `<span>${esc(b.qrCaption || "Scan to open this quotation")}</span></div></div>`
    );
  },
};

// Payment and signature sit on one row pinned to the foot of the sheet.
function footRow(blocks, ctx) {
  let pay = null;
  let sig = null;
  const rest = [];
  const pinned = ctx && ctx.t && ctx.t.cls === "doc-invoice";
  blocks.forEach((b) => {
    if (b.type === "payment") pay = b;
    else if (b.type === "signature" && pinned) sig = b;
    else rest.push(b);
  });
  let row = "";
  if (pay || sig) {
    row =
      '<div class="doc-foot-row">' +
      (pay ? BLOCKS.payment(pay, ctx) : "<div></div>") +
      (sig ? BLOCKS.signature(sig, ctx) : "<div></div>") +
      "</div>";
  }
  return { blocks: rest, row };
}

const renderBlocks = (blocks, ctx) =>
  blocks
    .map((b) => {
      const fn = BLOCKS[b.type];
      return fn ? fn(b, ctx) : "";
    })
    .join("");

// The invoice carries its own head inside the flow rather than in the frame,
// because on that template the title is content: it changes per document.
const invoiceHead = (spec, brand) =>
  '<div class="doc-invhead">' +
  lockup(brand, 24) +
  `<div class="doc-title"><b>${esc(spec.title || "Invoice")}</b>` +
  (spec.number ? `<span>NO: ${esc(spec.number)}</span>` : "") +
  "</div></div>";

// ── render ─────────────────────────────────────────────────────────────────

export function render(spec) {
  spec = spec || {};
  const t = TEMPLATES[spec.template] || TEMPLATES.report;
  const brand = brandOf(spec);
  const ctx = { t, brand, spec };

  const f = footRow((spec.blocks || []).slice(), ctx);
  ctx.footRow = f.row;
  ctx.stamp = spec.stamp ? `<div class="doc-stamp">${esc(spec.stamp)}</div>` : "";

  let inner = "";
  if (t.cls === "doc-invoice") inner += invoiceHead(spec, brand);

  // Who it is from, when that is not simply the letterhead. Most documents do
  // not need it — the paper says who sent them. It earns its place when the
  // sender is a person or a department rather than the studio, or when the
  // document will be filed by somebody who needs a reply address on the face
  // of it rather than in the footer.
  //
  // The address is the one block that leaves the body column and sits on the
  // logo line, with the date opposite it. A document addressed to nobody — a
  // proposal, a report — simply has no address row and opens on its title.
  let addr = "";
  if (spec.from && spec.from.length) {
    addr += BLOCKS.keyvalue({ label: spec.fromLabel || "FROM:", lines: spec.from });
  }
  if (spec.to && spec.to.length) {
    addr += BLOCKS.keyvalue({ label: spec.toLabel || "INVOICE TO:", lines: spec.to });
  }
  if (spec.meta && spec.meta.length) {
    addr += BLOCKS.keyvalue({ label: spec.metaLabel || "DATE:", lines: spec.meta });
  }
  if (addr) {
    inner +=
      `<div class="doc-addr"><div>${addr}</div>` +
      (spec.date ? `<div class="doc-date">${esc(when(spec.date))}</div>` : "") +
      "</div>";
  }
  if (t.cls === "doc-invoice") inner += BLOCKS.hr();
  inner += renderBlocks(f.blocks, ctx);
  inner += f.row; // payment and signature, pinned to the foot

  return (
    `<div class="doc-sheet ${t.cls}" style="${paletteStyle(brand)}">` +
    frame(t, brand, 1, 1) +
    `<div class="doc-body">${inner}</div>` +
    ctx.stamp +
    "</div>"
  );
}

/**
 * Split one table wrapper into several, each carrying the header row.
 *
 * A chunk is only worth emitting if it can hold the header AND at least one
 * whole row. Without that rule, a table beginning near the foot of a page had
 * its header and first row pushed into whatever space was left regardless of
 * whether they fitted, and the sheet — which clips — sliced the row in half.
 * That is what the week-by-week table was doing at every page break: a header,
 * three lines of a five-line row, and then the next sheet starting the same
 * row again from the top.
 *
 * Returns null when there is nothing to do, so the caller can tell "it fits"
 * from "it has been divided".
 */
function splitTable(wrap, tbl, firstRoom, fullRoom) {
  const head = tbl.querySelector("tr.doc-hrow");
  const rows = [...tbl.querySelectorAll("tbody > tr:not(.doc-hrow)")];
  if (!head || !rows.length) return null;

  const headH = head.offsetHeight;
  const hs = rows.map((r) => r.offsetHeight);
  const all = hs.reduce((a, b) => a + b, 0);

  // Not even the header and one row fit in what is left, so the table starts
  // on the next sheet rather than leaving a stub behind.
  const newPage = firstRoom < headH + hs[0] + 2;
  if (!newPage && headH + all <= firstRoom) return null;

  const out = [];
  let bucket = [];
  let used = 0;
  let room = (newPage ? fullRoom : firstRoom) - headH;

  const flush = () => {
    if (!bucket.length) return;
    const w = wrap.cloneNode(false);
    const t = tbl.cloneNode(false);
    const cg = tbl.querySelector("colgroup");
    if (cg) t.appendChild(cg.cloneNode(true));
    const tb = document.createElement("tbody");
    // Into the body, because the header is one of its rows now.
    tb.appendChild(head.cloneNode(true));
    bucket.forEach((r) => tb.appendChild(r));
    t.appendChild(tb);
    w.appendChild(t);
    out.push({ el: w, height: headH + used });
    bucket = [];
    used = 0;
  };

  rows.forEach((r, i) => {
    // A row taller than a whole sheet cannot be placed anywhere; it gets a
    // sheet to itself rather than dragging a neighbour over the edge with it.
    if (used + hs[i] > room && bucket.length) {
      flush();
      room = fullRoom - headH;
    }
    bucket.push(r);
    used += hs[i];
  });
  flush();

  return out.length ? { chunks: out, newPage } : null;
}

// Render into a host element and paginate against the real geometry.
//
// Blocks are measured against the actual content box and distributed across as
// many sheets as they need; a table too tall for what is left is split row by
// row with its header re-emitted, so page 3 reads like page 1. That is the
// whole reason this is done here rather than left to the printer.
function paginate(host, ctx) {
  const sheets = host.querySelectorAll(".doc-sheet");
  if (!sheets.length) return;
  const first = sheets[0];
  const box = first.querySelector(".doc-body");
  if (!box) return;
  let limit = box.clientHeight;
  if (!limit) return;

  const foot = box.querySelector(".doc-foot-row");

  // Reserve the payment/signature row's height before measuring anything.
  //
  // It is pinned to the foot of the last sheet with position:absolute, so it
  // was lifted out of the flow and then not subtracted from the space the flow
  // was allowed to fill. On any document whose last page ran long, the copy
  // filled the box to the floor and the payment block printed straight over
  // the top of it — and because the overflow never became a second page, the
  // sheet still read "Page 1 of 1".
  const footH = foot ? foot.offsetHeight + 14 : 0;
  if (footH && footH < limit) limit -= footH;

  // Heights are whole pixels and a page holds a dozen blocks, so the rounding
  // accumulates: a page measuring as exactly full rendered three or four
  // pixels past its floor and clipped the last line.
  limit -= 5;

  if (foot) foot.parentNode.removeChild(foot);
  const footHTML = ctx.footRow || (foot ? foot.outerHTML : "");

  const pages = [[]];
  let used = 0;

  const outer = (el) => el.offsetHeight + (parseFloat(getComputedStyle(el).marginBottom) || 0);

  /* A heading is never the last thing on a sheet.
   *
   * paginate() placed blocks one at a time with no idea that a heading belongs
   * to what follows it, so a section title that happened to fit at the foot of
   * a page stayed there and its first clause started the next sheet. The policy
   * reissued on 26 Sep 2026 ended page 1 on "3 Access to the CEO" with the
   * section itself on page 2.
   *
   * When the next block has to start a new sheet, the headings sitting at the
   * foot of the current one go with it — but only if they and at least the
   * start of that block fit on a sheet together, so a carried heading can never
   * push anything past the floor. A sheet made only of headings keeps them.
   */
  const takeHeadings = (need) => {
    const cur = pages[pages.length - 1];
    let n = 0;
    let h = 0;
    while (n < cur.length - 1 && cur[cur.length - 1 - n].classList.contains("doc-h")) {
      h += outer(cur[cur.length - 1 - n]);
      n += 1;
    }
    if (!n || h + need > limit) return { els: [], height: 0 };
    return { els: cur.splice(cur.length - n, n), height: h };
  };

  [...box.children].forEach((el) => {
    const h = el.offsetHeight;
    const margin = parseFloat(getComputedStyle(el).marginBottom) || 0;
    if (used + h <= limit || !pages[pages.length - 1].length) {
      pages[pages.length - 1].push(el);
      used += h + margin;
      return;
    }
    const tbl = el.querySelector ? el.querySelector(".doc-table") : null;
    if (tbl) {
      let split = splitTable(el, tbl, limit - used, limit);
      let carried = { els: [], height: 0 };
      if (split && split.newPage) {
        // The table starts a fresh sheet, so any heading above it comes too.
        // Measured against the header row and first body row: that is the
        // least of the table a sheet may start with.
        const head = tbl.querySelector("tr.doc-hrow");
        const first = tbl.querySelector("tbody > tr:not(.doc-hrow)");
        const start = (head ? head.offsetHeight : 0) + (first ? first.offsetHeight : 0);
        carried = takeHeadings(start + 2);
        // Re-divide with the heading's height taken off the first sheet, so the
        // first chunk cannot run past the floor underneath it.
        if (carried.els.length) split = splitTable(el, tbl, limit - carried.height, limit) || split;
      }
      if (split) {
        if ((split.newPage || carried.els.length) && pages[pages.length - 1].length) {
          pages.push(carried.els);
        }
        split.chunks.forEach((c, n) => {
          if (n > 0) pages.push([]);
          pages[pages.length - 1].push(c.el);
        });
        // The chunks are not in the document yet, so their height cannot be
        // read off them — it is carried out of the split instead. Measuring a
        // detached node returns 0, which told every following block the page
        // was empty.
        used =
          split.chunks[split.chunks.length - 1].height +
          margin +
          (split.chunks.length === 1 ? carried.height : 0);
        return;
      }
    }
    const carried = takeHeadings(h);
    pages.push([...carried.els, el]);
    used = carried.height + h + margin;
  });

  // A trailing page with nothing on it is a sheet of letterhead somebody has
  // to throw away. It happens when the last block lands exactly on a boundary.
  while (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();

  const wrap = first.parentNode;
  const sheetCls = first.className;
  const made = [];
  pages.forEach((group, i) => {
    const sheet = document.createElement("div");
    sheet.className = sheetCls;
    sheet.setAttribute("style", ctx.palette || "");
    sheet.innerHTML = `${frame(ctx.t, ctx.brand, i + 1, pages.length)}<div class="doc-body"></div>`;
    const body = sheet.querySelector(".doc-body");
    group.forEach((el) => body.appendChild(el));
    if (i === pages.length - 1 && footHTML) body.insertAdjacentHTML("beforeend", footHTML);
    if (i === 0 && ctx.stamp) sheet.insertAdjacentHTML("beforeend", ctx.stamp);
    made.push(sheet);
  });
  [...sheets].forEach((s) => s.parentNode.removeChild(s));
  made.forEach((s) => wrap.appendChild(s));
}

export function mount(host, spec) {
  if (typeof host === "string") host = document.querySelector(host);
  if (!host) return null;
  const t = TEMPLATES[spec.template] || TEMPLATES.report;
  const brand = brandOf(spec);
  // t matters here: footRow only pins payment and signature on invoice-class
  // templates, so leaving it out would unpin the invoice's own foot row.
  const f = footRow((spec.blocks || []).slice(), { brand, t });
  host.innerHTML = render(spec);
  paginate(host, {
    t,
    brand,
    spec,
    footRow: f.row,
    palette: paletteStyle(brand),
    stamp: spec.stamp ? `<div class="doc-stamp">${esc(spec.stamp)}</div>` : "",
  });
  return host;
}

export default { render, mount, docNumber, money, num, when, esc };
