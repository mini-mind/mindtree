const ecsPluginRegistry = new Map();

export function registerEcsPlugin(plugin) {
  if (!plugin || typeof plugin !== "object" || !plugin.key || typeof plugin.key !== "string") {
    throw new Error("plugin.key is required");
  }

  ecsPluginRegistry.set(plugin.key, plugin);
  return plugin;
}

export function getEcsPlugin(key) {
  return ecsPluginRegistry.get(key) || null;
}
