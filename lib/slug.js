export function slugify(s) {
  const base = (s || "imovel")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "imovel";
}

export function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
