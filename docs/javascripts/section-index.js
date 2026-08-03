function normalizeEmptyNestedSections() {
  const sections = document.querySelectorAll(
    ".md-sidebar--primary .md-nav__item--nested .md-nav__item--nested"
  );

  sections.forEach((section) => {
    const container = section.querySelector(":scope > .md-nav__container");
    const toggle = section.querySelector(":scope > input.md-nav__toggle");
    const childNav = section.querySelector(":scope > nav.md-nav");
    const childList = childNav?.querySelector(":scope > .md-nav__list");
    const indexLink = container?.querySelector(":scope > a.md-nav__link");

    if (!container || !toggle || !childNav || !childList || !indexLink) return;
    if (childList.children.length > 0) return;

    const indexItem = document.createElement("li");
    indexItem.className = "md-nav__item";
    if (indexLink.classList.contains("md-nav__link--active")) {
      indexItem.classList.add("md-nav__item--active");
    }
    indexItem.append(indexLink.cloneNode(true));
    childList.append(indexItem);

    const heading = document.createElement("label");
    heading.className = "md-nav__link";
    heading.htmlFor = toggle.id;
    heading.id = `${toggle.id}_label`;
    heading.tabIndex = 0;

    const title = indexLink.querySelector(".md-ellipsis");
    if (title) heading.append(title.cloneNode(true));
    else heading.append(indexLink.textContent.trim());

    const icon = document.createElement("span");
    icon.className = "md-nav__icon md-icon";
    heading.append(icon);
    container.replaceWith(heading);
    childNav.setAttribute("aria-labelledby", heading.id);
  });
}

function enableSectionIndexLinks() {
  const desktop = window.matchMedia("(min-width: 76.25em)");

  normalizeEmptyNestedSections();

  const sections = document.querySelectorAll(
    ".md-sidebar--primary .md-nav__item--nested"
  );

  sections.forEach((section) => {
    const heading = section.querySelector(":scope > .md-nav__link[for]");
    const indexLink = section.querySelector(
      ":scope > .md-nav > .md-nav__list > .md-nav__item:first-child a.md-nav__link"
    );

    if (!heading || !indexLink) return;
    if (heading.dataset.sectionIndexEnabled === "true") return;

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
