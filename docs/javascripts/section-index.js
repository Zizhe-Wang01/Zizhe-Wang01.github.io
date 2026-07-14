function enableSectionIndexLinks() {
  const desktop = window.matchMedia("(min-width: 76.25em)");

  document
    .querySelectorAll(".md-sidebar--primary .md-nav__item--section")
    .forEach((section) => {
      const heading = section.querySelector(":scope > .md-nav__link[for]");
      const indexLink = section.querySelector(
        ":scope > .md-nav > .md-nav__list > .md-nav__item:first-child a.md-nav__link"
      );

      if (!heading || !indexLink) return;

      heading.setAttribute("role", "link");

      heading.addEventListener("click", (event) => {
        if (!desktop.matches) return;
        event.preventDefault();
        window.location.href = indexLink.href;
      });

      heading.addEventListener("keydown", (event) => {
        if (!desktop.matches || event.key !== "Enter") return;
        event.preventDefault();
        window.location.href = indexLink.href;
      });
    });
}

document.addEventListener("DOMContentLoaded", enableSectionIndexLinks);
