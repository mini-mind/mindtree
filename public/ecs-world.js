import { createComponentBag } from "./ecs-components.js";
import { getEcsPlugin } from "./ecs-plugin-registry.js";

function normalizePluginMount(mount) {
  if (!mount || typeof mount !== "object" || typeof mount.key !== "string" || !mount.key) {
    return null;
  }

  return {
    key: mount.key,
    config: mount.config && typeof mount.config === "object" ? { ...mount.config } : {},
  };
}

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

export function getEntityPluginMounts(entity) {
  return Array.isArray(entity?.plugins)
    ? entity.plugins.map(normalizePluginMount).filter(Boolean)
    : [];
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

export async function initializeEntity(world, entity) {
  ensureEntityRuntime(entity);
  for (const mount of getEntityPluginMounts(entity)) {
    const plugin = getEcsPlugin(mount.key);
    if (!plugin) {
      continue;
    }

    if (typeof plugin.createRuntimeComponent === "function") {
      ensureEntityRuntimeComponent(entity, mount.key, () => plugin.createRuntimeComponent(mount, entity));
    }

    if (typeof plugin.init === "function") {
      await plugin.init({
        world,
        entity,
        mount,
        runtimeComponent: ensureEntityRuntimeComponent(entity, mount.key),
      });
    }
  }
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

      for (const mount of getEntityPluginMounts(entity)) {
        const plugin = getEcsPlugin(mount.key);
        if (typeof plugin?.onEvent === "function") {
          await plugin.onEvent({
            world,
            entity,
            event,
            mount,
            runtimeComponent: ensureEntityRuntimeComponent(entity, mount.key),
          });
        }
      }
    }

    for (const mount of getEntityPluginMounts(entity)) {
      const plugin = getEcsPlugin(mount.key);
      if (typeof plugin?.step === "function") {
        await plugin.step({
          world,
          entity,
          mount,
          runtimeComponent: ensureEntityRuntimeComponent(entity, mount.key),
        });
      }
    }
  }

  return processed;
}

export function serializeRuntimelessGraph(graph) {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x || 0,
      y: node.y || 0,
      data: node.data && typeof node.data === "object" ? { ...node.data } : createComponentBag(),
      plugins: Array.isArray(node.plugins)
        ? node.plugins.map((plugin) => ({
            key: plugin.key,
            config: plugin.config && typeof plugin.config === "object" ? { ...plugin.config } : {},
          }))
        : [],
    })),
  };
}
