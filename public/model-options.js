export function getModelCapabilities(modelCapabilities, model) {
  return modelCapabilities[model] || { options: [] };
}

export function getModelOptionDefaults(modelCapabilities, model) {
  return getModelCapabilities(modelCapabilities, model).options.reduce(
    (accumulator, option) => {
      accumulator[option.key] = option.defaultValue;
      return accumulator;
    },
    {}
  );
}

export function normalizeOptionValue(option, value) {
  if (option.type === "boolean") {
    return value !== false && value !== "false";
  }

  if (option.type === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : option.defaultValue;
  }

  if (option.type === "select") {
    return option.choices.includes(value) ? value : option.defaultValue;
  }

  return typeof value === "string" ? value : option.defaultValue;
}
