import {
  getModelCapabilities,
  getModelOptionDefaults,
  normalizeOptionValue,
} from "./model-options.js";

export function createEmptyAgentOverrides(agentDefinitions) {
  return agentDefinitions.reduce((accumulator, agent) => {
    accumulator[agent.key] = {};
    return accumulator;
  }, {});
}

function normalizeTextValue(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeStoredConfig(agentDefinitions, config = {}) {
  const normalized = {
    baseUrl: normalizeTextValue(config.baseUrl),
    apiKey: normalizeTextValue(config.apiKey),
    model: normalizeTextValue(config.model),
    agents: createEmptyAgentOverrides(agentDefinitions),
  };

  agentDefinitions.forEach((agent) => {
    const existing = config.agents?.[agent.key];
    if (existing && typeof existing === "object") {
      normalized.agents[agent.key] = {
        baseUrl: normalizeTextValue(existing.baseUrl),
        apiKey: normalizeTextValue(existing.apiKey),
        model: normalizeTextValue(existing.model),
      };
    }
  });

  return normalized;
}

export function buildInitialConfig(agentDefinitions, baseConfig, storedConfig, capabilities) {
  const normalizedStored = normalizeStoredConfig(agentDefinitions, storedConfig);
  const resolvedBaseUrl = normalizedStored.baseUrl || baseConfig.baseUrl;
  const resolvedApiKey = normalizedStored.apiKey || baseConfig.apiKey;
  const resolvedModel = normalizedStored.model || baseConfig.model;
  return {
    ...baseConfig,
    ...getModelOptionDefaults(capabilities, baseConfig.model),
    baseUrl: resolvedBaseUrl,
    apiKey: resolvedApiKey,
    model: resolvedModel,
    agents: {
      ...createEmptyAgentOverrides(agentDefinitions),
      ...(normalizedStored.agents || {}),
    },
    ...getModelOptionDefaults(capabilities, resolvedModel),
  };
}

function createAgentField(id, labelText, placeholder) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";

  const label = document.createElement("span");
  label.textContent = labelText;
  wrapper.appendChild(label);

  const input = document.createElement("input");
  input.id = id;
  input.type = labelText === "API Key" ? "password" : "text";
  input.placeholder = placeholder;
  wrapper.appendChild(input);

  return { wrapper, input };
}

export function createLlmConfigController({
  agentDefinitions,
  elements,
  serverConfig,
  getConfig,
  setConfig,
  getKnownModels,
  getModelCapabilitiesMap,
}) {
  let activeTab = "base";
  let agentInputs = {};
  let dynamicOptionInputs = {};

  function getCurrentModelOptions(model) {
    return getModelCapabilities(getModelCapabilitiesMap(), model);
  }

  function buildEffectiveAgentConfig(agentKey) {
    const config = getConfig();
    const override = config.agents?.[agentKey] || {};
    return {
      baseUrl: override.baseUrl || config.baseUrl,
      apiKey: override.apiKey || config.apiKey,
      model: override.model || config.model,
    };
  }

  function syncTabs() {
    const isBaseTab = activeTab === "base";
    elements.configTabTriggerBase.classList.toggle("is-active", isBaseTab);
    document.getElementById("config-panel-base").classList.toggle("is-active", isBaseTab);

    agentDefinitions.forEach((agent) => {
      const input = agentInputs[agent.key];
      if (!input) {
        return;
      }
      const isActive = activeTab === agent.key;
      input.tab.classList.toggle("is-active", isActive);
      input.panel.classList.toggle("is-active", isActive);
    });
  }

  function renderAgentPanels() {
    elements.configAgentTabs.innerHTML = "";
    elements.configAgentPanels.innerHTML = "";
    agentInputs = {};

    agentDefinitions.forEach((agent) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "config-tab";
      tab.dataset.configTab = agent.key;
      tab.textContent = agent.label;
      tab.addEventListener("click", () => {
        activeTab = agent.key;
        syncTabs();
      });
      elements.configAgentTabs.appendChild(tab);

      const panel = document.createElement("section");
      panel.id = `config-panel-${agent.key}`;
      panel.className = "config-panel";

      const section = document.createElement("div");
      section.className = "config-section";

      const title = document.createElement("p");
      title.className = "section-title";
      title.textContent = `${agent.label} 覆盖`;
      section.appendChild(title);

      const hint = document.createElement("p");
      hint.className = "config-hint";
      hint.textContent = "留空则继承基础配置。";
      section.appendChild(hint);

      const baseUrl = createAgentField(
        `cfg-agent-${agent.key}-base-url`,
        "Base URL",
        "留空则继承基础配置"
      );
      const apiKey = createAgentField(
        `cfg-agent-${agent.key}-api-key`,
        "API Key",
        "留空则继承基础配置"
      );
      const model = createAgentField(
        `cfg-agent-${agent.key}-model`,
        "Model",
        "留空则继承基础配置"
      );

      section.appendChild(baseUrl.wrapper);
      section.appendChild(apiKey.wrapper);
      section.appendChild(model.wrapper);
      panel.appendChild(section);
      elements.configAgentPanels.appendChild(panel);

      agentInputs[agent.key] = {
        tab,
        panel,
        baseUrl: baseUrl.input,
        apiKey: apiKey.input,
        model: model.input,
      };
    });
  }

  function renderModelSelect() {
    const config = getConfig();
    const options = getKnownModels().length ? getKnownModels() : [serverConfig.model];
    const currentModel = config.model || serverConfig.model;
    const isKnownModel = options.includes(currentModel);

    elements.cfgModelSelect.innerHTML = "";
    options.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      elements.cfgModelSelect.appendChild(option);
    });

    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "Custom...";
    elements.cfgModelSelect.appendChild(customOption);

    elements.cfgModelSelect.value = isKnownModel ? currentModel : "__custom__";
    elements.cfgModelCustomField.style.display = isKnownModel ? "none" : "flex";
  }

  function renderModelOptions(model) {
    const config = getConfig();
    const capability = getCurrentModelOptions(model);
    dynamicOptionInputs = {};
    elements.modelOptions.innerHTML = "";

    capability.options.forEach((option) => {
      const wrapper = document.createElement("label");
      wrapper.className = "field";

      const label = document.createElement("span");
      label.textContent = option.label;
      wrapper.appendChild(label);

      let input;
      if (option.type === "boolean" || option.type === "select") {
        input = document.createElement("select");
        const choices =
          option.type === "boolean"
            ? [
                { value: "true", label: "true" },
                { value: "false", label: "false" },
              ]
            : option.choices.map((choice) => ({ value: choice, label: choice }));
        choices.forEach((choice) => {
          const item = document.createElement("option");
          item.value = choice.value;
          item.textContent = choice.label;
          input.appendChild(item);
        });
        input.value = String(
          normalizeOptionValue(option, config[option.key] ?? option.defaultValue)
        );
      } else {
        input = document.createElement("input");
        input.type = option.type;
        if (option.min !== undefined) {
          input.min = String(option.min);
        }
        if (option.step !== undefined) {
          input.step = String(option.step);
        }
        input.value = String(
          normalizeOptionValue(option, config[option.key] ?? option.defaultValue)
        );
      }

      wrapper.appendChild(input);
      elements.modelOptions.appendChild(wrapper);
      dynamicOptionInputs[option.key] = { input, option };
    });
  }

  function hydrateForm() {
    const config = getConfig();
    elements.cfgBaseUrl.value = config.baseUrl;
    elements.cfgApiKey.value = config.apiKey;
    elements.cfgModel.value = config.model;
    renderModelSelect();
    renderModelOptions(config.model || serverConfig.model);

    agentDefinitions.forEach((agent) => {
      const override = config.agents?.[agent.key] || {};
      const input = agentInputs[agent.key];
      if (!input) {
        return;
      }
      input.baseUrl.value = override.baseUrl || "";
      input.apiKey.value = override.apiKey || "";
      input.model.value = override.model || "";

      const effective = buildEffectiveAgentConfig(agent.key);
      input.baseUrl.title = effective.baseUrl || "";
      input.apiKey.title = effective.apiKey ? "Using configured API key" : "";
      input.model.title = effective.model || "";
    });

    syncTabs();
  }

  function collectForm() {
    const config = getConfig();
    const nextConfig = {
      ...config,
      baseUrl: elements.cfgBaseUrl.value.trim(),
      apiKey: elements.cfgApiKey.value.trim(),
      model:
        elements.cfgModelSelect.value === "__custom__"
          ? elements.cfgModel.value.trim()
          : elements.cfgModelSelect.value,
      agents: createEmptyAgentOverrides(agentDefinitions),
    };

    const capability = getCurrentModelOptions(nextConfig.model);
    Object.keys(dynamicOptionInputs).forEach((key) => {
      const { input, option } = dynamicOptionInputs[key];
      nextConfig[key] = normalizeOptionValue(option, input.value);
    });

    capability.options.forEach((option) => {
      if (!(option.key in nextConfig)) {
        nextConfig[option.key] = option.defaultValue;
      }
    });

    agentDefinitions.forEach((agent) => {
      const input = agentInputs[agent.key];
      nextConfig.agents[agent.key] = {
        baseUrl: input.baseUrl.value.trim(),
        apiKey: input.apiKey.value.trim(),
        model: input.model.value.trim(),
      };
    });

    return nextConfig;
  }

  function setActiveTab(tab) {
    activeTab = tab;
    syncTabs();
  }

  return {
    collectForm,
    hydrateForm,
    renderAgentPanels,
    renderModelOptions,
    renderModelSelect,
    setActiveTab,
    syncTabs,
    updateConfig(nextConfig) {
      setConfig(nextConfig);
    },
  };
}
