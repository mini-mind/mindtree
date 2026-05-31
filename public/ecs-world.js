import { getEcsPlugin } from "./ecs-plugin-registry.js";
import {
  getEntityPluginMounts,
  listEntityPluginEntries,
  listEntityPluginEntriesPostOrder,
  normalizePluginMount,
} from "./ecs-plugin-tree.js";

function ensureRuntimeNode(node) {
  if (!node.runtime || typeof node.runtime !== "object") {
    node.runtime = {};
  }

  if (!node.runtime.components || typeof node.runtime.components !== "object") {
    node.runtime.components = {};
  }

  if (!Array.isArray(node.runtime.eventQueue)) {
    node.runtime.eventQueue = [];
  }

  return node.runtime;
}

function ensureRuntimeLifecycle(node) {
  const runtime = ensureRuntimeNode(node);
  if (!runtime.lifecycle || typeof runtime.lifecycle !== "object") {
    runtime.lifecycle = {};
  }

  if (typeof runtime.lifecycle.mountSignature !== "string") {
    runtime.lifecycle.mountSignature = "";
  }

  return runtime.lifecycle;
}

function getEntityMountSignature(entity) {
  return JSON.stringify(getEntityPluginMounts(entity).map(normalizePluginMount));
}

export function createWorld(graph, services) {
  return {
    graph,
    services,
    tick: 0,
  };
}

export function getEntityById(world, entityId) {
  return world.graph.nodes.find((node) => node.id === entityId) || null;
}

export function ensureEntityRuntime(entity) {
  return ensureRuntimeNode(entity);
}

export function ensureEntityRuntimeComponent(entity, pluginKey, createValue = () => ({})) {
  const runtime = ensureEntityRuntime(entity);
  if (!runtime.components[pluginKey]) {
    runtime.components[pluginKey] = createValue();
  }

  return runtime.components[pluginKey];
}

export function getEntityRuntimeComponent(entity, pluginKey) {
  return ensureEntityRuntime(entity).components[pluginKey] || null;
}

export async function initializeEntity(world, entity) {
  ensureEntityRuntime(entity);
  const lifecycle = ensureRuntimeLifecycle(entity);
  const nextMountSignature = getEntityMountSignature(entity);
  if (lifecycle.mountSignature === nextMountSignature) {
    return false;
  }

  for (const entry of listEntityPluginEntries(entity)) {
    const plugin = getEcsPlugin(entry.mount.key);
    if (!plugin) {
      continue;
    }

    if (typeof plugin.createRuntimeComponent === "function") {
      ensureEntityRuntimeComponent(entity, entry.path, () =>
        plugin.createRuntimeComponent(entry.mount, entity)
      );
    }

    if (typeof plugin.init === "function") {
      await plugin.init({
        world,
        entity,
        mount: entry.mount,
        runtimeComponent: ensureEntityRuntimeComponent(entity, entry.path),
        mountPath: entry.path,
        targetPath: entry.parentPath,
        parentMount: entry.parentMount,
      });
    }
  }

  lifecycle.mountSignature = nextMountSignature;
  return true;
}

export function enqueueEntityEvent(entity, event) {
  const runtime = ensureEntityRuntime(entity);
  runtime.eventQueue.push(event);
}

export function emitEntityEvent(world, targetEntityId, event) {
  const entity = getEntityById(world, targetEntityId);
  if (!entity) {
    return false;
  }

  enqueueEntityEvent(entity, event);
  return true;
}

export async function stepWorld(world, maxEvents = 100) {
  let processed = 0;
  world.tick += 1;

  for (const entity of world.graph.nodes) {
    await initializeEntity(world, entity);
  }

  for (const entity of world.graph.nodes) {
    const runtime = ensureEntityRuntime(entity);
    while (runtime.eventQueue.length && processed < maxEvents) {
      const event = runtime.eventQueue.shift();
      processed += 1;

      for (const entry of listEntityPluginEntriesPostOrder(entity)) {
        const plugin = getEcsPlugin(entry.mount.key);
        if (typeof plugin?.onEvent === "function") {
          await plugin.onEvent({
            world,
            entity,
            event,
            mount: entry.mount,
            runtimeComponent: ensureEntityRuntimeComponent(entity, entry.path),
            mountPath: entry.path,
            targetPath: entry.parentPath,
            parentMount: entry.parentMount,
          });
        }
      }
    }

    for (const entry of listEntityPluginEntries(entity)) {
      const plugin = getEcsPlugin(entry.mount.key);
      if (typeof plugin?.step === "function") {
        await plugin.step({
          world,
          entity,
          mount: entry.mount,
          runtimeComponent: ensureEntityRuntimeComponent(entity, entry.path),
          mountPath: entry.path,
          targetPath: entry.parentPath,
          parentMount: entry.parentMount,
        });
      }
    }
  }

  return processed;
}
