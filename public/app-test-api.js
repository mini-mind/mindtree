export function createTestApi({
  graphCanvas,
  enqueueNodeMessage,
}) {
  return {
    getNodeScreenBox(id) {
      return graphCanvas.getNodeScreenBox(id);
    },
    async enqueueNodeMessage(targetNodeId, payload) {
      return enqueueNodeMessage(targetNodeId, payload);
    },
  };
}
