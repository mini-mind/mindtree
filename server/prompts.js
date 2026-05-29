function formatMessages(messages = []) {
  return messages
    .map((message) => `${message.role === "user" ? "输入" : "反馈"}：${message.content}`.trim())
    .filter(Boolean)
    .join("\n");
}

function formatNode(node, index = null) {
  const summary = node?.data?.summary || "";
  const detail = formatMessages(node?.data?.messages || []);
  const content = `${summary}\n${detail}`.trim();
  if (index === null) {
    return content;
  }
  return `${index + 1}. ${content}`.trim();
}

function formatRelations(relations = []) {
  return relations
    .map((relation, index) => `${index + 1}. [${relation.type}] ${formatNode(relation.node)}`.trim())
    .join("\n\n");
}

module.exports = {
  formatMessages,
  formatNode,
  formatRelations,
};
