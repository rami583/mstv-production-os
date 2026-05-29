// Shared overlay layer scale. Keep new floating UI on this scale instead of
// scattering one-off z-index values across modal, popover, and sheet surfaces.
export const mstvLayerZIndex = {
  modal: 40,
  elevatedModal: 60,
  datePicker: 70,
  popover: 75,
  notification: 80,
} as const;

export type MstvLayer = keyof typeof mstvLayerZIndex;

export const mstvLayerClassNames: Record<MstvLayer, string> = {
  modal: "z-40",
  elevatedModal: "z-[60]",
  datePicker: "z-[70]",
  popover: "z-[75]",
  notification: "z-[80]",
};
