function prepareMarkmaps() {
  const sources = document.querySelectorAll("pre.markmap-source:not([data-markmap-ready])");

  sources.forEach((source) => {
    source.dataset.markmapReady = "true";

    const markdown = source.querySelector("code")?.textContent ?? "";
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] ?? "思维导图";
    const container = document.createElement("div");
    const template = document.createElement("script");

    container.className = "markmap";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", `${title}思维导图`);
    template.type = "text/template";
    template.textContent = markdown;
    container.append(template);
    source.replaceWith(container);
  });
}

function fitFullscreenMarkmap() {
  const fullscreen = document.fullscreenElement;
  const fitButton = fullscreen?.querySelector(
    '.mm-toolbar-item[title="Fit window size"]'
  );

  if (fitButton) {
    window.setTimeout(() => fitButton.click(), 120);
  }
}

function updateFullscreenButtons() {
  document.querySelectorAll(".markmap-fullscreen").forEach((button) => {
    const active = document.fullscreenElement === button.closest(".markmap");
    const label = active ? "退出全屏" : "全屏查看";

    button.classList.toggle("is-active", active);
    button.setAttribute("aria-label", label);
    button.title = label;
  });

  fitFullscreenMarkmap();
}

function addFullscreenButtons() {
  if (!document.fullscreenEnabled) return;

  document.querySelectorAll(".markmap:not(:has(.markmap-fullscreen))").forEach(
    (container) => {
      const button = document.createElement("button");

      button.className = "markmap-fullscreen";
      button.type = "button";
      button.title = "全屏查看";
      button.setAttribute("aria-label", "全屏查看");
      button.innerHTML = `
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 3H3v5h2V5h3V3Zm8 0v2h3v3h2V3h-5ZM5 16H3v5h5v-2H5v-3Zm16 0h-2v3h-3v2h5v-5Z" />
        </svg>
      `;
      button.addEventListener("click", async () => {
        if (document.fullscreenElement === container) {
          await document.exitFullscreen();
        } else {
          await container.requestFullscreen();
        }
      });
      container.append(button);
    }
  );
}

async function renderMarkmaps() {
  prepareMarkmaps();

  if (window.markmap?.autoLoader?.renderAll) {
    await window.markmap.autoLoader.renderAll();
    addFullscreenButtons();
  }
}

document.addEventListener("fullscreenchange", updateFullscreenButtons);

if (typeof document$ !== "undefined") {
  document$.subscribe(renderMarkmaps);
} else {
  document.addEventListener("DOMContentLoaded", renderMarkmaps);
}
