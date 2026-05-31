export function createCreateNodeController({ dialog, onCreate }) {
  let intent = null;

  return {
    open(nextIntent) {
      intent = nextIntent;
      dialog.showModal();
    },
    confirm() {
      if (!intent) {
        return false;
      }

      onCreate(intent);
      intent = null;
      dialog.close();
      return true;
    },
    clear() {
      intent = null;
    },
  };
}
