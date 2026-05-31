import { clearStoredGraph, loadGraph } from "./config-store.js";
import { createInitialGraphDocument, normalizeGraph } from "./graph-model.js";
import { GraphValidationError } from "./graph-validation.js";

export function restoreGraphFromStorage({ onCorruptedGraph }) {
  try {
    return normalizeGraph(loadGraph() || createInitialGraphDocument());
  } catch (error) {
    if (!(error instanceof GraphValidationError)) {
      throw error;
    }

    clearStoredGraph();
    onCorruptedGraph?.(error);
    return createInitialGraphDocument();
  }
}

export async function fetchServerDefaultConfig() {
  try {
    const response = await fetch("/api/default-config");
    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}
