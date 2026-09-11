// Centralized product switches. Backend validation remains enabled even when a UI feature is hidden.
export const FEATURES = {
  productionLots: {
    visible: false,
    enforceBackendRules: true,
  },
};

export const LOTS_FEATURE_ENABLED = FEATURES.productionLots.visible;
