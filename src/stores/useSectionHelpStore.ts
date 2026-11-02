import { create } from "zustand";

interface SectionHelpState {
  activeSectionId: string | null;
  openHelp: (sectionId: string) => void;
  closeHelp: () => void;
}

export const useSectionHelpStore = create<SectionHelpState>((set) => ({
  activeSectionId: null,
  openHelp: (sectionId: string) => set({ activeSectionId: sectionId }),
  closeHelp: () => set({ activeSectionId: null }),
}));
