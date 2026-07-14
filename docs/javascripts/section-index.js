function enableSectionIndexLinks() {
  const desktop = window.matchMedia("(min-width: 76.25em)");

  document
    .querySelectorAll(".md-sidebar--primary .md-nav__item--nested")
    .forEach((section) => {
      const heading = section.querySelector(":scope > .md-nav__link[for]");
      const indexLink = section.querySelector(
        ":scope > .md-nav > .md-nav__list > .md-nav__item:first-child a.md-nav__link"
      );

      if (!heading || !indexLink) return;
      if (heading.dataset.sectionIndexEnabled === "true") return;

      section.classList.add("md-nav__item--section-index");
      heading.dataset.sectionIndexEnabled = "true";
      heading.setAttribute("role", "link");

      heading.addEventListener("click", (event) => {
        if (!desktop.matches) return;
        event.preventDefault();
        indexLink.click();
      });

      heading.addEventListener("keydown", (event) => {
        if (!desktop.matches || event.key !== "Enter") return;
        event.preventDefault();
        indexLink.click();
      });
    });
}

if (typeof document$ !== "undefined") {
  document$.subscribe(enableSectionIndexLinks);
} else {
  document.addEventListener("DOMContentLoaded", enableSectionIndexLinks);
}
