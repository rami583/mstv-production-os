export const uiMotion = {
  duration: {
    short: 160,
    medium: 240,
  },
  easing: {
    standard: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  slide: {
    horizontal: "translate3d(10px, 0, 0)",
    vertical: "translate3d(0, 10px, 0)",
  },
  scale: {
    subtle: 0.985,
  },
} as const;

export const uiMotionClasses = {
  fadeIn: "mstv-motion-fade-in",
  slideVerticalIn: "mstv-motion-slide-vertical-in",
  slideHorizontalIn: "mstv-motion-slide-horizontal-in",
  scaleIn: "mstv-motion-scale-in",
  taskSurfaceIn: "mstv-motion-slide-horizontal-in",
  detailPanelIn: "mstv-motion-slide-vertical-in",
  modalBackdropIn: "mstv-motion-fade-in",
  modalPanelIn: "mstv-motion-scale-in",
} as const;

export function getUiMotionTransition(properties: string | string[], duration = uiMotion.duration.short) {
  const propertyList = Array.isArray(properties) ? properties : [properties];
  return propertyList.map((property) => `${property} ${duration}ms ${uiMotion.easing.standard}`).join(", ");
}
