function normalizeSelectedIds(ids = []) {
  return [...new Set(ids.filter((id) => Number.isFinite(id)))];
}

export function createSelectionController(initialSelectedIds = []) {
  let selectedIds = normalizeSelectedIds(initialSelectedIds);

  return {
    set(nextSelectedIds = []) {
      selectedIds = normalizeSelectedIds(nextSelectedIds);
    },
    get() {
      return {
        selectedId: selectedIds[0] ?? null,
        selectedIds: [...selectedIds],
      };
    },
    selectSingle(id) {
      selectedIds = id === null ? [] : normalizeSelectedIds([id]);
    },
    clear() {
      selectedIds = [];
    },
  };
}
