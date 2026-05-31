const ecsPluginRegistry = new Map();

export function registerEcsPlugin(plugin) {
  if (!plugin || typeof plugin !== "object" || !plugin.key || typeof plugin.key !== "string") {
    throw new Error("plugin.key is required");
  }

  const meta = plugin.meta && typeof plugin.meta === "object" ? plugin.meta : {};
  ecsPluginRegistry.set(plugin.key, plugin);
  plugin.meta = {
    label: typeof meta.label === "string" && meta.label ? meta.label : plugin.key,
    description: typeof meta.description === "string" ? meta.description : "",
    category: typeof meta.category === "string" && meta.category ? meta.category : "capability",
    mountTargets: Array.isArray(meta.mountTargets) && meta.mountTargets.length ? [...meta.mountTargets] : ["node"],
    requires: Array.isArray(meta.requires) ? [...meta.requires] : [],
    conflicts: Array.isArray(meta.conflicts) ? [...meta.conflicts] : [],
    provides: Array.isArray(meta.provides) ? [...meta.provides] : [],
    dialog:
      meta.dialog && typeof meta.dialog === "object"
        ? {
            submit: meta.dialog.submit === true,
          }
        : {},
    selectable: meta.selectable !== false,
    defaultConfig: meta.defaultConfig && typeof meta.defaultConfig === "object" ? { ...meta.defaultConfig } : {},
    configFields: Array.isArray(meta.configFields)
      ? meta.configFields
          .filter((field) => field && typeof field === "object" && typeof field.key === "string" && field.key)
          .map((field) => ({
            key: field.key,
            label: typeof field.label === "string" && field.label ? field.label : field.key,
            type: field.type === "textarea" ? "textarea" : "text",
            placeholder: typeof field.placeholder === "string" ? field.placeholder : "",
            description: typeof field.description === "string" ? field.description : "",
          }))
      : [],
  };
  return plugin;
}

export function getEcsPlugin(key) {
  return ecsPluginRegistry.get(key) || null;
}

export function listEcsPlugins() {
  return [...ecsPluginRegistry.values()];
}
