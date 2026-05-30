const ecsUiRegistry = new Map();

export function registerEcsUiComponent(key, renderer) {
  if (!key || typeof key !== "string") {
    throw new Error("ui component key is required");
  }

  if (typeof renderer !== "function") {
    throw new Error(`ui component "${key}" must be a function`);
  }

  ecsUiRegistry.set(key, renderer);
  return renderer;
}

export function getEcsUiComponent(key) {
  return ecsUiRegistry.get(key) || null;
}
