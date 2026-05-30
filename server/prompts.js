function formatMessages(messages = []) {
  return messages
    .map((message) => `${message.role === "user" ? "输入" : "反馈"}：${message.content}`.trim())
    .filter(Boolean)
    .join("\n");
}

function formatEntity(entity, index = null) {
  const summary = entity?.data?.summary || "";
  const detail = formatMessages(entity?.data?.messages || []);
  const content = `${summary}\n${detail}`.trim();
  if (index === null) {
    return content;
  }
  return `${index + 1}. ${content}`.trim();
}

function formatLinkedEntities(linkedEntities = []) {
  return linkedEntities
    .map(
      (linkedEntity, index) =>
        `${index + 1}. [${linkedEntity.type}] ${formatEntity(linkedEntity.entity)}`.trim()
    )
    .join("\n\n");
}

module.exports = {
  formatMessages,
  formatEntity,
  formatLinkedEntities,
};
