import { getEcsPlugin, listEcsPlugins } from "./ecs-plugin-registry.js";
import {
  listEntityPluginEntries,
  removeMountFromEntity,
  ROOT_PLUGIN_TARGET,
} from "./ecs-plugin-tree.js";

function uniqueKeys(keys = []) {
  return [...new Set(keys.filter((key) => typeof key === "string" && key))];
}

function deriveInstalledKeysFromEntries(installedEntries = []) {
  return uniqueKeys(installedEntries.map((entry) => entry.mount?.key));
}

function hasProvider(selectedKeys, requirementKey) {
  return selectedKeys.some((key) => {
    const plugin = getEcsPlugin(key);
    if (!plugin) {
      return false;
    }
    return key === requirementKey || plugin.meta.provides.includes(requirementKey);
  });
}

function pluginSatisfiesRequirement(plugin, requirementKey) {
  if (!plugin) {
    return false;
  }

  return plugin.key === requirementKey || plugin.meta.provides.includes(requirementKey);
}

export function listSelectablePluginsForTarget(targetKey = ROOT_PLUGIN_TARGET, installedKeys = []) {
  const knownKeys = uniqueKeys(installedKeys);
  return listEcsPlugins().filter((plugin) => {
    if (plugin.meta.selectable === false || !plugin.meta.mountTargets.includes(targetKey)) {
      return false;
    }

    if (knownKeys.includes(plugin.key)) {
      return false;
    }

    return true;
  });
}

export function listSelectablePluginsForEntries(targetKey = ROOT_PLUGIN_TARGET, installedEntries = []) {
  return listSelectablePluginsForTarget(targetKey, deriveInstalledKeysFromEntries(installedEntries));
}

export function resolvePluginAttachment(
  inputKeys = [],
  { installedKeys = [], targetKey = ROOT_PLUGIN_TARGET } = {}
) {
  const currentKeys = uniqueKeys(installedKeys);
  const requestedKeys = uniqueKeys(inputKeys);
  const resolvedKeys = new Set(currentKeys);
  const addedKeys = [];
  const queue = [...requestedKeys];

  while (queue.length) {
    const key = queue.shift();
    const plugin = getEcsPlugin(key);
    if (!plugin) {
      throw new Error(`unknown plugin: ${key}`);
    }

    if (!plugin.meta.mountTargets.includes(targetKey)) {
      throw new Error(`plugin "${key}" cannot be mounted on "${targetKey}"`);
    }

    for (const conflictKey of plugin.meta.conflicts) {
      if (resolvedKeys.has(conflictKey) || requestedKeys.includes(conflictKey)) {
        throw new Error(`plugin "${key}" conflicts with "${conflictKey}"`);
      }
    }

    if (resolvedKeys.has(key)) {
      continue;
    }

    resolvedKeys.add(key);
    addedKeys.push(key);
    plugin.meta.requires.forEach((requiredKey) => {
      if (!hasProvider([...resolvedKeys], requiredKey) && !queue.includes(requiredKey)) {
        queue.push(requiredKey);
      }
    });
  }

  const orderedKeys = uniqueKeys(
    listEcsPlugins()
      .map((plugin) => plugin.key)
      .filter((key) => addedKeys.includes(key))
  );

  return orderedKeys.map((key) => {
    const plugin = getEcsPlugin(key);
    return {
      key,
      config: { ...plugin.meta.defaultConfig },
    };
  });
}

export function resolvePluginAttachmentForEntries(
  inputKeys = [],
  { installedEntries = [], targetKey = ROOT_PLUGIN_TARGET } = {}
) {
  return resolvePluginAttachment(inputKeys, {
    installedKeys: deriveInstalledKeysFromEntries(installedEntries),
    targetKey,
  });
}

export function pruneUnusedImplicitPlugins(entity) {
  const removedPaths = [];
  let changed = true;

  while (changed) {
    changed = false;
    const entries = listEntityPluginEntries(entity).map((entry) => ({
      ...entry,
      plugin: getEcsPlugin(entry.mount.key),
    }));

    const removable = entries.filter((entry) => {
      if (!entry.plugin || entry.plugin.meta.selectable !== false) {
        return false;
      }

      if (Array.isArray(entry.mount.mounts) && entry.mount.mounts.length) {
        return false;
      }

      return !entries.some((otherEntry) => {
        if (otherEntry.path === entry.path || !otherEntry.plugin) {
          return false;
        }

        return otherEntry.plugin.meta.requires.some((requiredKey) =>
          pluginSatisfiesRequirement(entry.plugin, requiredKey)
        );
      });
    });

    removable.forEach((entry) => {
      if (removeMountFromEntity(entity, entry.path)) {
        removedPaths.push(entry.path);
        changed = true;
      }
    });
  }

  return removedPaths;
}
