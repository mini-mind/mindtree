export const ROOT_PLUGIN_TARGET = "node";

function normalizePluginMounts(mounts) {
  return Array.isArray(mounts) ? mounts.map(normalizePluginMount).filter(Boolean) : [];
}

export function normalizePluginMount(mount) {
  if (!mount || typeof mount !== "object" || typeof mount.key !== "string" || !mount.key) {
    return null;
  }

  return {
    key: mount.key,
    config: mount.config && typeof mount.config === "object" ? { ...mount.config } : {},
    mounts: normalizePluginMounts(mount.mounts),
  };
}

export function getEntityPluginMounts(entity) {
  return normalizePluginMounts(entity?.mounts);
}

export function buildPluginMountPath(parentPath, mountKey) {
  return parentPath === ROOT_PLUGIN_TARGET ? mountKey : `${parentPath}/${mountKey}`;
}

function walkPluginMounts(mounts, parentPath, parentMount, depth, entries) {
  mounts.forEach((mount) => {
    const path = buildPluginMountPath(parentPath, mount.key);
    entries.push({
      mount,
      path,
      depth,
      parentPath,
      parentMount,
      targetKey: mount.key,
    });
    walkPluginMounts(normalizePluginMounts(mount.mounts), path, mount, depth + 1, entries);
  });
}

export function listEntityPluginEntries(entity) {
  const entries = [];
  walkPluginMounts(getEntityPluginMounts(entity), ROOT_PLUGIN_TARGET, null, 0, entries);
  return entries;
}

export function listEntityPluginEntriesPostOrder(entity) {
  return [...listEntityPluginEntries(entity)].sort((left, right) => right.depth - left.depth);
}

export function getEntityPluginKeys(entity) {
  return listEntityPluginEntries(entity).map((entry) => entry.mount.key);
}

export function countEntityPluginMounts(entity) {
  return listEntityPluginEntries(entity).length;
}

export function hasEntityPlugin(entity, pluginKey) {
  return listEntityPluginEntries(entity).some((entry) => entry.mount.key === pluginKey);
}

export function getEntityPluginMountByPath(entity, targetPath) {
  return listEntityPluginEntries(entity).find((entry) => entry.path === targetPath)?.mount || null;
}

function walkRawMounts(mounts, parentPath, entries) {
  if (!Array.isArray(mounts)) {
    return;
  }

  mounts.forEach((mount) => {
    if (!mount || typeof mount !== "object" || typeof mount.key !== "string" || !mount.key) {
      return;
    }

    const path = buildPluginMountPath(parentPath, mount.key);
    entries.push({ mount, path });
    walkRawMounts(mount.mounts, path, entries);
  });
}

function getRawEntityPluginMountByPath(entity, targetPath) {
  const entries = [];
  walkRawMounts(entity?.mounts, ROOT_PLUGIN_TARGET, entries);
  return entries.find((entry) => entry.path === targetPath)?.mount || null;
}

export function attachMountsToEntity(entity, targetPath, mounts) {
  const normalizedMounts = normalizePluginMounts(mounts);
  if (!normalizedMounts.length) {
    return false;
  }

  if (targetPath === ROOT_PLUGIN_TARGET) {
    entity.mounts = [...getEntityPluginMounts(entity), ...normalizedMounts];
    return true;
  }

  const targetMount = getRawEntityPluginMountByPath(entity, targetPath);
  if (!targetMount) {
    return false;
  }

  targetMount.mounts = [...normalizePluginMounts(targetMount.mounts), ...normalizedMounts];
  return true;
}

export function removeMountFromEntity(entity, targetPath) {
  if (targetPath === ROOT_PLUGIN_TARGET || !Array.isArray(entity?.mounts)) {
    return false;
  }

  function removeFromList(mounts, parentPath) {
    for (let index = 0; index < mounts.length; index += 1) {
      const mount = mounts[index];
      if (!mount || typeof mount !== "object" || typeof mount.key !== "string" || !mount.key) {
        continue;
      }

      const path = buildPluginMountPath(parentPath, mount.key);
      if (path === targetPath) {
        mounts.splice(index, 1);
        return true;
      }

      if (Array.isArray(mount.mounts) && removeFromList(mount.mounts, path)) {
        return true;
      }
    }

    return false;
  }

  return removeFromList(entity.mounts, ROOT_PLUGIN_TARGET);
}

export function updateMountConfigInEntity(entity, targetPath, nextConfig = {}) {
  if (targetPath === ROOT_PLUGIN_TARGET) {
    return false;
  }

  const targetMount = getRawEntityPluginMountByPath(entity, targetPath);
  if (!targetMount) {
    return false;
  }

  targetMount.config = {
    ...(targetMount.config && typeof targetMount.config === "object" ? targetMount.config : {}),
    ...(nextConfig && typeof nextConfig === "object" ? nextConfig : {}),
  };
  return true;
}
