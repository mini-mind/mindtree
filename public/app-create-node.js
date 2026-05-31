export function createCreateNodeController({ dialog, onCreate }) {
  let intent = null;
  let presetKey = "build";

  return {
    open(nextIntent) {
      intent = nextIntent;
      presetKey = "build";
      dialog.showModal();
    },
    setPreset(nextPresetKey) {
      presetKey = nextPresetKey || "build";
    },
    confirm() {
      if (!intent) {
        return false;
      }

      onCreate({
        ...intent,
        presetKey,
      });
      intent = null;
      presetKey = "build";
      dialog.close();
      return true;
    },
    clear() {
      intent = null;
      presetKey = "build";
    },
  };
}
