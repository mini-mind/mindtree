export function createComponentBag(initial = {}) {
  return initial && typeof initial === "object" ? { ...initial } : {};
}
