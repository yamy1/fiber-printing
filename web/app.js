const docEl = document.querySelector("#doc");
const navEl = document.querySelector("#nav");
const crumbEl = document.querySelector("#crumb");
const findEl = document.querySelector("#find");
const railEl = document.querySelector("#rail");
const shadeEl = document.querySelector("#shade");
const menuBtn = document.querySelector("#menu");

let tree = [];
let flat = [];

function fileURL(path) {
  return new URL("../" + path, window.location.href).href;
}

async function loadText(path) {
  const response = await fetch(fileURL(path));
  if (!response.ok) throw new Error(String(response.status));
  return response.text();
}

function parseSummary(text) {
  const root = [];
  const stack = [{ depth: -1, children: root }];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(\s*)\*\s+\[([^\]]+)\]\(([^)]+)\)\s*$/);
    if (!match) continue;
    const node = {
      depth: Math.floor(match[1].length / 2),
      title: match[2],
      path: decodeURIComponent(match[3]),
      children: [],
    };
    while (stack[stack.length - 1].depth >= node.depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

function flatten(nodes, acc = []) {
  for (const node of nodes) {
    acc.push(node);
    flatten(node.children, acc);
  }
  return acc;
}

function currentPath() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  return raw || "README.md";
}

function parseBlocks(markdown) {
  const blocks = [];
  const chunks = markdown.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (lines.length === 1 && heading) {
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (lines.length === 1 && lines[0].trim() === "---") {
      blocks.push({ type: "hr" });
      continue;
    }
    const image = lines.length === 1 && lines[0].match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      blocks.push({ type: "img", alt: image[1], href: image[2] });
      continue;
    }
    if (lines.length >= 2 && lines.every((line) => line.trim().startsWith("|"))) {
      const rows = lines.map(parseTableRow).filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    if (lines.every((line) => line.startsWith("- "))) {
      blocks.push({
        type: "ul",
        items: lines.map((line) => parseItem(line.slice(2).trim())),
      });
      continue;
    }
    blocks.push({ type: "p", text: lines.join(" ") });
  }
  return blocks;
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function parseItem(text) {
  const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) return { text };
  return { text: match[1], href: match[2] };
}

function resolvePath(base, href) {
  const url = new URL(href, "http://wiki.local/" + base);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function mediaURL(base, href) {
  if (/^(https?:|data:)/i.test(href)) return href;
  return fileURL(resolvePath(base, href));
}

function makeImage(alt, href, base) {
  const image = document.createElement("img");
  image.alt = alt;
  image.src = mediaURL(base, href);
  return image;
}

function appendInline(parent, text, base) {
  const pattern = /(!\[([^\]]*)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parent.append(document.createTextNode(text.slice(last, match.index)));
    if (match[1]) {
      parent.append(makeImage(match[2], match[3], base));
    } else if (match[4]) {
      const strong = document.createElement("strong");
      strong.textContent = match[5];
      parent.append(strong);
    } else {
      const anchor = document.createElement("a");
      anchor.textContent = match[7];
      const href = match[8];
      if (href.endsWith(".md")) {
        anchor.href = "#/" + resolvePath(base, href);
      } else {
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
      }
      parent.append(anchor);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

function fiberTitle(text, small) {
  const heading = document.createElement("h1");
  heading.className = small ? "fiber-title small" : "fiber-title";
  const span = document.createElement("span");
  span.dataset.text = text;
  span.textContent = text;
  heading.append(span);
  return heading;
}

function plate(href, title, index) {
  const anchor = document.createElement("a");
  anchor.className = "plate";
  anchor.href = href;
  const num = document.createElement("span");
  num.className = "plate-index";
  num.textContent = String(index).padStart(2, "0");
  const name = document.createElement("span");
  name.className = "plate-title";
  name.textContent = title;
  anchor.append(num, name);
  return anchor;
}

function renderPlates(items, base) {
  const grid = document.createElement("div");
  grid.className = "plates";
  items.forEach((item, index) => {
    const href = item.href.endsWith(".md") ? "#/" + resolvePath(base, item.href) : item.href;
    grid.append(plate(href, item.text, index + 1));
  });
  return grid;
}

function renderArticle(blocks, base) {
  const prose = document.createElement("div");
  prose.className = "prose";
  for (const block of blocks) {
    if (block.type === "h") {
      const heading = document.createElement(block.level === 1 ? "h2" : "h3");
      appendInline(heading, block.text, base);
      prose.append(heading);
      continue;
    }
    if (block.type === "hr") {
      prose.append(document.createElement("hr"));
      continue;
    }
    if (block.type === "table") {
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      const table = document.createElement("table");
      block.rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        row.forEach((cell) => {
          const td = document.createElement(index === 0 ? "th" : "td");
          appendInline(td, cell, base);
          tr.append(td);
        });
        table.append(tr);
      });
      wrap.append(table);
      prose.append(wrap);
      continue;
    }
    if (block.type === "img") {
      const figure = document.createElement("figure");
      figure.append(makeImage(block.alt, block.href, base));
      if (block.alt) {
        const caption = document.createElement("figcaption");
        caption.textContent = block.alt;
        figure.append(caption);
      }
      prose.append(figure);
      continue;
    }
    if (block.type === "ul") {
      const list = document.createElement("ul");
      for (const item of block.items) {
        const li = document.createElement("li");
        if (item.href) appendInline(li, `[${item.text}](${item.href})`, base);
        else appendInline(li, item.text, base);
        list.append(li);
      }
      prose.append(list);
      continue;
    }
    const paragraph = document.createElement("p");
    appendInline(paragraph, block.text, base);
    prose.append(paragraph);
  }
  return prose;
}

function neighbors(path) {
  const index = flat.findIndex((node) => node.path === path);
  return {
    prev: index > 0 ? flat[index - 1] : null,
    next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null,
  };
}

function renderPager(path) {
  const { prev, next } = neighbors(path);
  if (!prev && !next) return null;
  const bar = document.createElement("div");
  bar.className = "pager";
  for (const [item, label] of [[prev, "上一篇"], [next, "下一篇"]]) {
    if (!item) {
      bar.append(document.createElement("span"));
      continue;
    }
    const anchor = document.createElement("a");
    anchor.href = "#/" + item.path;
    const small = document.createElement("small");
    small.textContent = label;
    anchor.append(small, document.createTextNode(item.title));
    bar.append(anchor);
  }
  return bar;
}

function renderPage(path, markdown) {
  const blocks = parseBlocks(markdown);
  const title = blocks.find((block) => block.type === "h")?.text || path;
  docEl.replaceChildren();
  const node = flat.find((item) => item.path === path);
  const parent = tree.find((group) => group.children.some((child) => child.path === path));
  crumbEl.textContent = parent ? `${parent.title}  /  ${node ? node.title : title}` : (node ? node.title : title);

  const linkList = blocks.find((block) => block.type === "ul" && block.items.every((item) => item.href));
  const onlyIndex = blocks.length === 2 && blocks[0].type === "h" && blocks[1] === linkList;

  if (path === "README.md") {
    docEl.append(fiberTitle(title, false));
    const lede = blocks.find((block) => block.type === "p");
    if (lede) {
      const paragraph = document.createElement("p");
      paragraph.className = "lede";
      appendInline(paragraph, lede.text, path);
      docEl.append(paragraph);
    }
    if (linkList) docEl.append(renderPlates(linkList.items, path));
  } else if (onlyIndex && linkList) {
    docEl.append(fiberTitle(title, true));
    docEl.append(renderPlates(linkList.items, path));
  } else {
    docEl.append(fiberTitle(title, true));
    const rest = blocks[0]?.type === "h" ? blocks.slice(1) : blocks;
    docEl.append(renderArticle(rest, path));
  }

  const pager = renderPager(path);
  if (pager) docEl.append(pager);
  document.title = `${title} · 连续纤维打印`;
  markActive(path);
}

function markActive(path) {
  for (const link of navEl.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.path === path);
  }
}

function renderNav(query) {
  const needle = query.trim().toLowerCase();
  navEl.replaceChildren();
  for (const node of tree) {
    const group = document.createElement("div");
    group.className = "group";
    const selfMatch = !needle || node.title.toLowerCase().includes(needle);
    const kids = node.children.filter((child) => !needle || child.title.toLowerCase().includes(needle) || selfMatch);
    if (needle && !selfMatch && kids.length === 0) continue;
    if (node.children.length) {
      const label = document.createElement("a");
      label.className = "group-label";
      label.href = "#/" + node.path;
      label.dataset.path = node.path;
      label.textContent = node.title;
      group.append(label);
      for (const child of (needle ? kids : node.children)) {
        if (needle && !selfMatch && !child.title.toLowerCase().includes(needle)) continue;
        group.append(navLink(child, true));
      }
    } else {
      group.append(navLink(node, false));
    }
    navEl.append(group);
  }
  markActive(currentPath());
}

function navLink(node, child) {
  const anchor = document.createElement("a");
  anchor.className = child ? "nav-link child" : "nav-link";
  anchor.href = "#/" + node.path;
  anchor.dataset.path = node.path;
  anchor.textContent = node.title;
  return anchor;
}

function closeRail() {
  railEl.classList.remove("open");
  shadeEl.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}

async function show(path) {
  try {
    const markdown = await loadText(path);
    renderPage(path, markdown);
  } catch (error) {
    docEl.replaceChildren();
    const failure = document.createElement("p");
    failure.className = "status";
    failure.textContent = "这一页没有打开。从仓库根目录启动页面后再试。";
    docEl.append(failure);
  }
  closeRail();
  window.scrollTo(0, 0);
}

menuBtn.addEventListener("click", () => {
  const open = railEl.classList.toggle("open");
  shadeEl.hidden = !open;
  menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
});
shadeEl.addEventListener("click", closeRail);
findEl.addEventListener("input", () => renderNav(findEl.value));
window.addEventListener("hashchange", () => show(currentPath()));

loadText("SUMMARY.md").then((text) => {
  tree = parseSummary(text);
  flat = flatten(tree);
  renderNav("");
  show(currentPath());
}).catch(() => {
  const failure = document.createElement("p");
  failure.className = "status";
  failure.textContent = "目录没有载入。请在仓库根目录运行本地页面。";
  docEl.append(failure);
});
