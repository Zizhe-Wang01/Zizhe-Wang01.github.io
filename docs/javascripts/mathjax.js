window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"]],
    displayMath: [["\\[", "\\]"]],
    processEscapes: true,
    processEnvironments: true
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex"
  },
  startup: {
    typeset: false
  }
};

const mathJaxUrl = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
let mathJaxLoading = null;

function loadMathJax() {
  if (typeof window.MathJax?.typesetPromise === "function") {
    return Promise.resolve(window.MathJax);
  }
  if (mathJaxLoading) return mathJaxLoading;

  mathJaxLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = mathJaxUrl;
    script.async = true;
    script.dataset.mathjaxLoader = "true";
    script.addEventListener("load", async () => {
      try {
        await window.MathJax.startup.promise;
        resolve(window.MathJax);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error("MathJax 加载失败"));
    }, { once: true });
    document.head.append(script);
  }).catch((error) => {
    mathJaxLoading = null;
    throw error;
  });

  return mathJaxLoading;
}

async function typesetPageMath() {
  const content = document.querySelector(".md-content");
  if (!content?.querySelector(".arithmatex")) return;
  if (content.dataset.mathjaxProcessed === "true") return;

  content.dataset.mathjaxProcessed = "true";
  try {
    const mathJax = await loadMathJax();
    if (content.isConnected) await mathJax.typesetPromise([content]);
  } catch (error) {
    delete content.dataset.mathjaxProcessed;
    console.error(error);
  }
}

if (typeof document$ !== "undefined") {
  document$.subscribe(typesetPageMath);
} else {
  document.addEventListener("DOMContentLoaded", typesetPageMath);
}
