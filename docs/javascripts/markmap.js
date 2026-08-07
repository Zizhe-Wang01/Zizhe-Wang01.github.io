function prepareMarkmaps() {
  const sources = document.querySelectorAll("pre.markmap-source:not([data-markmap-ready])");

  sources.forEach((source) => {
    source.dataset.markmapReady = "true";

    const markdown = source.querySelector("code")?.textContent ?? "";
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] ?? "思维导图";
    const container = document.createElement("div");
    const template = document.createElement("script");

    container.className = "markmap";
    container.setAttribute("role", "img");
    container.setAttribute("aria-label", `${title}思维导图`);
    template.type = "text/template";
    template.textContent = markdown;
    container.append(template);
    source.replaceWith(container);
  });
}

function renderMarkmaps() {
  prepareMarkmaps();

  if (window.markmap?.autoLoader?.renderAll) {
    window.markmap.autoLoader.renderAll();
  }
}

if (typeof document$ !== "undefined") {
  document$.subscribe(renderMarkmaps);
} else {
  document.addEventListener("DOMContentLoaded", renderMarkmaps);
}
