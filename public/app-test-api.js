export function createTestApi({
  graphCanvas,
  enqueueNodeMessage,
  connectNodes,
}) {
  return {
    getNodeScreenBox(id) {
      return graphCanvas.getNodeScreenBox(id);
    },
    async enqueueNodeMessage(targetNodeId, payload) {
      return enqueueNodeMessage(targetNodeId, payload);
    },
    async connectNodes(sourceNodeId, targetNodeId) {
      return connectNodes(sourceNodeId, targetNodeId);
    },
  };
}
